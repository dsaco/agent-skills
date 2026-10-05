import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { run } from '../scripts/tts.mjs';
import { validateRequest, endpoint } from '../scripts/models.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const bodyA = () => ({ model: 'cosyvoice-v3-plus', input: { text: '原文', voice: 'longanhuan', format: 'mp3' } });
const bodyB = () => ({ model: 'qwen3-tts-flash', input: { text: '你好', voice: 'Cherry' } });
const mp3 = Buffer.from('ID3mock-audio'), wav = Buffer.from('RIFF0000WAVEmock-audio');
const completed = extra => ({ request_id: 'mock-request', output: { finish_reason: 'stop', audio: { url: 'https://media.invalid/test' } }, ...extra });
async function fixture(t, body = bodyB()) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dashscope-offline-'));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const request = path.join(tmp, 'input.json'), dir = path.join(tmp, 'output');
  await fs.writeFile(request, JSON.stringify(body));
  return { tmp, request, dir, args: ['synthesize', '--request', request, '--out-dir', dir] };
}
const noNetwork = async () => { throw new Error('Unexpected network'); };
const log = () => {};

test('A/B 参数隔离、边界、官方 hot_fix 数组、opus 采样率和受限 workspace', () => {
  assert.equal(validateRequest(bodyA()).route, 'A'); assert.equal(validateRequest(bodyB()).format, 'wav');
  const a = bodyA(); a.input.sample_rate = 12000; a.input.hot_fix = { replace: [{ 今天: '金天' }] }; validateRequest(a);
  for (const input of [{ speech_rate: 1 }, { language_type: 'Chinese' }, { seed: -1 }, { format: 'opus', sample_rate: 44100 }, { hot_fix: { replace: { 今天: '金天' } } }, { word_timestamp_enabled: true }]) assert.throws(() => validateRequest({ ...bodyA(), input: { ...bodyA().input, ...input } }));
  for (const input of [{ format: 'mp3' }, { instructions: '开心' }, { text: '字'.repeat(601) }]) assert.throws(() => validateRequest({ ...bodyB(), input: { ...bodyB().input, ...input } }));
  assert.throws(() => endpoint('A', 'evil.invalid/')); assert.match(endpoint('A', 'workspace-test'), /^https:\/\/workspace-test\.cn-beijing\.maas\.aliyuncs\.com/);
});

test('独立中文空格目录 CLI：help/models/dry-run，无 Key/网络/产物', async t => {
  const f = await fixture(t), installed = path.join(f.tmp, '独立 技能');
  await fs.cp(root, installed, { recursive: true });
  const blocker = path.join(f.tmp, 'block.cjs'); await fs.writeFile(blocker, 'global.fetch = () => { throw new Error("Network forbidden"); };');
  const cli = path.join(installed, 'scripts/tts.mjs');
  for (const args of [['--help'], ['models'], [...f.args, '--dry-run']]) {
    const result = spawnSync(process.execPath, ['--require', blocker, cli, ...args], { cwd: f.tmp, env: { PATH: process.env.PATH, HOME: f.tmp }, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
  }
  await assert.rejects(fs.stat(f.dir));
  await assert.rejects(run(f.args, { env: {}, fetchFn: noNetwork, log }), /DASHSCOPE_API_KEY/);
  await assert.rejects(fs.stat(f.dir));
  const env = new Proxy({}, { get() { throw new Error('Preview must not read credentials'); } });
  await run([...f.args, '--dry-run'], { env, fetchFn: noNetwork, log });
});

test('成功响应先落盘，媒体 GET 不携带 Key，保留原文与 request ID，拒绝重跑', async t => {
  const f = await fixture(t, bodyA()), calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({url,opts}); assert.equal(opts.redirect, 'error'); assert(opts.signal);
    if (opts.method === 'POST') { assert.equal(opts.headers.Authorization, 'Bearer fake-test-key'); assert.equal(JSON.parse(opts.body).input.text, '原文'); return Response.json(completed()); }
    assert.equal(opts.headers, undefined); assert(await fs.stat(path.join(f.dir, 'result.json'))); return new Response(mp3);
  };
  await run(f.args, { env: { DASHSCOPE_API_KEY: 'fake-test-key' }, fetchFn, log });
  assert.deepEqual(await fs.readFile(path.join(f.dir, 'audio.mp3')), mp3);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.dir, 'request.json'))).state, 'received');
  await assert.rejects(run(f.args, { env: {}, fetchFn, log }), /already exists/); assert.equal(calls.length, 2);
});

