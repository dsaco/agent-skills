'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function workspace(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-offline-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const cwd = path.join(tmp, '任务 空间'); fs.mkdirSync(cwd);
  const mock = path.join(tmp, 'mock.cjs');
  fs.writeFileSync(mock, `
const fs = require('node:fs');
global.fetch = async (url, options = {}) => {
  const api = String(url).startsWith('https://ark.cn-beijing.volces.com/api/v3/');
  if (api && process.env.MOCK_MODE === 'download') throw new Error('API forbidden in recovery');
  if (process.env.NO_NETWORK) throw new Error('Network forbidden in this test');
  if (options.redirect !== 'error' || !options.signal) throw new Error('Missing redirect/timeout protection');
  if (api && options.headers?.Authorization !== 'Bearer test-key-not-real') throw new Error('Wrong auth');
  if (!api && options.headers?.Authorization) throw new Error('Credential leak');
  fs.appendFileSync('calls.txt', JSON.stringify({url, method: options.method, body: options.body}) + '\\n');
  if (process.env.MOCK_MODE === 'timeout') throw new Error('timeout');
  if (process.env.MOCK_MODE === 'invalid') return new Response('not json');
  if (process.env.MOCK_MODE === 'http-error') return new Response('test-key-not-real', {status: 503});
  if (api) return Response.json(JSON.parse(process.env.MOCK_RESULT));
  if (process.env.MOCK_MODE === 'download') return new Response(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]));
  return new Response(process.env.MOCK_MODE === 'empty' ? '' : 'media-bytes');
};
`);
  function run(args, result, mode = '', cli = path.join(root, 'scripts/ark-media.js')) {
    const env = { PATH: process.env.PATH, HOME: tmp, USERPROFILE: tmp,
      NODE_OPTIONS: `--require="${mock}"`, MOCK_MODE: mode };
    if (result !== undefined) { env.ARK_API_KEY = 'test-key-not-real'; env.MOCK_RESULT = JSON.stringify(result); }
    else if (mode !== 'download') env.NO_NETWORK = '1';
    return spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8', timeout: 10000 });
  }
  return { tmp, cwd, run, calls: () => fs.readFileSync(path.join(cwd, 'calls.txt'), 'utf8').trim().split('\n').map(JSON.parse) };
}
const ok = result => assert.equal(result.status, 0, result.stderr);

test('独立复制到中文空格目录，在 ESM 宿主下运行 help/models/dry-run，无 Key/网络/输出', t => {
  const w = workspace(t), installed = path.join(w.tmp, '技能 安装');
  fs.writeFileSync(path.join(w.tmp, 'package.json'), '{"type":"module"}');
  fs.cpSync(root, installed, { recursive: true });
  const cli = path.join(installed, 'scripts/ark-media.js');
  ok(w.run(['--help'], undefined, '', cli));
  assert.equal(JSON.parse(w.run(['models'], undefined, '', cli).stdout).length, 5);
  for (const args of [['image', '--prompt', '原样'], ['video-create', '--prompt', '原样'], ['video-query', '--id', 'cgt-test']]) {
    const r = w.run([...args, '--dry-run'], undefined, '', cli); ok(r);
    assert.match(JSON.parse(r.stdout).url, /^https:\/\/ark\.cn-beijing\.volces\.com/);
  }
  assert.deepEqual(fs.readdirSync(w.cwd), []);
  const missing = w.run(['image', '--prompt', 'no key']);
  assert.notEqual(missing.status, 0); assert.match(missing.stderr, /ARK_API_KEY/);
  assert.deepEqual(fs.readdirSync(w.cwd), []);
});

test('图片别名、默认值、组图限制、参数白名单和路径校验', t => {
  const w = workspace(t);
  const r = w.run(['image', '--prompt', '原样', '--model', 'seedream-4.5', '--image-count', '2', '--dry-run']); ok(r);
  const p = JSON.parse(r.stdout).payload;
  assert.equal(p.model, 'doubao-seedream-4-5-251128'); assert.equal(p.prompt, '原样');
  assert.equal(p.watermark, false); assert.equal(p.response_format, 'url'); assert.equal(p.optimize_prompt_options, undefined);
  assert.deepEqual(p.sequential_image_generation_options, { max_images: 2 });
  for (const args of [['--image-count', '16'], ['--image-count', '2', '--sequential', 'disabled'], ['--model', 'seedream-5.0-pro', '--image-count', '2'], ['--name', '..'], ['--name', 'a\\b'], ['--unknown', 'x']]) {
    assert.notEqual(w.run(['image', '--prompt', 'x', ...args, '--dry-run']).status, 0);
  }
  assert.notEqual(w.run(['video-query', '--id', '../escape', '--dry-run']).status, 0);
  assert.notEqual(w.run(['toString']).status, 0);
});

