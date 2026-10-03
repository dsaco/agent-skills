import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createClient, parse, plan } from '../scripts/fal.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildInput, models, defaults } from '../scripts/models.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1e0AAAAASUVORK5CYII=', 'base64');
const queue = 'https://queue.fal.run';
const media = 'https://fixture.fal.media';
const secret = 'fake-test-key-not-real';
function handle(endpoint) {
  const base = `${queue}/${endpoint}/requests/fixture-id`;
  return { request_id: 'fixture-id', status_url: `${base}/status`, response_url: base, cancel_url: `${base}/cancel` };
}

// Public for the isolated Electron fixture: route production URLs into a local server in test code only.
export async function exercise(directory) {
  const calls = []; let status = 'COMPLETED', badImage = false, queueFailure = false;
  let response = { images: [{ url: `${media}/one` }, { url: `${media}/two` }], unrelated: { url: 'https://never-download.invalid/no' } };
  const server = http.createServer(async (req, res) => {
    let raw = Buffer.alloc(0); for await (const chunk of req) raw = Buffer.concat([raw, chunk]);
    const url = new URL(req.url, 'http://local');
    const original = url.searchParams.get('target');
    calls.push({ target: original, method: req.method, authenticated: req.headers.authorization === `Key ${secret}`, size: raw.length, ...(req.method === 'POST' && original.startsWith(queue) ? { input: JSON.parse(raw.toString()) } : {}) });
    res.setHeader('Content-Type', 'application/json');
    if (original.includes('/storage/upload/initiate')) return res.end(JSON.stringify({ upload_url: `${media}/upload`, file_url: `${media}/reference` }));
    if (original === `${media}/upload`) { assert(raw.equals(png)); res.statusCode = 204; return res.end(); }
    if (original.startsWith(media)) { if (badImage && original.endsWith('/two')) { res.statusCode = 503; return res.end('remote body must stay private'); } return res.end(png); }
    if (req.method === 'POST') {
      if (queueFailure) { res.statusCode = 503; return res.end(secret); }
      return res.end(JSON.stringify(handle(original.slice(queue.length + 1))));
    }
    if (original.endsWith('/cancel')) return res.end(JSON.stringify({ status: 'CANCELLATION_REQUESTED' }));
    if (original.endsWith('/status')) return res.end(JSON.stringify({ status }));
    return res.end(JSON.stringify(response));
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const client = createClient({ key: secret, fetchImpl: (url, init) => fetch(`http://127.0.0.1:${server.address().port}/?target=${encodeURIComponent(url)}`, init) });
    const input = path.join(directory, 'reference.png'); await fs.writeFile(input, png);
    for (const [endpoint, model] of Object.entries(models)) {
      const task = model.task;
      const dir = path.join(directory, endpoint.replaceAll('/', '_'));
      const hasMask = endpoint === 'fal-ai/birefnet/v2';
      const singleImage = ['remove-background', 'image-to-depth', 'image-to-pose'].includes(task);
      const mediaCount = singleImage && !hasMask ? 1 : 2;
      response = singleImage ? { image: { url: `${media}/two` }, ...(hasMask ? { mask_image: { url: `${media}/one` } } : {}) } : { images: [{ url: `${media}/one` }, { url: `${media}/two` }], unrelated: { url: 'https://never-download.invalid/no' } };
      const prepared = await plan(task, { model: endpoint, ...(hasMask ? { 'output-mask': 'true' } : {}), ...(model.prompt ? { prompt: 'fixture' } : {}), ...(task === 'text-to-image' ? {} : { image: task === 'image-to-image' ? [input, 'https://example.com/second.png'] : [input] }), ...(task === 'image-to-pose' ? { 'draw-mode': 'full-pose' } : {}), ...(model.options['mask-url'] ? { 'mask-url': 'https://example.com/mask.png' } : {}), 'out-dir': dir });
      const submitted = await client.submit(prepared);
      const record = JSON.parse(await fs.readFile(submitted.requestFile));
      assert.equal(record.endpoint, endpoint);
      const submittedCall = calls.filter(call => call.method === 'POST' && call.target.startsWith(queue)).at(-1);
      assert.deepEqual(submittedCall.input, record.input);
      assert.equal(submittedCall.target, `${queue}/${endpoint}`);
      if (model.options['mask-url']) assert.equal(record.input.mask_url, 'https://example.com/mask.png');
      if (task === 'image-to-image') assert.deepEqual(record.input.image_urls, [`${media}/reference`, 'https://example.com/second.png']);
      if (singleImage) assert.deepEqual(record.input, { image_url: `${media}/reference`, ...(hasMask ? { output_mask: true } : {}), ...(task === 'image-to-pose' ? { draw_mode: 'full-pose' } : {}) });
      status = 'IN_QUEUE'; assert.equal((await client.result(submitted.requestFile)).downloaded, false);
      status = 'IN_PROGRESS'; assert.equal((await client.status(submitted.requestFile)).status, status);
      status = 'COMPLETED';
      badImage = true;
      await assert.rejects(client.result(submitted.requestFile), /部分媒体/);
      const partial = JSON.parse(await fs.readFile(path.join(dir, 'downloads.json'))); assert.equal(partial.saved.length, mediaCount - 1); assert.equal(partial.failures.length, 1); assert.equal(partial.failures[0].recoverable, true);
      badImage = false;
      const before = calls.filter(c => c.method === 'POST' && c.target.startsWith(queue)).length;
      const complete = await client.download(submitted.requestFile); assert.equal(complete.saved.length, mediaCount);
      if (singleImage) assert.equal(path.basename(complete.saved[0]), 'image.png');
      assert.equal(calls.filter(c => c.method === 'POST' && c.target.startsWith(queue)).length, before);
      assert((await fs.readFile(complete.saved[0])).equals(png));
      assert((await client.cancel(submitted.requestFile)).cancellationRequested);
      // No clobber when recovering downloads.
      await fs.writeFile(complete.saved[0], 'user modified');
      await assert.rejects(client.download(submitted.requestFile), /部分媒体/);
      assert.equal(await fs.readFile(complete.saved[0], 'utf8'), 'user modified');
      // A tampered job must never send the key to another origin.
      record.statusUrl = 'https://attacker.invalid/requests/fixture-id/status';
      await fs.writeFile(submitted.requestFile, JSON.stringify(record));
      const count = calls.length; await assert.rejects(client.status(submitted.requestFile), /不可信/); assert.equal(calls.length, count);
    }
    queueFailure = true;
    const uncertain = await plan('text-to-image', { prompt: 'fixture', 'out-dir': path.join(directory, 'uncertain') });
    const before = calls.length;
    await assert.rejects(client.submit(uncertain), error => error.message.includes('HTTP 503') && !error.message.includes(secret));
    assert.equal(calls.length, before + 1);
    const uncertainFile = path.join(uncertain.outDir, 'request.json');
    assert.equal(JSON.parse(await fs.readFile(uncertainFile)).phase, 'submitting');
    await assert.rejects(client.status(uncertainFile), /提交状态/);
    assert(calls.filter(c => c.target.startsWith(media)).every(c => !c.authenticated));
    assert(calls.filter(c => !c.target.startsWith(media)).every(c => c.authenticated));
    assert(!calls.some(c => c.target.includes('never-download')));
    return { endpoints: Object.keys(models).length, calls: calls.length, recoveryWithoutResubmit: true, rawKeyOnMediaRequests: false };
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('所有端点最小请求与显式参数，拒绝跨模型误用', async () => {
  assert.deepEqual(buildInput('text-to-image', { prompt: 'hello' }).input, { prompt: 'hello' });
  assert.equal(buildInput('text-to-image', { prompt: 'hello', seed: '0', 'limit-generations': 'false' }).input.seed, 0);
  assert.equal(buildInput('image-to-image', { prompt: 'hello', image: ['x'], 'limit-generations': 'false' }).input.limit_generations, false);
  for (const [endpoint, model] of Object.entries(models)) {
    const task = model.task;
    for (const [name, [field, type]] of Object.entries(model.options)) {
      const flags = { model: endpoint, ...(model.prompt ? { prompt: 'x' } : {}), ...(model.images ? { image: ['x'] } : {}) };
      const value = Array.isArray(type) ? type[0] : type === 'boolean' ? 'true' : type === 'image-size' ? '1024x1024' : type === 'https-url' ? 'https://example.com/mask.png' : type === 'text' ? 'system text' : '1';
      assert(Object.hasOwn(buildInput(task, { ...flags, ...(type === 'compression' ? { 'output-format': 'webp' } : {}), [name]: value }).input, field));
      assert.throws(() => buildInput(task, { ...flags, [name]: type === 'text' ? '' : 'INVALID' }));
    }
  }
  assert.throws(() => buildInput('text-to-image', { prompt: 'x', resolution: '8K' }));
  assert.throws(() => buildInput('text-to-image', { prompt: 'x', 'output-mask': 'true' }));
  assert.throws(() => buildInput('image-to-image', { prompt: 'x' }));
  assert.throws(() => buildInput('remove-background', { image: ['x', 'y'] }));
  assert.throws(() => buildInput('remove-background', { image: ['x'], 'operating-resolution': '2304x2304' }));
  assert.throws(() => buildInput('text-to-image', { prompt: 'x', model: 'unknown' }));
  assert.throws(() => parse(['text-to-image', '--prompt', 'x', '--prompt', 'y']));
  assert.throws(() => parse(['text-to-image', '--prompt']));
  assert.equal(parse(['text-to-image', '--seed', '-1']).flags.seed, '-1');
});

test('本机 HTTP：五类任务、上传、状态、完整与部分下载、恢复、取消、认证边界', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fal-tests-'));
  try { await exercise(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('独立 CLI 无密钥 dry-run 与错误退出', () => {
  const cli = fileURLToPath(new URL('../scripts/fal.mjs', import.meta.url));
  const env = { ...process.env }; delete env.FAL_KEY;
  const run = args => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(run(['--help']).status, 0);
  const valid = run(['text-to-image', '--prompt', '独立环境', '--dry-run']);
  assert.equal(valid.status, 0, valid.stderr); assert.equal(JSON.parse(valid.stdout).dryRun, true);
  const invalid = run(['text-to-image', '--prompt', 'x', '--resolution', '8K', '--dry-run']);
  assert.equal(invalid.status, 1); assert(invalid.stderr.includes('resolution'));
});

test('CLI 与客户端默认写入 cwd/output，显式 out-dir 不变', async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'fal-default-dir-')));
  const moduleUrl = new URL('../scripts/fal.mjs', import.meta.url).href;
  const endpoint = defaults['text-to-image'];
  const script = `
    import assert from 'node:assert/strict';
    const { main, createClient, plan } = await import(${JSON.stringify(moduleUrl)});
    globalThis.fetch = async (url, init) => {
      assert.equal(url, ${JSON.stringify(`${queue}/${endpoint}`)});
      assert.equal(init.method, 'POST');
      return new Response(${JSON.stringify(JSON.stringify(handle(endpoint)))});
    };
    await main(['text-to-image', '--prompt', 'fixture']);
    await createClient().submit(await plan('text-to-image', { prompt: 'fixture' }));
    await main(['text-to-image', '--prompt', 'fixture', '--out-dir', 'custom']);
  `;
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: dir, env: { ...process.env, HOME: dir, USERPROFILE: dir, FAL_KEY: secret }, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual((await fs.readdir(dir)).sort(), ['custom', 'output']);
    const jobs = await fs.readdir(path.join(dir, 'output'));
    assert.equal(jobs.length, 2);
    for (const job of jobs) assert.match(job, /^text-to-image-[a-f0-9-]+$/);
    for (const job of [...jobs.map(name => path.join(dir, 'output', name)), path.join(dir, 'custom')]) {
      const record = JSON.parse(await fs.readFile(path.join(job, 'request.json')));
      assert.equal(record.endpoint, endpoint); assert.equal(record.phase, 'submitted');
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('不完整结果、云端失败、操作 URL 与重定向边界', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fal-errors-'));
  const file = path.join(dir, 'request.json');
  const record = { version: 1, task: 'remove-background', endpoint: defaults['remove-background'], requestId: 'fixture-id', input: { output_mask: true }, ...Object.fromEntries(Object.entries(handle(defaults['remove-background'])).filter(([key]) => key !== 'request_id').map(([key, value]) => [key.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase()), value])) };
  let state = { status: 'COMPLETED' }, output = { image: { url: `${media}/one` } };
  const seen = [];
  const client = createClient({ key: secret, fetchImpl: async (url, init) => {
    assert.equal(init.redirect, 'error'); seen.push(url);
    return new Response(url.startsWith(media) ? png : JSON.stringify(url.endsWith('/status') ? state : output));
  } });
  try {
    await fs.writeFile(file, JSON.stringify(record));
    await assert.rejects(client.result(file), error => /上游结果缺少 mask/.test(error.message) && !/download/.test(error.message));
    const missingMask = JSON.parse(await fs.readFile(path.join(dir, 'downloads.json')));
    assert.equal(missingMask.failures[0].name, 'mask'); assert.equal(missingMask.failures[0].recoverable, false); assert.equal(missingMask.saved.length, 1);
    state = { status: 'COMPLETED', error: 'fixture failure' };
    await assert.rejects(client.result(file), /云端任务失败/);
    state = { status: 'UNKNOWN' }; await assert.rejects(client.status(file), /未知任务/);
    record.statusUrl += 'wrong-id-suffix'; await fs.writeFile(file, JSON.stringify(record));
    const count = seen.length; await assert.rejects(client.status(file), /不符/); assert.equal(seen.length, count);
    record.statusUrl = handle(record.endpoint).status_url;
    record.task = 'text-to-image'; record.endpoint = defaults[record.task]; record.input = { num_images: 2 };
    await fs.writeFile(file, JSON.stringify(record));
    state = { status: 'COMPLETED' }; output = { images: [{ url: `${media}/one` }] };
    await assert.rejects(client.result(file), /上游结果缺少 image-count/);
    assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'downloads.json'))).failures[0].recoverable, false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('dry-run 本地图片验证与缺少密钥不产生提交目录', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fal-plan-'));
  try {
    const input = path.join(dir, 'sample.png'); await fs.writeFile(input, png);
    const prepared = await plan('image-to-image', { image: [input], prompt: 'x', 'out-dir': path.join(dir, 'output') });
    assert.equal(prepared.inputs[0].mime, 'image/png');
    await assert.rejects(createClient({ key: '' }).submit(prepared), /FAL_KEY/);
    await assert.rejects(fs.stat(prepared.outDir), { code: 'ENOENT' });
    await fs.writeFile(input, 'not image'); await assert.rejects(plan('image-to-image', { image: [input], prompt: 'x' }));
    await assert.rejects(plan('image-to-image', { image: ['http://example.com/x.png'], prompt: 'x' }));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('16 个端点白名单、尺寸、透明、压缩、遮罩与模型隔离', () => {
  assert.equal(Object.keys(models).length, 16);
  assert.equal(Object.values(models).filter(model => model.task === 'text-to-image').length, 6);
  assert.equal(Object.values(models).filter(model => model.task === 'image-to-image').length, 6);
  assert.equal(Object.values(models).filter(model => model.task === 'remove-background').length, 2);
  assert.equal(Object.values(models).filter(model => model.task === 'image-to-depth').length, 1);
  assert.equal(Object.values(models).filter(model => model.task === 'image-to-pose').length, 1);
  for (const [endpoint, model] of Object.entries(models)) {
    const flags = { model: endpoint, ...(model.prompt ? { prompt: 'x' } : {}), ...(model.images ? { image: ['https://example.com/a.png'] } : {}) };
    assert.deepEqual(buildInput(model.task, flags).input, model.prompt ? { prompt: 'x' } : {});
    assert.throws(() => buildInput(model.task, { ...flags, 'sync-mode': 'true' }));
    if (model.task === 'image-to-image') {
      assert.throws(() => buildInput(model.task, { ...flags, image: [] }));
      assert.throws(() => buildInput(model.task, { ...flags, image: Array(17).fill('x') }));
      assert.equal(buildInput(model.task, { ...flags, image: Array(16).fill('x') }).images.length, 16);
    }
    for (const [name, [, values]] of Object.entries(model.options)) {
      if (Array.isArray(values)) for (const value of values) {
        const extra = name === 'operating-resolution' && value === '2304x2304' ? { 'birefnet-model': 'General Use (Dynamic)' } : {};
        assert.doesNotThrow(() => buildInput(model.task, { ...flags, ...extra, [name]: value }));
      }
    }
    if (endpoint.startsWith('openai/')) {
      for (const size of ['1024x1024', '2560x1440', '3840x2160']) assert.equal(typeof buildInput(model.task, { ...flags, 'image-size': size }).input.image_size, 'object');
      for (const size of ['0x0', '1025x1024', '512x512', '4096x2048', '2560x3840', '3840x960']) assert.throws(() => buildInput(model.task, { ...flags, 'image-size': size }));
      assert.throws(() => buildInput(model.task, { ...flags, background: 'transparent', 'output-format': 'jpeg' }));
      assert.throws(() => buildInput(model.task, { ...flags, resolution: '2K' }));
      assert.throws(() => buildInput(model.task, { ...flags, seed: '1' }));
      if (endpoint.includes('2.5')) {
        for (const compression of ['0', '100']) assert.equal(buildInput(model.task, { ...flags, 'output-format': 'webp', 'output-compression': compression }).input.output_compression, Number(compression));
        for (const compression of ['-1', '101', '1.5']) assert.throws(() => buildInput(model.task, { ...flags, 'output-format': 'webp', 'output-compression': compression }));
        assert.throws(() => buildInput(model.task, { ...flags, 'output-compression': '50' }));
      } else assert.throws(() => buildInput(model.task, { ...flags, quality: 'max' }));
      if (model.task === 'image-to-image') {
        assert.equal(buildInput(model.task, { ...flags, 'mask-url': 'https://example.com/mask.png' }).input.mask_url, 'https://example.com/mask.png');
        for (const mask of ['mask.png', 'http://example.com/x', 'https://user:secret@example.com/x']) assert.throws(() => buildInput(model.task, { ...flags, 'mask-url': mask }));
      }
    }
  }
  for (const endpoint of ['fal-ai/gpt-image-1.5', 'fal-ai/gpt-image-1.5/edit', 'openai/gpt-image-2.5', 'constructor']) assert.throws(() => buildInput('text-to-image', { model: endpoint, prompt: 'x' }));
  assert.throws(() => buildInput('text-to-image', { model: 'openai/gpt-image-2/edit', prompt: 'x' }));
  assert.throws(() => buildInput('text-to-image', { model: 'fal-ai/nano-banana', prompt: 'x', 'aspect-ratio': 'auto' }));
  assert.throws(() => buildInput('image-to-image', { model: 'fal-ai/nano-banana-pro/edit', prompt: 'x', image: ['x'], resolution: '0.5K' }));
  assert.throws(() => buildInput('remove-background', { model: 'fal-ai/ideogram/remove-background', image: ['x'], 'output-mask': 'true' }));
});

test('结构图：单图、无 prompt、完整 DWPose 枚举、默认值省略与任务隔离', () => {
  const endpoints = { 'image-to-depth': 'fal-ai/image-preprocessors/depth-anything/v2', 'image-to-pose': 'fal-ai/dwpose' };
  for (const [task, endpoint] of Object.entries(endpoints)) {
    assert.equal(defaults[task], endpoint);
    assert.deepEqual(buildInput(task, { image: ['input.png'] }), { endpoint, input: {}, images: ['input.png'] });
    for (const image of [[], ['a.png', 'b.png']]) assert.throws(() => buildInput(task, { image }));
    assert.throws(() => buildInput(task, { image: ['input.png'], prompt: 'x' }), /不接受 --prompt/);
    for (const [name, value] of Object.entries({ resolution: '1K', 'num-images': '2', 'output-format': 'png', 'output-mask': 'true', preprocess: 'depth', seed: '0' })) {
      assert.throws(() => buildInput(task, { image: ['input.png'], [name]: value }), /不支持/);
    }
    const other = task === 'image-to-depth' ? endpoints['image-to-pose'] : endpoints['image-to-depth'];
    assert.throws(() => buildInput(task, { image: ['input.png'], model: other }));
    assert.throws(() => buildInput('remove-background', { image: ['input.png'], model: endpoint }));
  }
  for (const mode of ['full-pose', 'body-pose', 'face-pose', 'hand-pose', 'face-hand-mask', 'face-mask', 'hand-mask']) {
    assert.deepEqual(buildInput('image-to-pose', { image: ['input.png'], 'draw-mode': mode }).input, { draw_mode: mode });
  }
  assert.throws(() => buildInput('image-to-pose', { image: ['input.png'], 'draw-mode': 'openpose' }), /draw-mode/);
  assert.throws(() => buildInput('image-to-depth', { image: ['input.png'], 'draw-mode': 'body-pose' }), /draw-mode/);
});

test('结构图 CLI：本地／远程无 Key dry-run、不写产物、参数错误非零退出', async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'fal-structure-cli-')));
  const cli = fileURLToPath(new URL('../scripts/fal.mjs', import.meta.url));
  const env = { ...process.env, HOME: dir, USERPROFILE: dir }; delete env.FAL_KEY;
  const run = args => spawnSync(process.execPath, [cli, ...args], { cwd: dir, env, encoding: 'utf8', timeout: 10000 });
  try {
    await fs.writeFile(path.join(dir, 'source.png'), png);
    for (const [task, endpoint] of [['image-to-depth', 'fal-ai/image-preprocessors/depth-anything/v2'], ['image-to-pose', 'fal-ai/dwpose']]) {
      const local = run([task, '--image', 'source.png', '--dry-run']);
      assert.equal(local.status, 0, local.stderr);
      const planned = JSON.parse(local.stdout);
      assert.equal(planned.endpoint, endpoint); assert.deepEqual(planned.input, {});
      assert.equal(planned.inputs[0].file, path.join(dir, 'source.png')); assert.equal(planned.dryRun, true);
      const remote = run([task, '--image', 'https://never-fetch.invalid/source.png', '--out-dir', 'output', '--dry-run']);
      assert.equal(remote.status, 0, remote.stderr); assert.equal(JSON.parse(remote.stdout).remoteMediaValidated, false);
      for (const args of [[], ['--image', 'source.png', '--prompt', 'x'], ['--image', 'source.png', '--image', 'source.png']]) {
        assert.equal(run([task, ...args, '--dry-run']).status, 1);
      }
      const noKey = run([task, '--image', 'source.png', '--out-dir', 'output']);
      assert.equal(noKey.status, 1); assert.match(noKey.stderr, /FAL_KEY/);
    }
    const pose = run(['image-to-pose', '--image', 'source.png', '--draw-mode', 'full-pose', '--dry-run']);
    assert.equal(pose.status, 0, pose.stderr); assert.deepEqual(JSON.parse(pose.stdout).input, { draw_mode: 'full-pose' });
    assert.equal(run(['image-to-depth', '--image', 'source.png', '--draw-mode', 'full-pose', '--dry-run']).status, 1);
    assert.deepEqual(await fs.readdir(dir), ['source.png']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('结构图缺少 image 时记不可恢复失败，不误下载 images／关键点，不重提', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fal-structure-missing-'));
  try {
    for (const task of ['image-to-depth', 'image-to-pose']) {
      const endpoint = defaults[task];
      const calls = [];
      const client = createClient({ key: secret, fetchImpl: async (url, init) => {
        calls.push({ url, method: init.method });
        if (init.method === 'POST') return new Response(JSON.stringify(handle(endpoint)));
        if (url.endsWith('/status')) return new Response(JSON.stringify({ status: 'COMPLETED' }));
        return new Response(JSON.stringify({ images: [{ url: `${media}/never-download` }], keypoints: [{ x: 1, y: 2 }] }));
      } });
      const submitted = await client.submit(await plan(task, { image: ['https://example.com/source.png'], 'out-dir': path.join(dir, task) }));
      const record = JSON.parse(await fs.readFile(submitted.requestFile));
      assert.deepEqual(record.input, { image_url: 'https://example.com/source.png' });
      await assert.rejects(client.result(submitted.requestFile), /上游结果缺少 image/);
      const downloads = JSON.parse(await fs.readFile(path.join(dir, task, 'downloads.json')));
      assert.deepEqual(downloads.saved, []); assert.equal(downloads.failures.length, 1);
      assert.equal(downloads.failures[0].name, 'image'); assert.equal(downloads.failures[0].recoverable, false);
      const before = calls.length;
      await assert.rejects(client.download(submitted.requestFile), /上游结果缺少 image/);
      assert.equal(calls.length, before); assert.equal(calls.filter(call => call.method === 'POST').length, 1);
      assert(!calls.some(call => call.url.startsWith(media)));
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('Ideogram 本地 10 MB 上限在 plan 和提交前均检查，不继承 BiRefNet 20 MiB', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fal-ideogram-'));
  try {
    const image = path.join(dir, 'large.png');
    await fs.writeFile(image, Buffer.concat([png, Buffer.alloc(10_000_000 - png.length)]));
    const flags = { model: 'fal-ai/ideogram/remove-background', image: [image], 'out-dir': path.join(dir, 'out') };
    const prepared = await plan('remove-background', flags);
    await fs.appendFile(image, Buffer.from([0]));
    await assert.rejects(plan('remove-background', flags), /10000000/);
    await assert.rejects(createClient({ key: secret, fetchImpl: () => { throw Error('must not call'); } }).submit(prepared), /发生变化/);
    assert.equal((await plan('remove-background', { image: [image] })).endpoint, 'fal-ai/birefnet/v2');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
