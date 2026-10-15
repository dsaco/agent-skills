'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const render = require('../scripts/render_strudel_wav.js');

const root = path.resolve(__dirname, '..');
const scripts = path.join(root, 'scripts');
const has = (cmd, args = ['--version']) => spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
const hasPython = has('python3');
const hasBash = has('bash', ['-c', 'true']);
const hasFfmpeg = has('ffmpeg', ['-version']) && has('ffprobe', ['-version']);

function tmpdir(t, prefix = 'strudel-skill-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeWav(file, { rate = 48000, channels = 2, seconds = 1, sample = () => 0 } = {}) {
  const frames = Math.round(rate * seconds);
  const data = Buffer.alloc(frames * channels * 2);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample(i, c, rate)))), (i * channels + c) * 2);
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}
const sine = (freq, amp) => (i, c, rate) => amp * Math.sin((2 * Math.PI * freq * i) / rate);

function runNode(args, options = {}) {
  return spawnSync(process.execPath, [path.join(scripts, 'render_strudel_wav.js'), ...args], { encoding: 'utf8', timeout: 20000, ...options });
}
function runPython(script, args) {
  const result = spawnSync('python3', [path.join(scripts, script), ...args], { encoding: 'utf8', timeout: 30000 });
  return { ...result, json: result.stdout ? JSON.parse(result.stdout) : null };
}

test('参数解析：必填项、互斥项、数值与扩展名在启动浏览器前报错', () => {
  const { parseArgs, resolveOptions, UsageError } = render;
  const opts = argv => resolveOptions(parseArgs(argv), '/work');
  const base = ['--source', 'a.strudel.js', '--start-cycle', '0', '--end-cycle', '24'];
  assert.throws(() => opts(base), UsageError);
  assert.throws(() => opts([...base, '--check-only', '--output', 'x.wav']), UsageError);
  assert.throws(() => opts([...base, '--output', 'x.mp3']), UsageError);
  assert.throws(() => opts(['--source', 'a.js', '--start-cycle', '4', '--end-cycle', '4', '--check-only']), UsageError);
  assert.throws(() => opts([...base, '--check-only', '--polyphony', 'many']), UsageError);
  assert.throws(() => opts(['--list-sounds', '(']), UsageError);
  assert.throws(() => parseArgs(['--unknown', '1']), UsageError);
  assert.throws(() => parseArgs(['--source']), UsageError);
  const check = opts([...base, '--check-only', '--loop']);
  assert.equal(check.mode, 'check'); assert.equal(check.loop, true); assert.equal(check.outputPath, null);
  assert.equal(check.sourcePath, path.resolve('/work', 'a.strudel.js'));
  const full = opts([...base, '--output', 'output/曲 目.wav', '--overwrite']);
  assert.equal(full.mode, 'render'); assert.equal(full.overwrite, true);
  assert.equal(full.sampleRate, 48000); assert.equal(full.polyphony, 256); assert.equal(full.timeoutMs, 600000);
  assert.equal(full.replUrl, 'https://strudel.cc/');
  assert.equal(opts(['--list-sounds', '^gm_']).mode, 'list-sounds');
});

test('预检分析：bank 组合与大小写、默认合成器、未知声音的小节', () => {
  const report = render.analyzeEvents({
    events: [
      { b: 0, e: 0.25, v: { s: 'bd', bank: 'RolandTR808' } },
      { b: 1, e: 1.5, v: { note: 'c3' } },
      { b: 1.5, e: 2, v: { s: 'Sawtooth', note: 'e3' } },
      { b: 2.25, e: 2.5, v: { s: 'birds' } },
      { b: 3, e: 3.25, v: { s: 'cp', bank: 'RolandTR606' } },
    ],
    soundKeys: ['rolandtr808_bd', 'sawtooth', 'cp'],
    cps: 0.375, startCycle: 0, endCycle: 4,
  });
  assert.equal(report.ok, false);
  assert.equal(report.durationSeconds, 10.666667);
  assert.deepEqual(report.unknownSounds.map(x => [x.sound, x.bars]), [['RolandTR606_cp', '4'], ['birds', '3']]);
  assert.equal(report.sounds.RolandTR808_bd.bars, '1');
  assert.match(report.failures[0], /unknown sounds/);
  const ok = render.analyzeEvents({ events: [{ b: 0, e: 1, v: { s: 'bd' } }], soundKeys: ['BD'], cps: 0.5, startCycle: 0, endCycle: 1 });
  assert.equal(ok.ok, true); assert.equal(ok.durationSeconds, 2);
  const noMap = render.analyzeEvents({ events: [{ b: 0, e: 1, v: { s: 'x' } }], soundKeys: null, cps: 0.5, startCycle: 0, endCycle: 1 });
  assert.equal(noMap.ok, true); assert.match(noMap.warnings.join(), /sound map unavailable/);
});