test('本地图片/音频、prompt-file 与视频显式参数：预检省略 Base64', t => {
  const w = workspace(t);
  fs.writeFileSync(path.join(w.cwd, 'a.png'), 'image-test'); fs.writeFileSync(path.join(w.cwd, 'a.wav'), 'audio-test');
  fs.writeFileSync(path.join(w.cwd, 'prompt.txt'), '保持文字');
  const r = w.run(['video-create', '--prompt-file', 'prompt.txt', '--image', 'a.png', '--image-role', 'reference_image', '--audio', 'a.wav', '--duration', '8', '--seed', '0', '--no-generate-audio', '--dry-run']); ok(r);
  const p = JSON.parse(r.stdout).payload;
  assert.equal(p.content[0].text, '保持文字'); assert.match(p.content[1].image_url.url, /base64 omitted/);
  assert.match(p.content[2].audio_url.url, /base64 omitted/); assert.equal(p.generate_audio, false); assert.equal(p.seed, 0);
  assert.equal(p.resolution, undefined); assert.equal(p.watermark, undefined);
  for (const args of [['--audio', 'a.wav'], ['--prompt', 'x', '--duration', '3'], ['--prompt', 'x', '--video', 'local.mp4'], ['--prompt', 'x', '--image-role', 'first_frame']]) {
    assert.notEqual(w.run(['video-create', ...args, '--dry-run']).status, 0);
  }
});

test('图片响应先保存，URL/Base64 多图下载不附带凭据；重复 POST 被阻止', t => {
  const w = workspace(t), response = { data: [{ url: 'https://media.invalid/a.jpg' }, { b64_json: Buffer.from('second').toString('base64') }] };
  ok(w.run(['image', '--prompt', 'x'], response));
  const dir = path.join(w.cwd, 'output/seedream/generate-image');
  assert.equal(fs.readFileSync(path.join(dir, 'generate-image.jpeg'), 'utf8'), 'media-bytes');
  assert.equal(fs.readFileSync(path.join(dir, 'generate-image-2.jpeg'), 'utf8'), 'second');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'generate-image.json'))), response);
  assert.notEqual(w.run(['image', '--prompt', 'x'], response).status, 0);
  assert.equal(w.calls().filter(c => c.method === 'POST').length, 1);
});

test('空下载保留响应但不落空媒体，禁止通过重新生成补下载', t => {
  const w = workspace(t), response = { data: [{ url: 'https://media.invalid/empty' }] };
  const r = w.run(['image', '--prompt', 'x'], response, 'empty');
  assert.notEqual(r.status, 0); assert.match(r.stderr, /empty/);
  const dir = path.join(w.cwd, 'output/seedream/generate-image');
  assert(fs.existsSync(path.join(dir, 'generate-image.json')));
  assert(!fs.existsSync(path.join(dir, 'generate-image.jpeg')));
  assert.notEqual(w.run(['image', '--prompt', 'x'], response).status, 0);
  assert.equal(w.calls().length, 2);
});

test('创建视频保存 ID；超时/非法响应不自动重提，错误不泄漏假 Key', t => {
  const w = workspace(t);
  ok(w.run(['video-create', '--prompt', 'x', '--name', 'success'], { id: 'cgt-test' }));
  assert.notEqual(w.run(['video-create', '--prompt', 'x', '--name', 'missing'], {}).status, 0);
  for (const mode of ['timeout', 'invalid', 'http-error']) {
    const args = ['video-create', '--prompt', 'x', '--name', mode];
    const r = w.run(args, {}, mode); assert.notEqual(r.status, 0); assert(!r.stderr.includes('test-key-not-real'));
    const count = w.calls().length;
    assert.notEqual(w.run(args, { id: 'must-not-submit' }).status, 0); assert.equal(w.calls().length, count);
    const marker = JSON.parse(fs.readFileSync(path.join(w.cwd, `output/seedance/${mode}/create.json.submission.json`)));
    assert.equal(marker.state, 'unknown');
  }
});

