import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fail } from './errors.mjs';
import { endpointId, pointer, escapePointer, contractFromModel, validate, outputFiles } from './schema.mjs';

const API = 'https://api.fal.ai/v1', QUEUE = 'https://queue.fal.run', REST = 'https://rest.fal.ai';
const MAX_JSON = 16 * 1024 * 1024, MAX_UPLOAD = 100 * 1024 * 1024, MAX_DOWNLOAD = 1024 * 1024 * 1024;
export function httpsUrl(value, origin) {
  let u; try { u = new URL(value); } catch { fail('无效 HTTPS URL。'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.hash || (origin && u.origin !== origin)) fail('拒绝不可信服务 URL。');
  return u;
}
async function regular(file) { if (!(await fs.lstat(file)).isFile()) fail('需要普通文件，不接受目录或符号链接。'); }
export async function readJson(file) {
  await regular(file);
  if ((await fs.stat(file)).size > MAX_JSON) fail('JSON 文件超过 16 MiB。');
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { fail('文件不是有效 JSON。'); }
}
export async function writeJson(file, value, exclusive = false) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    if (exclusive) await fs.link(tmp, file); else await fs.rename(tmp, file);
  } finally { await fs.rm(tmp, { force: true }); }
}
async function hashFile(file) { const hash = createHash('sha256'); for await (const b of createReadStream(file)) hash.update(b); return hash.digest('hex'); }
function handleUrl(value, id) {
  const u = httpsUrl(value, QUEUE);
  if (!new RegExp(`/requests/${id}(?:/(?:status|response|cancel))?$`).test(u.pathname)) fail('操作 URL 与 request_id 不符。');
  return u.href;
}
async function localInputs(value, inputs, at = '', depth = 0) {
  if (depth > 64) fail('输入嵌套过深。');
  if (value && typeof value === 'object' && Object.hasOwn(value, '$file')) {
    if (Object.keys(value).some(k => !['$file', 'content_type'].includes(k)) || typeof value.$file !== 'string') fail('$file 对象只接受本地路径与可选 content_type。');
    const file = path.resolve(value.$file); await regular(file);
    const size = (await fs.stat(file)).size;
    if (!size || size > MAX_UPLOAD) fail('本地上传文件必须非空且不超过 100 MiB。');
    const contentType = value.content_type ?? 'application/octet-stream';
    if (!/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) fail('content_type 必须为 MIME 类型。');
    inputs.push({ pointer: at, file, size, contentType, sha256: await hashFile(file) });
    return 'https://local-input.invalid/pending-upload';
  }
  if (Array.isArray(value)) { const values = []; for (let i = 0; i < value.length; i++) values.push(await localInputs(value[i], inputs, `${at}/${i}`, depth + 1)); return values; }
  if (value && typeof value === 'object') {
    const entries = [];
    // Stable traversal preserves reference order and upload receipts.
    for (const [k, v] of Object.entries(value)) entries.push([k, await localInputs(v, inputs, `${at}/${escapePointer(k)}`, depth + 1)]);
    return Object.fromEntries(entries);
  }
  return value;
}
function setPointer(root, at, value) {
  const slash = at.lastIndexOf('/'), parent = pointer(root, at.slice(0, slash));
  const key = at.slice(slash + 1).replaceAll('~1', '/').replaceAll('~0', '~');
  Object.defineProperty(parent, key, { value, writable: true, enumerable: true, configurable: true });
}
const mimeExtensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/flac': '.flac', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'model/gltf-binary': '.glb', 'model/gltf+json': '.gltf', 'application/zip': '.zip', 'application/pdf': '.pdf' };
function extension(bytes, mime, url) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return '.jpg';
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return '.gif';
  if (bytes.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (mimeExtensions[mime]) return mimeExtensions[mime];
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '.bin';
}
export function createClient({ fetchImpl = fetch, key = process.env.FAL_KEY, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  async function http(url, options = {}, consume) {
    const target = httpsUrl(url), { authenticated = false, method = 'GET', body, contentType = 'application/json' } = options;
    const headers = {};
    if (authenticated) {
      if (![new URL(API).origin, QUEUE, REST].includes(target.origin)) fail('拒绝向非官方 API 发送密钥。');
      if (!key?.trim()) fail('缺少 FAL_KEY 环境变量。');
      headers.Authorization = `Key ${key.trim()}`;
    }
    if (body !== undefined) headers['Content-Type'] = contentType;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 120000);
    try {
      let res;
      try { res = await fetchImpl(target.href, { method, headers, body, redirect: 'error', signal: controller.signal }); }
      catch { fail('网络失败或超时；提交状态可能不明，请检查 request.json，勿自动重提。'); }
      if (!res.ok) { await res.body?.cancel(); fail(`fal HTTP ${res.status}；未自动重试。`); }
      if (consume) return await consume(res);
      const chunks = []; let size = 0;
      for await (const b of res.body ?? []) { size += b.length; if (size > MAX_JSON) fail('API 响应超过 16 MiB。'); chunks.push(b); }
      if (!size) return {};
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('API 返回无效 JSON。'); }
    } finally { clearTimeout(timer); }
  }
  async function search({ query, category, cursor, limit = 10 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail('limit 需要 1–50 的整数。');
    const q = new URLSearchParams({ limit: String(limit) });
    if (query) q.set('q', query); if (category) q.set('category', category); if (cursor) q.set('cursor', cursor);
    return http(`${API}/models?${q}`);
  }
  async function schema(endpoint) {
    endpointId(endpoint);
    const q = new URLSearchParams({ endpoint_id: endpoint, expand: 'openapi-3.0' });
    const data = await http(`${API}/models?${q}`);
    return contractFromModel(data.models?.find(m => m.endpoint_id === endpoint), endpoint);
  }
  async function prepare({ endpoint, inputFile, schemaFile, outputs = [] }) {
    endpointId(endpoint);
    for (const p of outputs) pointer({}, p);
    const raw = await readJson(inputFile);
    if (!raw || Array.isArray(raw) || typeof raw !== 'object') fail('模型输入必须是 JSON 对象。');
    const inputs = [], input = await localInputs(raw, inputs);
    const contract = schemaFile ? await readJson(schemaFile) : await schema(endpoint);
    if (contract.version !== 1 || contract.endpoint !== endpoint || !contract.inputSchema || !contract.outputSchema || !contract.openapi) fail('schema 快照格式或端点不匹配。');
    const checked = validate(input, contract.inputSchema, contract.openapi);
    if (checked.errors.length) fail(`参数校验失败：\n${checked.errors.join('\n')}`);
    return { endpoint, input, inputs, outputs, contract, warnings: checked.warnings, remoteMediaValidated: false, schemaSource: schemaFile ? 'snapshot' : 'live' };
  }
  async function submit(options) {
    if (!key?.trim()) fail('缺少 FAL_KEY 环境变量；未上传或提交。');
    if (options.schemaFile) fail('实际提交必须读取最新 schema；--schema 仅用于离线 dry-run。');
    const p = await prepare(options);
    const dir = options.outDir ? path.resolve(options.outDir) : path.resolve('output', `fal-${randomUUID()}`);
    await fs.mkdir(path.dirname(dir), { recursive: true }); await fs.mkdir(dir);
    const requestFile = path.join(dir, 'request.json');
    const record = { version: 2, endpoint: p.endpoint, phase: 'preparing', createdAt: new Date().toISOString(), input: p.input, outputs: p.outputs, uploads: [], warnings: p.warnings };
    await writeJson(path.join(dir, 'schema.json'), p.contract);
    await writeJson(requestFile, record);
    for (const local of p.inputs) {
      await regular(local.file);
      const bytes = await fs.readFile(local.file);
      if (bytes.length !== local.size || createHash('sha256').update(bytes).digest('hex') !== local.sha256) fail('本地素材在预检后发生变化；未提交生成。');
      const receipt = { pointer: local.pointer, size: local.size, sha256: local.sha256, phase: 'preparing' };
      record.uploads.push(receipt); await writeJson(requestFile, record);
      const uploaded = await http(`${REST}/storage/upload/initiate?storage_type=fal-cdn-v3`, { authenticated: true, method: 'POST', body: JSON.stringify({ file_name: path.basename(local.file), content_type: local.contentType }) });
      httpsUrl(uploaded.file_url); httpsUrl(uploaded.upload_url);
      receipt.fileUrl = uploaded.file_url; receipt.phase = 'uploading'; await writeJson(requestFile, record);
      await http(uploaded.upload_url, { method: 'PUT', contentType: local.contentType, body: bytes }, async res => { await res.body?.cancel(); });
      receipt.phase = 'uploaded'; setPointer(record.input, local.pointer, uploaded.file_url); await writeJson(requestFile, record);
    }
    const checked = validate(record.input, p.contract.inputSchema, p.contract.openapi);
    if (checked.errors.length) fail(`上传后参数不符合 schema：\n${checked.errors.join('\n')}`);
    record.phase = 'submitting'; await writeJson(requestFile, record);
    const accepted = await http(`${QUEUE}/${p.endpoint}`, { authenticated: true, method: 'POST', body: JSON.stringify(record.input) });
    if (!/^[a-zA-Z0-9_-]+$/.test(accepted.request_id ?? '')) fail('提交响应缺少 request_id；请核查控制台，不要重提。');
    record.requestId = accepted.request_id; record.phase = 'submitted'; await writeJson(requestFile, record);
    for (const [dest, source] of [['statusUrl', 'status_url'], ['responseUrl', 'response_url'], ['cancelUrl', 'cancel_url']]) record[dest] = handleUrl(accepted[source], record.requestId);
    await writeJson(requestFile, record);
    return { requestFile, requestId: record.requestId, phase: record.phase, warnings: record.warnings };
  }
  async function load(file) {
    const r = await readJson(file);
    if (r.version !== 2) fail('只支持当前通用生成版本的 request.json。');
    endpointId(r.endpoint);
    if (!/^[a-zA-Z0-9_-]+$/.test(r.requestId ?? '')) fail('提交状态未确定；保留记录，核查控制台，不要自动重提。');
    for (const field of ['statusUrl', 'responseUrl', 'cancelUrl']) handleUrl(r[field], r.requestId);
    return r;
  }
  async function status(file) {
    const r = await load(file), state = await http(r.statusUrl, { authenticated: true });
    await writeJson(path.join(path.dirname(file), 'status.json'), state);
    if (!['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED'].includes(state.status)) fail('未知队列状态，已保存 status.json。');
    return { requestId: r.requestId, status: state.status, failed: Boolean(state.error || state.error_type) };
  }
  async function cancel(file) {
    const r = await load(file), reply = await http(r.cancelUrl, { authenticated: true, method: 'PUT' });
    await writeJson(path.join(path.dirname(file), 'cancel.json'), reply);
    return { requestId: r.requestId, cancellationRequested: reply.status === 'CANCELLATION_REQUESTED', note: '以 cancel.json 响应为准；接受取消不保证停止执行或不计费。' };
  }
  async function download(file, selected) {
    const r = await load(file), dir = path.dirname(file), raw = await readJson(path.join(dir, 'result.json'));
    const contract = await readJson(path.join(dir, 'schema.json'));
    const { found, missing } = outputFiles(raw, contract, selected ?? r.outputs);
    const validation = validate(raw, contract.outputSchema, contract.openapi);
    const saved = [], failures = missing.map(p => ({ pointer: p, reason: '选定输出缺失或不是 HTTPS 文件。', recoverable: false }));
    for (const message of validation.errors) failures.push({ reason: message, recoverable: false });
    for (const entry of found) {
      const token = createHash('sha256').update(entry.pointer).digest('hex').slice(0, 16);
      const tmp = path.join(dir, `.media-${randomUUID()}.part`);
      try {
        const info = await http(entry.url, {}, async res => {
          if (Number(res.headers.get('content-length')) > MAX_DOWNLOAD) fail('下载超过 1 GiB。');
          const out = await fs.open(tmp, 'wx', 0o600); let size = 0, head = Buffer.alloc(0); const hash = createHash('sha256');
          try {
            for await (const chunk of res.body ?? []) {
              const b = Buffer.from(chunk); size += b.length; if (size > MAX_DOWNLOAD) fail('下载超过 1 GiB。');
              if (head.length < 64) head = Buffer.concat([head, b.subarray(0, 64 - head.length)]);
              hash.update(b); await out.writeFile(b);
            }
          } finally { await out.close(); }
          if (!size) fail('媒体文件为空。');
          const mime = (res.headers.get('content-type') ?? entry.contentType ?? '').split(';')[0];
          return { size, sha256: hash.digest('hex'), extension: extension(head, mime, entry.url) };
        });
        const target = path.join(dir, `media-${token}${info.extension}`);
        try { await fs.link(tmp, target); }
        catch (e) { if (e.code !== 'EEXIST') throw e; await regular(target); if ((await fs.stat(target)).size !== info.size || await hashFile(target) !== info.sha256) fail('已有文件内容不同，未覆盖。'); }
        saved.push({ pointer: entry.pointer, path: target, size: info.size, sha256: info.sha256 });
      } catch (e) { failures.push({ pointer: entry.pointer, reason: e.name === 'InputError' ? e.message : '传输或本地文件操作失败。', recoverable: true }); }
      finally { await fs.rm(tmp, { force: true }); }
    }
    const summary = { requestId: r.requestId, resultFile: path.join(dir, 'result.json'), saved, failures, warnings: validation.warnings, delivery: failures.length ? 'partial' : found.length ? 'downloaded' : 'json_only', mediaChecks: '文件非空与传输哈希；尺寸、帧数、Alpha、时长及内容需要实际解码验收。' };
    await writeJson(path.join(dir, 'downloads.json'), summary);
    return summary;
  }
  async function result(file) {
    const state = await status(file);
    if (state.status !== 'COMPLETED') return { ...state, downloaded: false };
    if (state.failed) fail('云端任务失败，详见 status.json；未重新提交。');
    const r = await load(file), raw = await http(r.responseUrl, { authenticated: true });
    await writeJson(path.join(path.dirname(file), 'result.json'), raw);
    return download(file);
  }
  async function wait(file, { timeout = 40, interval = 5 } = {}) {
    if (!Number.isFinite(timeout) || timeout < 0 || timeout > 40 || !Number.isFinite(interval) || interval < 1 || interval > 30) fail('timeout 需要 0–40 秒，interval 需要 1–30 秒。');
    const until = Date.now() + timeout * 1000;
    for (;;) {
      const state = await result(file);
      if (state.status === undefined || state.status === 'COMPLETED' || Date.now() >= until) return state;
      await sleep(Math.min(interval * 1000, until - Date.now()));
    }
  }
  return { search, schema, prepare, submit, status, result, download, cancel, wait };
}