test('预检分析：循环一致、错位小节、空小节、无事件与 orbit 共享参数', () => {
  const pass = [{ b: 0, e: 0.5, v: { s: 'bd' } }, { b: 1.5, e: 2, v: { s: 'sd' } }];
  const shift = (list, d) => list.map(x => ({ ...x, b: x.b + d, e: x.e + d }));
  const base = { soundKeys: ['bd', 'sd', 'hh'], cps: 0.5, startCycle: 0, endCycle: 4 };
  const same = render.analyzeEvents({ ...base, events: pass, loopEvents: shift(pass, 4) });
  assert.deepEqual(same.loop, { checked: true, mismatchBars: '' });
  assert.equal(same.emptyBars, '3-4'); assert.match(same.warnings.join(), /bars without new events: 3-4/);
  const drift = render.analyzeEvents({ ...base, events: pass, loopEvents: [...shift(pass, 4), { b: 6.5, e: 7, v: { s: 'hh' } }] });
  assert.equal(drift.ok, false); assert.equal(drift.loop.mismatchBars, '3'); assert.match(drift.failures.join(), /loop/);
  assert.equal(render.analyzeEvents({ ...base, events: [] }).ok, false);
  const fx = render.analyzeEvents({
    ...base,
    events: [
      { b: 0, e: 1, v: { s: 'bd', orbit: 3, room: 0.2, roomsize: 2 } },
      { b: 1, e: 2, v: { s: 'sd', orbit: 3, room: 0.1 } },
      { b: 2, e: 3, v: { s: 'hh', orbit: 3, room: 0, roomsize: 9 } },
      { b: 3, e: 4, v: { s: 'hh', orbit: 4, delay: 0.3, delaytime: 0.25 } },
      { b: 3.5, e: 4, v: { s: 'hh', orbit: 4, delay: 0.2, delaytime: 0.25 } },
    ],
  });
  assert.deepEqual(fx.orbitConflicts, [{ orbit: 3, param: 'roomsize', values: ['2', 'default'] }]);
  assert.equal(fx.ok, true);
  assert.equal(render.formatBars([7, 1, 2, 3, 5, 8, 2]), '1-3,5,7-8');
});

test('CLI：帮助、参数错误、已有输出与缺失源码在联网前结束且不留文件', t => {
  const cwd = tmpdir(t);
  const help = runNode(['--help'], { cwd });
  assert.equal(help.status, 0); assert.match(help.stdout, /--check-only/);
  const usage = runNode(['--source', 'a.js'], { cwd });
  assert.equal(usage.status, 64); assert.match(usage.stderr, /Missing --start-cycle/);
  fs.writeFileSync(path.join(cwd, 'a.strudel.js'), 's("bd")');
  fs.writeFileSync(path.join(cwd, 'old.wav'), 'keep');
  const env = { ...process.env, PLAYWRIGHT_MODULE: path.join(cwd, 'no-playwright'), CHROME_PATH: path.join(cwd, 'no-chrome') };
  const exists = runNode(['--source', 'a.strudel.js', '--output', 'old.wav', '--start-cycle', '0', '--end-cycle', '1'], { cwd, env });
  assert.equal(exists.status, 1); assert.match(exists.stderr, /^Error: Output already exists/); assert.doesNotMatch(exists.stderr, /\n\s+at /);
  assert.equal(fs.readFileSync(path.join(cwd, 'old.wav'), 'utf8'), 'keep');
  const missing = runNode(['--source', 'none.js', '--start-cycle', '0', '--end-cycle', '1', '--check-only'], { cwd, env });
  assert.equal(missing.status, 1); assert.match(missing.stderr, /Source not found/);
  assert.deepEqual(fs.readdirSync(cwd).sort(), ['a.strudel.js', 'old.wav']);
});