test('视频等待状态与终态；成功后下载视频/尾帧并产生明确的静态估价', t => {
  const w = workspace(t), args = ['video-query', '--id', 'cgt-test'];
  for (const status of ['queued', 'running']) ok(w.run(args, { id: 'cgt-test', status }));
  for (const status of ['failed', 'cancelled', 'expired', 'surprise']) assert.notEqual(w.run(args, { status, error: { message: 'test failure' } }).status, 0);
  const result = { id: 'cgt-test', status: 'succeeded', error: null, model: 'doubao-seedance-2-0-260128', resolution: '720p', usage: { completion_tokens: 1000000 }, content: { video_url: 'https://media.invalid/a.mp4', last_frame_url: 'https://media.invalid/a.png' } };
  assert.notEqual(w.run(args, { ...result, error: { message: 'bad' } }).status, 0);
  ok(w.run(args, result));
  const dir = path.join(w.cwd, 'output/seedance/cgt-test');
  assert.equal(fs.readFileSync(path.join(dir, 'cgt-test.mp4'), 'utf8'), 'media-bytes');
  assert.equal(fs.readFileSync(path.join(dir, 'cgt-test.last-frame.png'), 'utf8'), 'media-bytes');
  const price = JSON.parse(fs.readFileSync(path.join(dir, 'cgt-test.price.json')));
  assert.equal(price.estimatedPrice, 46); assert.match(price.note, /不是账单/);
  const preview = w.run([...args, '--out', 'movies/demo.mp4', '--dry-run']); ok(preview);
  assert.equal(JSON.parse(preview.stdout).out, path.join('movies', 'demo', 'demo.mp4'));
});

test('图片恢复预检无 Key/网络/目录写入；独立复制后入口可用', t => {
  const w = workspace(t), installed = path.join(w.tmp, '独立 技能');
  fs.cpSync(root, installed, { recursive: true });
  fs.writeFileSync(path.join(w.cwd, 'saved.json'), JSON.stringify({ data: [{ url: 'https://media.invalid/private-signed-url' }] }));
  const args = ['image-download', '--result', 'saved.json', '--out-dir', '恢复 目录', '--dry-run'];
  const r = w.run(args, undefined, '', path.join(installed, 'scripts/ark-media.js')); ok(r);
  assert.equal(JSON.parse(r.stdout).count, 1); assert(!r.stdout.includes('private-signed-url'));
  assert.deepEqual(fs.readdirSync(w.cwd), ['saved.json']);
  for (const extra of [['--out-dir', 'other'], ['--prompt', 'new generation']]) {
    assert.notEqual(w.run([...args, ...extra]).status, 0);
  }
});

test('图片恢复 GET 与 Base64 无 Key，无 POST；保留原文件，重复目录拒绝覆盖', t => {
  const w = workspace(t), png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const source = JSON.stringify({ data: [{ url: 'https://media.invalid/a.png' }, { b64_json: png.toString('base64') }] });
  fs.writeFileSync(path.join(w.cwd, 'saved.json'), source);
  fs.writeFileSync(path.join(w.cwd, 'original.png'), 'keep-original');
  const args = ['image-download', '--result', 'saved.json', '--out-dir', 'recovery'];
  const r = w.run(args, undefined, 'download'); ok(r);
  const data = JSON.parse(r.stdout); assert.equal(data.items.length, 2);
  for (const item of data.items) assert.deepEqual(fs.readFileSync(item.path), png);
  assert.equal(w.calls().length, 1); assert.equal(w.calls()[0].method, 'GET');
  assert.equal(fs.readFileSync(path.join(w.cwd, 'saved.json'), 'utf8'), source);
  assert.equal(fs.readFileSync(path.join(w.cwd, 'original.png'), 'utf8'), 'keep-original');
  assert.notEqual(w.run(args, undefined, 'download').status, 0); assert.equal(w.calls().length, 1);
});

test('图片恢复逐项错误不阻断后续，拒绝空/非法媒体和非 HTTP URL', t => {
  const w = workspace(t), jpeg = Buffer.from([255, 216, 255, 1]);
  fs.writeFileSync(path.join(w.cwd, 'saved.json'), JSON.stringify({ data: [
    {}, { b64_json: '!!!!' }, { b64_json: Buffer.from('not an image').toString('base64') },
    { url: 'file:///private' }, { b64_json: jpeg.toString('base64') },
  ] }));
  const r = w.run(['image-download', '--result', 'saved.json', '--out-dir', 'partial']);
  assert.equal(r.status, 1);
  const items = JSON.parse(r.stdout).items;
  assert.equal(items.length, 5); assert(items.slice(0, 4).every(item => item.error));
  assert.deepEqual(fs.readFileSync(items[4].path), jpeg);
  assert.deepEqual(fs.readdirSync(path.join(w.cwd, 'partial')), ['image-5.jpeg']);
  assert(!fs.existsSync(path.join(w.cwd, 'calls.txt')));
  fs.writeFileSync(path.join(w.cwd, 'empty.json'), '{"data":[]}');
  assert.notEqual(w.run(['image-download', '--result', 'empty.json', '--out-dir', 'empty']).status, 0);
  assert(!fs.existsSync(path.join(w.cwd, 'empty')));
});
