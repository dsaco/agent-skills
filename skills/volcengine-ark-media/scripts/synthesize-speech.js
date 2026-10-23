#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parseArgs } = require('node:util');
const URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
const RESOURCE = 'seed-tts-2.0';
const MAX_STREAM = 128 * 1024 * 1024;
const RATES = [8000, 16000, 22050, 24000, 32000, 44100, 48000];
function redact(value) {
  let s = String(value);
  for (const name of ['VOLCENGINE_SPEECH_API_KEY', 'VOLCENGINE_SPEECH_APP_ID', 'VOLCENGINE_SPEECH_ACCESS_TOKEN', 'ARK_API_KEY']) {
    const key = process.env[name]?.trim();
    if (key) s = s.split(key).join('[REDACTED]');
  }
  return s;
}
function json(file, value) { fs.writeFileSync(file, redact(JSON.stringify(value, null, 2) + '\n'), { mode: 0o600 }); }
function auth() {
  const key = process.env.VOLCENGINE_SPEECH_API_KEY?.trim();
  if (key) return { 'X-Api-Key': key };
  const app = process.env.VOLCENGINE_SPEECH_APP_ID?.trim(), token = process.env.VOLCENGINE_SPEECH_ACCESS_TOKEN?.trim();
  // TTS uses App-Id; ASR's legacy App-Key header is not interchangeable.
  if (app && token) return { 'X-Api-App-Id': app, 'X-Api-Access-Key': token };
  throw new Error('Configure VOLCENGINE_SPEECH_API_KEY or Speech APP_ID + ACCESS_TOKEN. ARK_API_KEY is not used.');
}
function options(args) {
  const [action, ...rest] = args;
  if (!['create', 'recover'].includes(action)) throw new Error('Expected create or recover.');
  const shared = { help: { type: 'boolean', short: 'h' }, 'dry-run': { type: 'boolean' }, 'out-dir': { type: 'string' } };
  const create = Object.fromEntries(['text', 'text-file', 'speaker', 'format', 'sample-rate', 'speech-rate', 'loudness-rate', 'instruction'].map(k => [k, { type: 'string' }]));
  const { values, tokens } = parseArgs({ args: rest, strict: true, tokens: true, options: { ...shared, ...(action === 'create' ? create : { job: { type: 'string' } }) } });
  const seen = new Set();
  for (const t of tokens) if (t.kind === 'option') { if (seen.has(t.name)) throw new Error(`Duplicate --${t.name}`); seen.add(t.name); }
  return { action, opts: values };
}
function newDir(value) {
  if (!value?.trim()) throw new Error('--out-dir must name a new directory.');
  const dir = path.resolve(value);
  if (fs.existsSync(dir)) throw new Error('Output directory exists. Inspect its request.json; do not repeat synthesis.');
  return dir;
}
function reserve(dir) { fs.mkdirSync(path.dirname(dir), { recursive: true }); fs.mkdirSync(dir); }
function build(opts) {
  if ((opts.text !== undefined) === (opts['text-file'] !== undefined)) throw new Error('Provide exactly one of --text or --text-file.');
  let text = opts.text;
  if (opts['text-file'] !== undefined) {
    const stat = fs.lstatSync(opts['text-file']);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('--text-file must be a regular UTF-8 file under 1 MiB.');
    text = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(opts['text-file']));
  }
  if (!text.trim()) throw new Error('Text is empty.');
  if (!opts.speaker || !/^[a-zA-Z0-9_-]+$/.test(opts.speaker)) throw new Error('--speaker must be an official TTS 2.0 voice ID.');
  const format = opts.format ?? 'mp3', rate = Number(opts['sample-rate'] ?? 24000);
  if (!['mp3', 'pcm', 'wav'].includes(format)) throw new Error('--format must be mp3, pcm, or wav.');
  if (!RATES.includes(rate)) throw new Error(`--sample-rate must be ${RATES.join(', ')}.`);
  const audio = { format: format === 'wav' ? 'pcm' : format, sample_rate: rate };
  for (const option of ['speech-rate', 'loudness-rate']) if (opts[option] !== undefined) {
    const n = Number(opts[option]);
    if (!opts[option].trim() || !Number.isFinite(n) || n < -50 || n > 100) throw new Error(`--${option} must be between -50 and 100.`);
    audio[option.replaceAll('-', '_')] = n;
  }
  const req = { text, speaker: opts.speaker, audio_params: audio };
  if (opts.instruction !== undefined) {
    if (!opts.instruction.trim()) throw new Error('--instruction cannot be empty.');
    // additions is a JSON-encoded string in the official HTTP contract.
    req.additions = JSON.stringify({ context_texts: [opts.instruction] });
  }
  return { format, rate, payload: { user: { uid: 'ark-media-cli' }, req_params: req } };
}
function collector() {
  const chunks = []; let complete = false, usage;
  return {
    accept(event) {
      if (!event || typeof event !== 'object' || complete) throw new Error('Unexpected event after completion or invalid event.');
      if (event.code !== 0 && event.code !== 20000000) throw new Error(`TTS service error ${event.code}: ${redact(event.message || '')}`);
      if (event.data !== undefined && event.data !== null && event.data !== '') {
        if (typeof event.data !== 'string' || event.data.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.data)) throw new Error('Invalid Base64 audio.');
        chunks.push(Buffer.from(event.data, 'base64'));
      }
      if (event.code === 20000000) { complete = true; usage = event.usage; }
    },
    finish() {
      if (!complete) throw new Error('Stream ended without success marker; partial audio is not a completed synthesis.');
      const bytes = Buffer.concat(chunks);
      if (!bytes.length) throw new Error('Successful stream contains no audio.');
      return { bytes, usage };
    },
  };
}
function audioFile(bytes, format, rate) {
  if (format === 'mp3') {
    if (!(bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224))) throw new Error('Response lacks an MP3 signature.');
    return bytes;
  }
  if (bytes.length % 2) throw new Error('PCM16 audio has an odd byte count.');
  if (format === 'pcm') return bytes;
  const h = Buffer.alloc(44);
  h.write('RIFF'); h.writeUInt32LE(bytes.length + 36, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(bytes.length, 40);
  return Buffer.concat([h, bytes]);
}
function publish(dir, bytes, format, rate) {
  const file = path.join(dir, `speech.${format}`), part = file + '.part';
  fs.writeFileSync(part, audioFile(bytes, format, rate), { flag: 'wx', mode: 0o600 });
  fs.linkSync(part, file); // Refuse replacement, including on a concurrent recovery.
  fs.unlinkSync(part);
  return file;
}
async function main(args = process.argv.slice(2)) {
  const { action, opts } = options(args);
  if (opts.help) {
    console.log(action === 'create'
      ? 'audio-synthesize (--text TEXT | --text-file FILE) --speaker VOICE_ID --out-dir NEW_DIR [--format mp3|pcm|wav] [--sample-rate 24000] [--speech-rate -50..100] [--loudness-rate -50..100] [--instruction TEXT] [--dry-run]'
      : 'audio-recover --job REQUEST_JSON --out-dir NEW_DIR [--dry-run]');
    console.log('TTS 2.0 preset voices; no voice cloning. Keyless dry-run. Recovery is offline and requires a complete saved stream.');
    return;
  }
  const dir = newDir(opts['out-dir']);
  if (action === 'recover') {
    if (!opts.job) throw new Error('--job is required.');
    const jobFile = path.resolve(opts.job), job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
    if (job.resourceId !== RESOURCE || !['mp3', 'pcm', 'wav'].includes(job.format) || !RATES.includes(job.rate)) throw new Error('Invalid TTS 2.0 request record.');
    const events = path.join(path.dirname(jobFile), 'events.jsonl');
    if (fs.statSync(events).size > MAX_STREAM) throw new Error('Saved stream exceeds 128 MiB limit.');
    const c = collector();
    for (const line of fs.readFileSync(events, 'utf8').split(/\r?\n/)) if (line.trim()) c.accept(JSON.parse(line));
    const { bytes, usage } = c.finish();
    audioFile(bytes, job.format, job.rate);
    if (opts['dry-run']) return console.log(JSON.stringify({ dryRun: true, outDir: dir, audioBytes: bytes.length }));
    reserve(dir);
    const file = publish(dir, bytes, job.format, job.rate);
    json(path.join(dir, 'recovery.json'), { sourceRequest: jobFile, requestId: job.requestId, file, usage });
    console.log(JSON.stringify({ state: 'recovered', file })); return;
  }
  const plan = build(opts);
  if (opts['dry-run']) return console.log(redact(JSON.stringify({ dryRun: true, url: URL, resourceId: RESOURCE, ...plan, outDir: dir, voiceAvailabilityVerified: false }, null, 2)));
  const credentials = auth();
  reserve(dir);
  const requestFile = path.join(dir, 'request.json');
  const job = { resourceId: RESOURCE, requestId: randomUUID(), state: 'submitting', createdAt: new Date().toISOString(), ...plan };
  json(requestFile, job);
  let fd;
  try {
    fd = fs.openSync(path.join(dir, 'events.jsonl'), 'wx', 0o600);
    const r = await fetch(URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
      headers: { ...credentials, 'Content-Type': 'application/json', 'X-Api-Resource-Id': RESOURCE, 'X-Api-Request-Id': job.requestId, 'X-Control-Require-Usage-Tokens-Return': '*' }, body: JSON.stringify(plan.payload) });
    json(path.join(dir, 'response.json'), { httpStatus: r.status, logId: r.headers.get('X-Tt-Logid'), message: r.headers.get('X-Api-Message') });
    if (!r.ok) { await r.body?.cancel(); throw new Error(`TTS HTTP ${r.status}; inspect response.json.`); }
    if (!r.body) throw new Error('Empty response body.');
    const decoder = new TextDecoder('utf-8', { fatal: true }), c = collector();
    let pending = '', size = 0;
    function line(raw) {
      if (!raw.trim()) return;
      const event = JSON.parse(raw);
      // Retain the event before validation so local export can recover a complete response.
      fs.writeSync(fd, redact(JSON.stringify(event)) + '\n');
      c.accept(event);
    }
    for await (const chunk of r.body) {
      size += chunk.length;
      if (size > MAX_STREAM) throw new Error('Response exceeds 128 MiB limit.');
      pending += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = pending.indexOf('\n')) >= 0) { line(pending.slice(0, end)); pending = pending.slice(end + 1); }
    }
    pending += decoder.decode(); line(pending);
    fs.closeSync(fd); fd = undefined;
    const { bytes, usage } = c.finish();
    job.state = 'received'; job.usage = usage; json(requestFile, job);
    const file = publish(dir, bytes, plan.format, plan.rate);
    job.state = 'succeeded'; job.file = file; json(requestFile, job);
    console.log(JSON.stringify({ state: 'succeeded', file, requestFile, usage, validation: 'Header and nonempty bytes only; listening and decoding not performed.' }, null, 2));
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    job.state = job.state === 'received' ? 'export_failed' : 'unknown';
    job.error = redact(error.message); json(requestFile, job);
    throw new Error(`${error.message} Preserve request.json/events.jsonl; do not automatically resubmit. Complete streams can use audio-recover.`);
  }
}
if (require.main === module) main().catch(e => { console.error(redact(e.message)); process.exitCode = 1; });
module.exports = { main, build, collector, audioFile };
