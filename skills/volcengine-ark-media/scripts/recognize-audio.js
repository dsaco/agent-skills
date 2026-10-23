#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parseArgs } = require('node:util');

const BASE = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/';
const RESOURCE = 'volc.seedasr.auc';
const SECRET_NAMES = ['VOLCENGINE_SPEECH_API_KEY', 'VOLCENGINE_SPEECH_APP_ID', 'VOLCENGINE_SPEECH_ACCESS_TOKEN', 'ARK_API_KEY'];
function redact(value) {
  let text = String(value);
  for (const name of SECRET_NAMES) {
    const secret = process.env[name]?.trim();
    if (secret) text = text.split(secret).join('[REDACTED]');
  }
  return text;
}
function writeJson(file, data, exclusive = false) {
  fs.writeFileSync(file, redact(JSON.stringify(data, null, 2) + '\n'), { flag: exclusive ? 'wx' : 'w', mode: 0o600 });
}
function auth() {
  const key = process.env.VOLCENGINE_SPEECH_API_KEY?.trim();
  if (key) return { 'X-Api-Key': key };
  const app = process.env.VOLCENGINE_SPEECH_APP_ID?.trim();
  const token = process.env.VOLCENGINE_SPEECH_ACCESS_TOKEN?.trim();
  if (app && token) return { 'X-Api-App-Key': app, 'X-Api-Access-Key': token };
  throw new Error('Configure VOLCENGINE_SPEECH_API_KEY, or VOLCENGINE_SPEECH_APP_ID + VOLCENGINE_SPEECH_ACCESS_TOKEN. ARK_API_KEY is not used for Speech authentication.');
}
function help(action) {
  const lines = {
    submit: 'audio-transcribe --audio-url <http(s)-url> --out-dir <new-directory> [--format mp3|wav|ogg|raw] [--language zh-CN] [--speakers] [--dry-run]',
    query: 'audio-query --job <job.json> [--dry-run]',
    export: 'audio-export --result <result.json> --out-dir <new-directory> [--dry-run]',
  };
  console.log(`${lines[action]}\nModel: Doubao recording ASR 2.0 (${RESOURCE}).\nSubmit once, then query the saved job. Query performs one request, without polling.\nExports transcript.txt and, when sentence timestamps exist, transcript.srt.\nLocal files must first be hosted at a service-accessible URL; this script does not upload.\nNo dependencies. Dry-run is offline, keyless, and writes no files.`);
}
function options(action, args) {
  const common = { help: { type: 'boolean', short: 'h' }, 'dry-run': { type: 'boolean' } };
  const schemas = {
    submit: { 'audio-url': { type: 'string' }, 'out-dir': { type: 'string' }, format: { type: 'string' }, language: { type: 'string' }, speakers: { type: 'boolean' } },
    query: { job: { type: 'string' } },
    export: { result: { type: 'string' }, 'out-dir': { type: 'string' } },
  };
  if (!Object.hasOwn(schemas, action)) throw new Error('Expected submit, query, or export.');
  const { values } = parseArgs({ args, options: { ...common, ...schemas[action] }, strict: true });
  return values;
}
function newDirectory(value) {
  if (!value?.trim()) throw new Error('--out-dir is required and must be a new directory.');
  const dir = path.resolve(value);
  if (fs.existsSync(dir)) throw new Error('Output directory already exists. Use audio-query on its job.json or audio-export to a new directory; do not resubmit.');
  return dir;
}
function reserve(dir) {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.mkdirSync(dir); // Exclusive final directory; concurrent submissions cannot share it.
}
async function request(action, id, body, credentials) {
  const response = await fetch(BASE + action, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
    headers: { ...credentials, 'Content-Type': 'application/json', 'X-Api-Resource-Id': RESOURCE,
      'X-Api-Request-Id': id, ...(action === 'submit' ? { 'X-Api-Sequence': '-1' } : {}) },
    body: JSON.stringify(body),
  });
  const text = redact(await response.text());
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { unparsed: text }; }
  return { requestId: id, httpStatus: response.status,
    statusCode: response.headers.get('X-Api-Status-Code'),
    message: redact(response.headers.get('X-Api-Message') || ''),
    logId: response.headers.get('X-Tt-Logid'), body: parsed };
}
function checkResponse(response) {
  if (response.httpStatus < 200 || response.httpStatus >= 300) throw new Error(`Speech HTTP ${response.httpStatus}; inspect saved response.`);
  if (!['20000000', '20000001', '20000002'].includes(response.statusCode)) {
    throw new Error(`Speech status ${response.statusCode || 'missing'}: ${response.message || 'inspect saved response'}`);
  }
}
function timestamp(ms) {
  const n = Math.round(ms);
  return `${String(Math.floor(n / 3600000)).padStart(2, '0')}:${String(Math.floor(n / 60000) % 60).padStart(2, '0')}:${String(Math.floor(n / 1000) % 60).padStart(2, '0')},${String(n % 1000).padStart(3, '0')}`;
}
function transcript(response) {
  if (response.statusCode !== '20000000') throw new Error('Only successful saved results can be exported.');
  const result = response.body?.result;
  if (!result || typeof result.text !== 'string' || !result.text.trim()) throw new Error('Success response contains no transcript text; inspect result.json.');
  const utterances = result.utterances;
  const cues = [];
  if (utterances !== undefined && !Array.isArray(utterances)) throw new Error('Invalid utterances in result.');
  for (const u of utterances || []) {
    if (typeof u.text !== 'string' || !u.text.trim()) continue;
    if (!Number.isFinite(u.start_time) || !Number.isFinite(u.end_time) || u.start_time < 0 || u.end_time <= u.start_time) {
      throw new Error('Invalid sentence timestamps; preserve result.json and inspect before subtitle export.');
    }
    cues.push(`${cues.length + 1}\n${timestamp(u.start_time)} --> ${timestamp(u.end_time)}\n${u.text.replace(/\r?\n/g, ' ').trim()}`);
  }
  return { text: result.text + '\n', srt: cues.length ? cues.join('\n\n') + '\n' : null, cues: cues.length };
}
function saveTranscript(dir, data) {
  const files = { 'transcript.txt': data.text, ...(data.srt ? { 'transcript.srt': data.srt } : {}) };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name), safe = redact(content);
    if (fs.existsSync(file)) {
      if (fs.readFileSync(file, 'utf8') !== safe) throw new Error(`${name} already exists with different content; use audio-export to a new directory.`);
    } else fs.writeFileSync(file, safe, { flag: 'wx', mode: 0o600 });
  }
  return { text: path.join(dir, 'transcript.txt'), srt: data.srt ? path.join(dir, 'transcript.srt') : null, subtitleCues: data.cues };
}
async function main(args = process.argv.slice(2)) {
  const [action, ...rest] = args, opts = options(action, rest);
  if (opts.help) return help(action);
  if (action === 'submit') {
    if (!opts['audio-url']) throw new Error('--audio-url is required; local paths are not uploaded automatically.');
    const url = new URL(opts['audio-url']);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Audio must be an HTTP(S) URL without embedded credentials.');
    const format = opts.format || path.extname(url.pathname).slice(1).toLowerCase();
    if (!['mp3', 'wav', 'ogg', 'raw'].includes(format)) throw new Error('Specify --format mp3|wav|ogg|raw. Extract audio from videos first.');
    const dir = newDirectory(opts['out-dir']);
    const payload = { user: { uid: 'ark-media-cli' }, audio: { url: url.href, format, ...(opts.language ? { language: opts.language } : {}) },
      request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true, enable_ddc: false, show_utterances: true, enable_speaker_info: Boolean(opts.speakers) } };
    if (opts['dry-run']) return console.log(JSON.stringify({ dryRun: true, url: BASE + 'submit', resourceId: RESOURCE, outDir: dir,
      payload: { ...payload, audio: { ...payload.audio, url: '[audio URL omitted]' } }, remoteAudioValidated: false }, null, 2));
    const credentials = auth();
    reserve(dir);
    const jobFile = path.join(dir, 'job.json');
    const job = { requestId: randomUUID(), resourceId: RESOURCE, state: 'submitting', createdAt: new Date().toISOString(), format };
    writeJson(jobFile, job, true); // Persist the caller-generated ID before the paid POST.
    try {
      const response = await request('submit', job.requestId, payload, credentials);
      writeJson(path.join(dir, 'submit.json'), response, true);
      checkResponse(response);
      job.state = 'submitted';
      writeJson(jobFile, job);
      console.log(JSON.stringify({ state: job.state, job: jobFile, requestId: job.requestId, next: 'audio-query --job <job.json>' }, null, 2));
    } catch (error) {
      job.state = 'unknown';
      writeJson(jobFile, job);
      throw new Error(`Submission not confirmed. Keep job.json and query the same ID; do not resubmit automatically. ${error.message}`);
    }
  } else if (action === 'query') {
    if (!opts.job) throw new Error('--job is required.');
    const jobFile = path.resolve(opts.job), dir = path.dirname(jobFile);
    const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(job.requestId) || job.resourceId !== RESOURCE) throw new Error('Invalid Speech 2.0 job.json.');
    if (opts['dry-run']) return console.log(JSON.stringify({ dryRun: true, url: BASE + 'query', requestId: job.requestId, resourceId: RESOURCE, outDir: dir }, null, 2));
    const response = await request('query', job.requestId, {}, auth());
    // Keep the last successful response usable even if a later query fails.
    writeJson(path.join(dir, 'query.json'), response);
    checkResponse(response);
    if (response.statusCode !== '20000000') {
      console.log(JSON.stringify({ state: response.statusCode === '20000001' ? 'processing' : 'queued', job: jobFile }));
      return;
    }
    writeJson(path.join(dir, 'result.json'), response);
    const files = saveTranscript(dir, transcript(response));
    job.state = 'succeeded'; writeJson(jobFile, job);
    console.log(JSON.stringify({ state: 'succeeded', result: path.join(dir, 'result.json'), ...files }, null, 2));
  } else {
    if (!opts.result) throw new Error('--result is required.');
    const response = JSON.parse(fs.readFileSync(path.resolve(opts.result), 'utf8'));
    const data = transcript(response), dir = newDirectory(opts['out-dir']);
    if (opts['dry-run']) return console.log(JSON.stringify({ dryRun: true, outDir: dir, subtitleCues: data.cues }));
    reserve(dir);
    console.log(JSON.stringify(saveTranscript(dir, data), null, 2));
  }
}
if (require.main === module) main().catch(error => { console.error(`Error: ${redact(error.message)}`); process.exitCode = 1; });
module.exports = { main, transcript };