test('移动到含空格与中文的目录后脚本可从任务目录调用', t => {
  const tmp = tmpdir(t);
  const installed = path.join(tmp, '技能 安装', 'strudel-music');
  fs.cpSync(root, installed, { recursive: true, filter: src => path.relative(root, src).split(path.sep)[0] !== 'tests' });
  const cwd = path.join(tmp, '任务 目录');
  fs.mkdirSync(cwd);
  const help = spawnSync(process.execPath, [path.join(installed, 'scripts', 'render_strudel_wav.js'), '--help'], { cwd, encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /--list-sounds/);
  if (hasPython) {
    const timing = spawnSync('python3', [path.join(installed, 'scripts', 'calculate_timing.py'), '--bpm', '90', '--seconds', '64'], { cwd, encoding: 'utf8' });
    assert.equal(timing.status, 0); assert.equal(JSON.parse(timing.stdout).setcpm, 22.5);
  }
  assert.deepEqual(fs.readdirSync(cwd), []);
});

test('计时：整小节、需取舍的小节数与 4 小节乐句方案', { skip: !hasPython && 'python3 not found' }, () => {
  const a = runPython('calculate_timing.py', ['--bpm', '90', '--beats-per-bar', '4', '--seconds', '64']).json;
  assert.equal(a.setcpm, 22.5); assert.equal(a.exact_bar_count, 24); assert.equal(a.is_integer_bar_count, true);
  const b = runPython('calculate_timing.py', ['--bpm', '60', '--seconds', '60']).json;
  assert.equal(b.exact_bar_count, 15);
  assert.deepEqual(b.options.map(x => [x.bars, x.seconds_at_requested_bpm, x.phrase_aligned]), [[12, 48, true], [15, 60, false], [16, 64, true]]);
  const c = runPython('calculate_timing.py', ['--bpm', '100', '--beats-per-bar', '3', '--seconds', '30']).json;
  assert.equal(c.is_integer_bar_count, false); assert.equal(c.exact_bar_count, 16.666666667);
  const option = c.options.find(x => x.bars === 17);
  assert.equal(option.bpm_for_exact_requested_duration, 102);
});

test('WAV 校验：合格、静音、连续削波、采样率与时长不符', { skip: !hasPython && 'python3 not found' }, t => {
  const dir = tmpdir(t);
  const file = name => path.join(dir, name);
  writeWav(file('ok.wav'), { sample: sine(440, 16000) });
  const ok = runPython('validate_wav.py', [file('ok.wav'), '--expected-seconds', '1']);
  assert.equal(ok.status, 0); assert.equal(ok.json.ok, true); assert.equal(ok.json.clipped_runs, 0); assert.deepEqual(ok.json.warnings, []);
  writeWav(file('silent.wav'));
  assert.match(runPython('validate_wav.py', [file('silent.wav')]).json.failures.join(), /silent/);
  writeWav(file('clip.wav'), { sample: (i, c, rate) => (Math.sin((2 * Math.PI * 100 * i) / rate) > 0 ? 40000 : -40000) });
  const clip = runPython('validate_wav.py', [file('clip.wav'), '--expected-seconds', '1']);
  assert.equal(clip.status, 1); assert.match(clip.json.failures.join(), /clipping/); assert(clip.json.clipped_runs > 0);
  writeWav(file('touch.wav'), { sample: (i, c, rate) => (i === 100 ? 32767 : sine(440, 16000)(i, c, rate)) });
  const touch = runPython('validate_wav.py', [file('touch.wav'), '--expected-seconds', '1']);
  assert.equal(touch.json.ok, true); assert.match(touch.json.warnings.join(), /headroom/);
  writeWav(file('rate.wav'), { rate: 44100, sample: sine(440, 16000) });
  assert.match(runPython('validate_wav.py', [file('rate.wav')]).json.failures.join(), /sample rate/);
  assert.match(runPython('validate_wav.py', [file('ok.wav'), '--expected-seconds', '1.5']).json.failures.join(), /duration/);
});

test('双循环截取：取第二遍、保留 16 位、拒绝覆盖与过短输入', { skip: !(hasBash && hasFfmpeg && hasPython) && 'bash/ffmpeg/python3 not found' }, t => {
  const dir = tmpdir(t);
  const input = path.join(dir, 'double loop.wav');
  writeWav(input, { seconds: 2, sample: (i, c, rate) => (i < rate ? sine(220, 8000)(i, c, rate) : sine(880, 8000)(i, c, rate)) });
  const out = path.join(dir, 'out', '第二遍.wav');
  const run = args => spawnSync('bash', [path.join(scripts, 'extract_second_loop.sh'), ...args], { encoding: 'utf8', timeout: 30000 });
  const first = run([input, out, '1']);
  assert.equal(first.status, 0, first.stderr);
  const check = runPython('validate_wav.py', [out, '--expected-seconds', '1']).json;
  assert.equal(check.ok, true); assert.equal(check.sample_width_bits, 16); assert.equal(check.channels, 2);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'default=nw=1:nk=1', out], { encoding: 'utf8' });
  assert.equal(probe.stdout.trim(), 'pcm_s16le');
  assert.equal(run([input, out, '1']).status, 73);
  assert.equal(run([input, path.join(dir, 'short.wav'), '1.5']).status, 65);
  assert.equal(run([input, path.join(dir, 'bad.wav'), 'one']).status, 64);
});
