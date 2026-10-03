import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { models, defaults, getModel, buildInput } from './models.mjs';
import { InputError, fail } from './errors.mjs';

const QUEUE = 'https://queue.fal.run';
const REST = 'https://rest.fal.ai';
const MAX_IMAGE = 20 * 1024 * 1024; // Local product bound, not an upstream guarantee.
const MAX_DOWNLOAD = 100 * 1024 * 1024;
const mimeExtensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
const extensions = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
function mediaType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'image/gif';
  fail('媒体不是可识别的 PNG/JPEG/WebP/GIF；未作为图片保存。');
}
function httpsUrl(value, origin) {
  let url; try { url = new URL(value); } catch { fail('服务返回的 URL 无效。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (origin && url.origin !== origin)) fail('拒绝不可信服务 URL。');
  return url;
}
function operationUrl(value, requestId) {
  const url = httpsUrl(value, QUEUE);
  if (!new RegExp(`/requests/${requestId}(?:/(?:status|response|cancel))?$`).test(url.pathname)) fail('请求操作 URL 与 request_id 不符。');
  return url.href;
}
async function bytesBounded(response, maximum) {
  if (Number(response.headers.get('content-length')) > maximum) { await response.body?.cancel(); fail('响应超过大小限制。'); }
  if (!response.body) return Buffer.alloc(0);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > maximum) fail('响应超过大小限制。'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function atomicJson(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}
async function regular(file) { if (!(await fs.lstat(file)).isFile()) fail('输入必须是普通文件，不能是目录或符号链接。'); }
export async function plan(task, flags) {
  const built = buildInput(task, flags);
  const maximum = getModel(task, built.endpoint).maxImageBytes ?? MAX_IMAGE;
  const inputs = [];
  for (const image of built.images) {
    if (/^https:\/\//.test(image)) { httpsUrl(image); inputs.push({ url: image }); continue; }
    if (/^[a-z][a-z0-9+.-]*:/i.test(image) && !/^[a-z]:[\\/]/i.test(image)) fail('远程素材仅接受 HTTPS URL；不接受 data URI。');
    const file = path.resolve(image); await regular(file);
    const stat = await fs.stat(file);
    if (!stat.size || stat.size > maximum) fail(`本地参考图必须非空且不超过 ${maximum} 字节。`);
    const bytes = await fs.readFile(file);
    const mime = mediaType(bytes);
    if (!extensions[path.extname(file).toLowerCase()] || extensions[path.extname(file).toLowerCase()] !== mime) fail('参考图扩展名与实际图片类型不符。');
    inputs.push({ file, mime, size: bytes.length });
  }
  return { task, endpoint: built.endpoint, input: built.input, inputs, outDir: flags['out-dir'] ? path.resolve(flags['out-dir']) : null };
}

// Injectable transport is for tests, never configurable through CLI/environment.
export function createClient({ fetchImpl = fetch, key = process.env.FAL_KEY } = {}) {
  async function request(url, { authenticated = false, method = 'GET', body, json = true, maximum = 2 * 1024 * 1024, contentType } = {}) {
    const target = httpsUrl(url);
    const headers = {};
    if (authenticated) {
      if (![QUEUE, REST].includes(target.origin)) fail('拒绝向非官方 API 发送密钥。');
      if (!key?.trim()) fail('缺少 FAL_KEY 环境变量；请在本地环境配置，不要在聊天中发送密钥。');
      headers.Authorization = `Key ${key.trim()}`;
    }
    if (body !== undefined) headers['Content-Type'] = contentType ?? 'application/json';
    // One bounded network operation, not a deadline for the chat or cloud task.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      let response;
      try { response = await fetchImpl(target.href, { method, headers, body, redirect: 'error', signal: controller.signal }); }
      catch { fail('网络请求失败或超时；未自动重试。提交阶段请先核查任务，不要盲目重提。'); }
      if (!response.ok) { await response.body?.cancel(); fail(`服务返回 HTTP ${response.status}；未自动重试。`); }
      const bytes = await bytesBounded(response, maximum);
      if (!json) return bytes;
      try { return JSON.parse(bytes.toString('utf8')); } catch { fail('服务返回无效 JSON。'); }
    } finally { clearTimeout(timer); }
  }
  async function submit(prepared) {
    const maximum = getModel(prepared.task, prepared.endpoint).maxImageBytes ?? MAX_IMAGE;
    if (!key?.trim()) fail('缺少 FAL_KEY 环境变量；未上传或提交。');
    const out = prepared.outDir ?? path.resolve('output', `${prepared.task}-${randomUUID()}`);
    // A new directory per submission prevents overwrites/reusing an uncertain submission.
    await fs.mkdir(path.dirname(out), { recursive: true }); await fs.mkdir(out);
    const recordFile = path.join(out, 'request.json');
    const record = { version: 1, task: prepared.task, endpoint: prepared.endpoint, phase: 'preparing', input: prepared.input };
    await atomicJson(recordFile, record);
    const urls = [];
    for (const input of prepared.inputs) {
      if (input.url) { urls.push(input.url); continue; }
      await regular(input.file);
      const bytes = await fs.readFile(input.file);
      if (!bytes.length || bytes.length > maximum || mediaType(bytes) !== input.mime) fail('参考图在校验后发生变化或超过限制。');
      const upload = await request(`${REST}/storage/upload/initiate?storage_type=fal-cdn-v3`, { authenticated: true, method: 'POST', body: JSON.stringify({ file_name: path.basename(input.file), content_type: input.mime }) });
      httpsUrl(upload.file_url); httpsUrl(upload.upload_url);
      await request(upload.upload_url, { method: 'PUT', body: bytes, contentType: input.mime, json: false });
      urls.push(upload.file_url);
    }
    if (prepared.task === 'image-to-image') record.input = { ...record.input, image_urls: urls };
    if (['remove-background', 'image-to-depth', 'image-to-pose'].includes(prepared.task)) record.input = { ...record.input, image_url: urls[0] };
    record.phase = 'submitting'; await atomicJson(recordFile, record);
    // No auto retry. A crash or failed response here leaves a visibly uncertain submission.
    const submitted = await request(`${QUEUE}/${record.endpoint}`, { method: 'POST', authenticated: true, body: JSON.stringify(record.input) });
    if (typeof submitted.request_id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(submitted.request_id)) fail('提交响应缺少有效 request_id；请核查 fal 控制台。');
    // Persist ID before validating optional operation URLs, so malformed responses do not lose it.
    record.requestId = submitted.request_id; record.phase = 'submitted';
    await atomicJson(recordFile, record);
    record.statusUrl = operationUrl(submitted.status_url, record.requestId);
    record.responseUrl = operationUrl(submitted.response_url, record.requestId);
    record.cancelUrl = operationUrl(submitted.cancel_url, record.requestId);
    await atomicJson(recordFile, record);
    return { requestFile: recordFile, requestId: record.requestId, phase: record.phase };
  }
  async function load(file) {
    await regular(file);
    if ((await fs.stat(file)).size > 2 * 1024 * 1024) fail('任务记录过大。');
    let record; try { record = JSON.parse(await fs.readFile(file, 'utf8')); } catch { fail('无法解析任务记录。'); }
    if (record.version !== 1) fail('任务记录格式无效。');
    getModel(record.task, record.endpoint);
    if (!/^[a-zA-Z0-9_-]+$/.test(record.requestId ?? '')) fail('尚无请求 ID，提交状态可能不明；先核查 fal 控制台，不自动重新提交。');
    for (const field of ['statusUrl', 'responseUrl', 'cancelUrl']) operationUrl(record[field], record.requestId);
    return record;
  }
  async function status(file) {
    const record = await load(file);
    const state = await request(record.statusUrl, { authenticated: true });
    if (!['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED'].includes(state.status)) fail('服务返回未知任务状态。');
    await atomicJson(path.join(path.dirname(file), 'status.json'), state);
    return { requestId: record.requestId, status: state.status, failed: Boolean(state.error || state.error_type) };
  }
  async function cancel(file) {
    const record = await load(file);
    const result = await request(record.cancelUrl, { authenticated: true, method: 'PUT' });
    if (result.status !== 'CANCELLATION_REQUESTED') fail('未确认服务接受取消请求。');
    await atomicJson(path.join(path.dirname(file), 'cancel.json'), result);
    return { requestId: record.requestId, cancellationRequested: true, note: '仅表示取消请求已接受，不保证已停止或不计费。' };
  }
  async function download(file, retry = false) {
    const record = await load(file); const dir = path.dirname(file);
    const resultFile = path.join(dir, 'result.json');
    let result;
    if (retry) {
      await regular(resultFile);
      if ((await fs.stat(resultFile)).size > 2 * 1024 * 1024) fail('结果文件过大。');
      result = JSON.parse(await fs.readFile(resultFile, 'utf8'));
    } else {
      const state = await status(file);
      if (state.status !== 'COMPLETED') return { ...state, downloaded: false };
      if (state.failed) fail('云端任务失败，详见 status.json；未重新提交。');
      result = await request(record.responseUrl, { authenticated: true });
      await atomicJson(resultFile, result);
    }
    let entries;
    if (['remove-background', 'image-to-depth', 'image-to-pose'].includes(record.task)) {
      entries = [{ name: 'image', file: result.image }];
      if (record.endpoint === 'fal-ai/birefnet/v2' && (result.mask_image || record.input.output_mask)) entries.push({ name: 'mask', file: result.mask_image });
    } else {
      if (!Array.isArray(result.images) || !result.images.length) fail('结果缺少 images 列表。');
      entries = result.images.map((file, index) => ({ name: `image-${index + 1}`, file }));
    }
    // recoverable=false: the upstream result never contained this output, so `download` cannot supply it.
    const saved = [], failures = [];
    if (['text-to-image', 'image-to-image'].includes(record.task) && record.input?.num_images && entries.length !== record.input.num_images) {
      failures.push({ name: 'image-count', reason: '返回图片数量与明确请求数量不一致。', recoverable: false });
    }
    for (const entry of entries) {
      if (!entry.file?.url) { failures.push({ name: entry.name, reason: '上游结果未包含此输出。', recoverable: false }); continue; }
      try {
        const bytes = await request(entry.file.url, { json: false, maximum: MAX_DOWNLOAD });
        const mime = mediaType(bytes); const target = path.join(dir, entry.name + mimeExtensions[mime]);
        // Never overwrite an existing different file, including on download recovery.
        const temporary = path.join(dir, `.${entry.name}-${randomUUID()}.part`);
        try {
          await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
          // Hard-link publishes only complete bytes and atomically refuses replacement.
          try { await fs.link(temporary, target); }
          catch (error) {
            if (error.code !== 'EEXIST') throw error;
            await regular(target);
            if ((await fs.stat(target)).size > MAX_DOWNLOAD || !(await fs.readFile(target)).equals(bytes)) fail('目标文件已存在且内容不同，未覆盖。');
          }
        } finally { await fs.rm(temporary, { force: true }); }
        saved.push(target);
      } catch (error) { failures.push({ name: entry.name, reason: error instanceof InputError ? error.message : '本地文件操作失败。', recoverable: true }); }
    }
    const summary = { requestId: record.requestId, saved, failures, mediaChecks: '仅检查文件签名及非空；未解码验证尺寸、Alpha 或视觉质量。' };
    await atomicJson(path.join(dir, 'downloads.json'), summary);
    const missing = failures.filter(item => !item.recoverable).map(item => item.name);
    const transfer = failures.filter(item => item.recoverable).map(item => item.name);
    if (failures.length) fail([
      missing.length ? `上游结果缺少 ${missing.join(', ')}；补下载无法补齐，是否重新生成由用户决定。` : '',
      transfer.length ? `部分媒体保存失败：${transfer.join(', ')}；成功文件保留，运行 download 补下载，勿重新生成。` : '',
    ].filter(Boolean).join(''));
    return summary;
  }
  return { submit, status, cancel, result: file => download(file), download: file => download(file, true) };
}

export function parse(argv) {
  const [task, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index++) {
    const name = rest[index]; if (!name.startsWith('--')) fail('参数必须使用 --名称 值。');
    const key = name.slice(2);
    if (key === 'dry-run') { if (flags[key]) fail('重复参数。'); flags[key] = true; continue; }
    const value = rest[++index]; if (value === undefined || value.startsWith('--')) fail(`${name} 缺少值。`);
    if (key === 'image') (flags.image ??= []).push(value);
    else { if (Object.hasOwn(flags, key)) fail(`重复参数 ${name}。`); flags[key] = value; }
  }
  return { task, flags };
}
export async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes('--help')) {
    console.log('node fal.mjs <text-to-image|image-to-image|remove-background|image-to-depth|image-to-pose> [--model endpoint] [--prompt text] [--image path-or-https-url ...] [--out-dir NEW-directory] [--dry-run]\nnode fal.mjs <status|result|download|cancel> --request path/to/request.json\n去背景、深度图与人体姿态图仅接受一张 --image，不接受 --prompt。所有布尔模型参数显式传 true/false。提交后立即返回请求记录，不自动等待或重提。');
    for (const [endpoint, model] of Object.entries(models)) console.log(`${model.task}: ${endpoint}${defaults[model.task] === endpoint ? ' (default)' : ''}\n  ${Object.entries(model.options).map(([name, [, type]]) => `--${name} ${Array.isArray(type) ? type.join('|') : type}`).join('\n  ')}`);
    return;
  }
  const { task, flags } = parse(argv);
  let result;
  if (Object.hasOwn(defaults, task)) {
    const prepared = await plan(task, flags);
    if (flags['dry-run']) result = { ...prepared, dryRun: true, remoteMediaValidated: false };
    else {
      prepared.outDir ??= path.resolve('output', `${prepared.task}-${randomUUID()}`);
      console.error(`计划任务目录：${prepared.outDir}（若提交失败，先检查此目录的 request.json）`);
      result = await createClient().submit(prepared);
    }
  } else {
    if (!['status', 'result', 'download', 'cancel'].includes(task)) fail('未知操作，使用 --help 查看。');
    if (Object.keys(flags).length !== 1 || !flags.request) fail('该操作仅接受 --request。');
    result = await createClient()[task](path.resolve(flags.request));
  }
  console.log(JSON.stringify(result, null, 2));
}
// Compare real paths: aliases/symlinks must not silently skip CLI execution.
const entryPath = process.argv[1] ? await fs.realpath(path.resolve(process.argv[1])).catch(() => null) : null;
if (entryPath && entryPath === await fs.realpath(fileURLToPath(import.meta.url))) {
  main().catch(error => { console.error(error instanceof InputError ? error.message : 'fal 操作失败。请检查本地文件、任务记录与下载清单；不要自动重新提交生成。'); process.exitCode = 1; });
}