test('B 线 Base64 无 SDK status_code／无 usage 也可完成，Key 回显脱敏', async t => {
  const f = await fixture(t), logs = [];
  const fetchFn = async () => Response.json(completed({ request_id: 'fake-key', output: { finish_reason: 'stop', audio: { data: wav.toString('base64') } }, message: 'fake-key' }));
  await run(f.args, { env: { DASHSCOPE_API_KEY: 'fake-key' }, fetchFn, log: s => logs.push(s) });
  assert.deepEqual(await fs.readFile(path.join(f.dir, 'audio.wav')), wav);
  assert(!(await fs.readFile(path.join(f.dir, 'result.json'), 'utf8')).includes('fake-key')); assert(!logs.join('').includes('fake-key'));
});

test('超时、非法 JSON 与 HTTP 错误不自动重提，已有记录阻止重复调用', async t => {
  for (const kind of ['timeout', 'invalid', 'http']) {
    const f = await fixture(t); let count = 0;
    const fetchFn = async () => { count++; if (kind === 'timeout') throw new Error('fake-key'); return kind === 'invalid' ? new Response('invalid') : Response.json({ code: 'Denied' }, { status: 403 }); };
    await assert.rejects(run(f.args, { env: { DASHSCOPE_API_KEY: 'fake-key' }, fetchFn, log }), /unknown/);
    assert(await fs.stat(path.join(f.dir, 'request.json')));
    await assert.rejects(run(f.args, { env: {}, fetchFn, log }), /already exists/); assert.equal(count, 1);
  }
});

test('服务错误/非终态/空或格式错误媒体不交付成功，保留响应', async t => {
  for (const result of [completed({ code: 'Error' }), completed({ status_code: 500 }), { output: { finish_reason: null } }, completed(), completed({ output: { finish_reason: 'stop', audio: { url: 'https://media.invalid/empty' } } })]) {
    const f = await fixture(t);
    const fetchFn = async (url, opts) => opts.method === 'POST' ? Response.json(result) : new Response(url.endsWith('/empty') ? '' : 'not wav');
    await assert.rejects(run(f.args, { env: { DASHSCOPE_API_KEY: 'fake-key' }, fetchFn, log }));
    assert(await fs.stat(path.join(f.dir, 'result.json'))); await assert.rejects(fs.stat(path.join(f.dir, 'audio.wav')));
  }
});

test('补下载无 Key、无 POST，原响应不变，新目录保存；预检不写盘', async t => {
  const f = await fixture(t), result = path.join(f.tmp, 'result.json'), saved = JSON.stringify(completed()); await fs.writeFile(result, saved);
  const args = ['download', '--result', result, '--format', 'wav', '--out-dir', f.dir];
  const env = new Proxy({}, { get() { throw new Error('Download must not read env'); } });
  await run([...args, '--dry-run'], { env, fetchFn: noNetwork, log }); await assert.rejects(fs.stat(f.dir));
  await run(args, { env, fetchFn: async (url, opts) => { assert.equal(opts.method, 'GET'); assert.equal(opts.headers, undefined); return new Response(wav); }, log });
  assert.equal(await fs.readFile(result, 'utf8'), saved); assert.deepEqual(await fs.readFile(path.join(f.dir, 'audio.wav')), wav);
  await assert.rejects(run(args, { env, fetchFn: noNetwork, log }), /already exists/);
});

test('拒绝不安全媒体 URL、未知选项与空输出，不发送网络请求', async t => {
  for (const url of ['file:///private', 'https://user:password@media.invalid/a']) {
    const f = await fixture(t), result = path.join(f.tmp, 'result.json'); await fs.writeFile(result, JSON.stringify({ output: { finish_reason: 'stop', audio: { url } } }));
    await assert.rejects(run(['download', '--result', result, '--format', 'wav', '--out-dir', f.dir], { env: {}, fetchFn: noNetwork, log }), /Invalid media URL/);
  }
  await assert.rejects(run(['synthesize', '--key', 'fake'], { env: {}, fetchFn: noNetwork, log }), /option/);
});
