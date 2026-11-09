import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient, writeJson, readJson } from '../scripts/client.mjs';
import { contractFromModel, validate, outputFiles, pointer } from '../scripts/schema.mjs';

const endpoint = 'future-provider/new-model-v99/edit';
const secret = 'fake-key-only-for-tests';
const queue = 'https://queue.fal.run';
const cdn = 'https://fixture.fal.media';
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
function model(id = endpoint) {
  // Schema route intentionally differs from public endpoint ID, as real aliases can.
  const route = '/internal/model/edit';
  const schemas = {
    Input: { type: 'object', required: ['prompt'], additionalProperties: false, properties: {
      prompt: { type: 'string', minLength: 1 },
      future_setting: { type: 'integer', minimum: 2, maximum: 16 },
      nested: { type: 'object', properties: { refs: { type: 'array', items: { type: 'string', format: 'uri' }, maxItems: 3 } } },
      enabled: { type: 'boolean' }, mode: { enum: ['new-mode', 'another-mode'] },
    } },
    File: { type: 'object', required: ['url'], properties: { url: { type: 'string', format: 'uri' } } },
    Output: { type: 'object', required: ['artifacts'], properties: { artifacts: { type: 'array', items: { $ref: '#/components/schemas/File' } }, text: { type: 'string' } } },
  };
  return { endpoint_id: id, openapi: { components: { schemas }, paths: {
    [route]: { post: { requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Input' } } } } } },
    [`${route}/requests/{request_id}`]: { get: { responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Output' } } } } } } },
  } } };
}
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function fixture() {
  const state = { model: model(), calls: [], status: 'COMPLETED', badMedia: false, lostSubmission: false, badHandle: false, uploads: 0,
    result: { artifacts: [{ url: `${cdn}/one` }, { url: `${cdn}/two` }], text: 'metadata', unrelated: 'https://never-fetch.invalid/doc' } };
  const fetchImpl = async (url, init) => {
    state.calls.push({ url, ...init });
    if (url.startsWith('https://api.fal.ai/')) return json({ models: [state.model], next_cursor: 'next', has_more: true });
    if (url.includes('/storage/upload/initiate')) { state.uploads++; return json({ upload_url: `${cdn}/put-${state.uploads}`, file_url: `${cdn}/input-${state.uploads}` }); }
    if (url.startsWith(`${cdn}/put-`)) return new Response(null, { status: 204 });
    if (url.startsWith(cdn)) {
      if (url.endsWith('/two') && state.badMedia) return new Response(secret, { status: 503 });
      return new Response(png, { headers: { 'content-type': 'application/octet-stream' } });
    }
    if (init.method === 'POST') {
      if (state.lostSubmission) throw new Error(secret);
      const base = `${queue}/future-provider/new-model-v99/requests/test-id`;
      return json({ request_id: 'test-id', status_url: state.badHandle ? 'https://evil.invalid/requests/test-id/status' : `${base}/status`, response_url: base, cancel_url: `${base}/cancel` });
    }
    if (url.endsWith('/status')) return json({ status: state.status });
    if (url.endsWith('/cancel')) return json({ status: 'CANCELLATION_REQUESTED' });
    return json(state.result);
  };
  return { state, client: createClient({ key: secret, fetchImpl, sleep: async () => { state.status = 'COMPLETED'; } }) };
}
async function sandbox(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fal-generic-'));
  try { return await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
async function input(dir, value = { prompt: 'test', future_setting: 8, enabled: false }) {
  const file = path.join(dir, 'input.json'); await writeJson(file, value); return file;
}

test('未注册的新端点／新参数动态执行；显式 false 保留，不注入默认值', () => sandbox(async dir => {
  const { state, client } = fixture();
  state.model.openapi.components.schemas.Input.properties.just_added = { type: 'string', enum: ['live'] };
  const data = { prompt: 'test', just_added: 'live', enabled: false };
  const job = await client.submit({ endpoint, inputFile: await input(dir, data), outDir: path.join(dir, 'job') });
  const sent = state.calls.find(c => c.url === `${queue}/${endpoint}`);
  assert.deepEqual(JSON.parse(sent.body), data);
  assert.equal((await readJson(job.requestFile)).version, 2);
  assert(state.calls.find(c => c.url.includes('expand=openapi-3.0')));
  assert(state.calls.filter(c => c.url.startsWith('https://api.fal.ai')).every(c => !c.headers.Authorization));
}));

test('离线 snapshot dry-run 无 Key、无网络、无产物，schema 不匹配先拒绝', () => sandbox(async dir => {
  const contract = contractFromModel(model(), endpoint), file = path.join(dir, 'schema.json'); await writeJson(file, contract);
  const client = createClient({ key: '', fetchImpl: () => { throw Error('must not fetch'); } });
  const args = { endpoint, inputFile: await input(dir), schemaFile: file };
  const before = await fs.readdir(dir), p = await client.prepare(args);
  assert.equal(p.schemaSource, 'snapshot'); assert.equal(p.input.future_setting, 8);
  assert.deepEqual(await fs.readdir(dir), before);
  await assert.rejects(client.prepare({ ...args, endpoint: 'other/model' }), /端点不匹配/);
  await assert.rejects(client.submit(args), /FAL_KEY/);
  await assert.rejects(createClient({ key: secret }).submit(args), /实时|最新 schema/);
}));

test('必填／范围／额外字段在上传与付费提交前拒绝', () => sandbox(async dir => {
  for (const data of [{}, { prompt: 'x', future_setting: 17 }, { prompt: 'x', made_up: true }]) {
    const { state, client } = fixture();
    await assert.rejects(client.submit({ endpoint, inputFile: await input(dir, data), outDir: path.join(dir, 'job') }), /校验失败/);
    assert.equal(state.calls.length, 1); assert.equal(state.calls[0].method, 'GET');
  }
  assert.deepEqual(await fs.readdir(dir), ['input.json']);
}));

test('嵌套多媒体上传按引用位置替换，URL 与参数原样保留，CDN 不携带 Key', () => sandbox(async dir => {
  const { state, client } = fixture(), a = path.join(dir, 'source.mp4'), b = path.join(dir, 'voice.wav');
  await fs.writeFile(a, 'video-fixture'); await fs.writeFile(b, 'audio-fixture');
  const data = { prompt: 'x', nested: { refs: [{ $file: a, content_type: 'video/mp4' }, 'https://example.com/original', { $file: b, content_type: 'audio/wav' }] } };
  const job = await client.submit({ endpoint, inputFile: await input(dir, data), outDir: path.join(dir, 'job') });
  const r = await readJson(job.requestFile);
  assert.deepEqual(r.input.nested.refs, [`${cdn}/input-1`, 'https://example.com/original', `${cdn}/input-2`]);
  assert.deepEqual(r.uploads.map(x => x.phase), ['uploaded', 'uploaded']);
  assert(state.calls.filter(c => c.url.startsWith(cdn)).every(c => !c.headers.Authorization));
  assert(state.calls.filter(c => c.url.startsWith(queue)).every(c => c.headers.Authorization === `Key ${secret}`));
  assert(state.calls.every(c => c.redirect === 'error'));
  assert(!JSON.stringify(r).includes(secret));
}));

test('提交断线只提交一次并留 submitting；响应 URL 非法时仍保留请求 ID', () => sandbox(async dir => {
  for (const kind of ['lostSubmission', 'badHandle']) {
    const { state, client } = fixture(); state[kind] = true;
    const outDir = path.join(dir, kind);
    await assert.rejects(client.submit({ endpoint, inputFile: await input(dir), outDir }), e => !e.message.includes(secret));
    const r = await readJson(path.join(outDir, 'request.json'));
    assert.equal(state.calls.filter(c => c.method === 'POST' && c.url.startsWith(queue)).length, 1);
    assert.equal(r.phase, kind === 'lostSubmission' ? 'submitting' : 'submitted');
    if (kind === 'badHandle') assert.equal(r.requestId, 'test-id');
    const before = state.calls.length;
    await assert.rejects(client.status(path.join(outDir, 'request.json')));
    assert.equal(state.calls.length, before);
  }
}));

test('队列等待、嵌套结果、部分下载与补取；不重复生成、不覆盖用户修改', () => sandbox(async dir => {
  const { state, client } = fixture();
  const job = await client.submit({ endpoint, inputFile: await input(dir), outDir: path.join(dir, 'job') });
  state.status = 'IN_QUEUE'; assert.equal((await client.result(job.requestFile)).downloaded, false);
  state.badMedia = true;
  const partial = await client.wait(job.requestFile);
  assert.equal(partial.delivery, 'partial'); assert.equal(partial.saved.length, 1); assert.equal(partial.failures.length, 1);
  assert(!JSON.stringify(partial).includes(secret));
  state.badMedia = false;
  const before = state.calls.length, result = await client.download(job.requestFile);
  assert.equal(result.saved.length, 2); assert.equal(result.delivery, 'downloaded');
  assert(state.calls.slice(before).every(c => c.url.startsWith(cdn)));
  assert(!state.calls.some(c => c.url.includes('never-fetch')));
  await fs.writeFile(result.saved[0].path, 'user edit');
  const retry = await client.download(job.requestFile);
  assert.equal(retry.failures.length, 1); assert.equal(await fs.readFile(result.saved[0].path, 'utf8'), 'user edit');
  assert.equal(state.calls.filter(c => c.method === 'POST' && c.url.startsWith(queue)).length, 1);
  assert((await client.cancel(job.requestFile)).cancellationRequested);
}));

test('非图片输出按 MIME 保存；未知类型保留 .bin，结果 JSON 始终保留', () => sandbox(async dir => {
  const mimeTypes = ['video/mp4', 'audio/mpeg', 'model/gltf-binary', 'application/x-future'];
  const exts = ['.mp4', '.mp3', '.glb', '.bin'];
  for (let i = 0; i < mimeTypes.length; i++) {
    const { state, client } = fixture();
    const job = await client.submit({ endpoint, inputFile: await input(dir), outDir: path.join(dir, `job-${i}`) });
    state.result.artifacts = [{ url: `${cdn}/unknown` }];
    // Use a second client to demonstrate cross-process recovery without model registration.
    const recovery = createClient({ key: secret, fetchImpl: async (url, init) => {
      if (url.startsWith(cdn)) return new Response('fixture bytes', { headers: { 'content-type': mimeTypes[i] } });
      if (url.endsWith('/status')) return json({ status: 'COMPLETED' });
      return json(state.result);
    } });
    const r = await recovery.result(job.requestFile);
    assert.equal(path.extname(r.saved[0].path), exts[i]); assert.deepEqual(await readJson(r.resultFile), state.result);
  }
}));

test('显式输出缺失与 schema 必填输出缺失记失败；JSON-only 不伪称已下载', () => sandbox(async dir => {
  const { state, client } = fixture();
  const job = await client.submit({ endpoint, inputFile: await input(dir), outDir: path.join(dir, 'job'), outputs: ['/missing/url'] });
  const missing = await client.result(job.requestFile); assert.equal(missing.failures[0].recoverable, false);
  const chosen = await client.download(job.requestFile, ['/artifacts/0']); assert.equal(chosen.saved.length, 1);
  state.result = { text: 'no files' };
  const malformed = await client.result(job.requestFile); assert(malformed.failures.length >= 2);
  const contract = await readJson(path.join(dir, 'job/schema.json'));
  contract.outputSchema = { type: 'object', properties: { text: { type: 'string' } } }; await writeJson(path.join(dir, 'job/schema.json'), contract);
  const only = await client.download(job.requestFile, []); assert.equal(only.delivery, 'json_only'); assert.equal(only.saved.length, 0);
}));

test('schema 引用、组合、常见边界和未知约束提示；非标准协议不猜测', () => {
  const c = contractFromModel(model(), endpoint);
  assert.equal(validate(3, { oneOf: [{ type: 'integer' }, { type: 'number' }] }, {}).errors.length, 1);
  assert(validate('x', { anyOf: [{ type: 'number' }, { enum: ['ok'] }] }, {}).errors.length);
  assert.equal(validate({ a: 'x' }, { type: 'object', properties: { a: { type: 'string' } }, dependentRequired: { a: ['b'] } }, {}).warnings.length, 1);
  assert.equal(validate(null, { type: 'string', nullable: true }, {}).errors.length, 0);
  assert(validate([1, 1], { uniqueItems: true }, {}).errors.length);
  assert(validate(0.3, { type: 'number', multipleOf: 0.1 }, {}).errors.length === 0);
  assert.throws(() => validate('x', { $ref: 'https://external.invalid/schema' }, {}), /引用/);
  const m = model(); delete m.openapi.paths['/internal/model/edit/requests/{request_id}'];
  assert.throws(() => contractFromModel(m, endpoint), /队列结果/);
  assert.equal(pointer({ '__proto__': null }, '/toString'), undefined);
  const found = outputFiles({ artifacts: [{ url: `${cdn}/x` }] }, c);
  assert.equal(found.found.length, 1);
  const inline = model();
  const inputSchema = inline.openapi.components.schemas.Input;
  const outputSchema = { type: 'object', properties: { file: { anyOf: [{ type: 'string', format: 'uri' }, { type: 'null' }] } } };
  inline.openapi.paths['/internal/model/edit'].post.requestBody.content['application/json'].schema = inputSchema;
  inline.openapi.paths['/internal/model/edit/requests/{request_id}'].get.responses[200].content['application/json'].schema = outputSchema;
  delete inline.openapi.components;
  const inlineContract = contractFromModel(inline, endpoint);
  assert.equal(outputFiles({ file: `${cdn}/new-format` }, inlineContract).found.length, 1);

});

test('CLI 离线预检、未知操作／参数拒绝，schema 输出不覆盖', () => sandbox(async dir => {
  const cli = fileURLToPath(new URL('../scripts/fal.mjs', import.meta.url));
  const schemaFile = path.join(dir, 'schema.json'); await writeJson(schemaFile, contractFromModel(model(), endpoint));
  const inputFile = await input(dir);
  const env = { ...process.env }; delete env.FAL_KEY;
  const run = args => spawnSync(process.execPath, [cli, ...args], { cwd: dir, env, encoding: 'utf8' });
  const args = ['submit', '--endpoint', endpoint, '--input', inputFile, '--schema', schemaFile, '--dry-run'];
  const good = run(args); assert.equal(good.status, 0, good.stderr); assert.equal(JSON.parse(good.stdout).dryRun, true);
  assert.equal(run([...args, '--bogus', 'x']).status, 1);
  assert.equal(run(['text-to-image', '--prompt', 'x']).status, 1);
  assert.equal(run(['submit', '--endpoint', endpoint, '--input', inputFile]).status, 1);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['input.json', 'schema.json']);
  await assert.rejects(writeJson(schemaFile, { overwrite: true }, true));
  assert.equal((await readJson(schemaFile)).endpoint, endpoint);
}));

test('上传失败保留回执、不提交；未授权／非法素材在网络前失败', () => sandbox(async dir => {
  const source = path.join(dir, 'source.bin'); await fs.writeFile(source, 'data');
  const inputFile = await input(dir, { prompt: 'x', nested: { refs: [{ $file: source }] } });
  const calls = [];
  const client = createClient({ key: secret, fetchImpl: async (url, init) => {
    calls.push({ url, ...init });
    if (url.startsWith('https://api.fal.ai')) return json({ models: [model()] });
    if (url.includes('initiate')) return json({ upload_url: `${cdn}/put`, file_url: `${cdn}/uploaded` });
    throw Error('upload lost');
  } });
  const outDir = path.join(dir, 'job');
  await assert.rejects(client.submit({ endpoint, inputFile, outDir }));
  const record = await readJson(path.join(outDir, 'request.json'));
  assert.equal(record.phase, 'preparing'); assert.equal(record.uploads[0].phase, 'uploading');
  assert.equal(record.uploads[0].fileUrl, `${cdn}/uploaded`);
  assert(!calls.some(c => c.url.startsWith(queue)));
  await fs.writeFile(source, ''); const before = calls.length;
  await assert.rejects(client.prepare({ endpoint, inputFile }), /非空/); assert.equal(calls.length, before);
}));
