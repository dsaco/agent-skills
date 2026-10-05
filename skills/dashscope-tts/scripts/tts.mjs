#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRequest, endpoint, A_MODELS, B_MODELS } from './models.mjs';

const MAX_JSON = 16 * 1024 * 1024;
const MAX_AUDIO = 128 * 1024 * 1024;
async function jsonFile(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX_JSON) throw new Error('JSON file is not a regular file or exceeds 16 MiB.');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
async function exists(file) { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function newDirectory(dir, create) {
  if (await exists(dir)) throw new Error('Output directory already exists. Inspect the prior job; use a new directory only for an authorized new job/recovery.');
  if (create) { await fs.mkdir(path.dirname(dir), { recursive: true }); await fs.mkdir(dir, { mode: 0o700 }); }
}
async function saveJson(file, value) {
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await fs.rename(tmp, file);
}
async function bounded(response, limit) {
  const chunks = []; let size = 0;
  if (!response.body) throw new Error('Empty response body.');
  for await (const chunk of response.body) { size += chunk.length; if (size > limit) throw new Error('Response exceeds local size limit.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function successful(result) {
  if (!result || result.code || (result.status_code !== undefined && result.status_code !== 200) || result.output?.finish_reason !== 'stop') throw new Error('Response is not a completed synthesis. Inspect saved result.json.');
}
function verifyAudio(bytes, format) {
  if (!bytes.length) throw new Error('Empty audio.');
  const ascii = (a,b) => bytes.toString('ascii', a,b);
  const valid = format === 'pcm' || (format === 'wav' && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WAVE') || (format === 'mp3' && (ascii(0,3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224))) || (format === 'opus' && ascii(0,4) === 'OggS' && bytes.subarray(0,256).includes(Buffer.from('OpusHead')));
  if (!valid) throw new Error('Audio signature does not match requested format.');
}
async function audio(result, format, dir, fetchFn) {
  successful(result);
  const item = result.output.audio; let bytes;
  if (item?.data) {
    if (typeof item.data !== 'string' || item.data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data)) throw new Error('Invalid Base64 audio.');
    bytes = Buffer.from(item.data, 'base64');
  } else {
    const url = new URL(item?.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid media URL.');
    const response = await fetchFn(url.href, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Audio download HTTP ${response.status}; use download, not synthesize.`);
    bytes = await bounded(response, MAX_AUDIO);
  }
  verifyAudio(bytes, format);
  const out = path.join(dir, `audio.${format}`), tmp = out + '.part';
  await fs.writeFile(tmp, bytes, { flag: 'wx', mode: 0o600 });
  await fs.link(tmp, out); await fs.unlink(tmp);
  await saveJson(path.join(dir, 'downloads.json'), { file: out, bytes: bytes.length, format, decoded: false });
  return out;
}
function parse(argv) {
  const [action, ...rest] = argv, opts = {};
  const allowed = action === 'synthesize' ? ['--request', '--out-dir', '--workspace'] : action === 'download' ? ['--result', '--format', '--out-dir'] : [];
  for (let i=0;i<rest.length;i++) {
    const key = rest[i];
    if (key === '--dry-run') { opts.dryRun = true; continue; }
    if (!allowed.includes(key) || opts[key] !== undefined || !rest[i+1]?.trim() || rest[i+1].startsWith('--')) throw new Error('Unknown, duplicate or incomplete option.');
    opts[key] = rest[++i];
  }
  return { action, opts };
}
export async function run(argv, { env = process.env, fetchFn = globalThis.fetch, log = console.log } = {}) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    log('Usage:\n  tts.mjs synthesize --request <json> --out-dir <new-directory> [--workspace <id>] [--dry-run]\n  tts.mjs download --result <result.json> --format <mp3|wav|pcm|opus> --out-dir <new-directory> [--dry-run]\n  tts.mjs models\nNon-streaming only. API key from DASHSCOPE_API_KEY; download needs no key.'); return;
  }
  const { action, opts } = parse(argv);
  if (action === 'models') { if (argv.length !== 1) throw new Error('models accepts no options.'); log(JSON.stringify({ A: A_MODELS, B: B_MODELS }, null, 2)); return; }
  if (!['synthesize','download'].includes(action) || !opts['--out-dir']) throw new Error('Specify synthesize/download and --out-dir.');
  const dir = path.resolve(opts['--out-dir']);
  await newDirectory(dir, false);
  if (action === 'download') {
    if (!opts['--result'] || !['mp3','wav','pcm','opus'].includes(opts['--format'])) throw new Error('download requires --result and --format.');
    const result = await jsonFile(opts['--result']); successful(result);
    if (opts.dryRun) { log(JSON.stringify({ dryRun: true, action, outDir: dir, format: opts['--format'] })); return; }
    await newDirectory(dir, true);
    const out = await audio(result, opts['--format'], dir, fetchFn);
    log(JSON.stringify({ file: out, sourceResult: path.resolve(opts['--result']) })); return;
  }
  if (!opts['--request']) throw new Error('synthesize requires --request.');
  const body = await jsonFile(opts['--request']);
  const { route, format } = validateRequest(body), url = endpoint(route, opts['--workspace']);
  if (opts.dryRun) { log(JSON.stringify({ dryRun: true, url, route, format, payload: body, outDir: dir }, null, 2)); return; }
  const key = env.DASHSCOPE_API_KEY?.trim();
  if (!key) throw new Error('DASHSCOPE_API_KEY environment variable is required.');
  // Private task inputs are allowed on disk, but never persist the API credential even if echoed.
  const redact = value => JSON.parse(JSON.stringify(value).split(key).join('[REDACTED]'));
  await newDirectory(dir, true);
  const record = path.join(dir, 'request.json');
  await saveJson(record, redact({ state: 'submitting', url, route, format, payload: body }));
  let result;
  try {
    const response = await fetchFn(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(120000) });
    const bytes = await bounded(response, MAX_JSON);
    result = JSON.parse(bytes.toString('utf8'));
    await saveJson(path.join(dir, 'result.json'), redact(result));
    await saveJson(record, redact({ state: 'received', url, route, format, requestId: result?.request_id ?? null, httpStatus: response.status, payload: body }));
    if (!response.ok) throw new Error(`Synthesis HTTP ${response.status}.`);
  } catch {
    // Keep request.json and any received response. No automatic resubmission.
    throw new Error('Submission failed or outcome unknown. Inspect request.json/result.json and the provider console; do not resubmit automatically.');
  }
  const out = await audio(result, format, dir, fetchFn);
  log(JSON.stringify(redact({ file: out, resultFile: path.join(dir, 'result.json'), requestId: result?.request_id ?? null })));
}

async function main() {
  try { await run(process.argv.slice(2)); }
  catch (error) {
    // Avoid arbitrary upstream error bodies/URLs in logs.
    const key = process.env.DASHSCOPE_API_KEY?.trim();
    let message = error instanceof Error ? error.message : 'Operation failed.';
    if (key) message = message.split(key).join('[REDACTED]');
    if (error instanceof SyntaxError || error instanceof TypeError) message = 'Invalid JSON, URL or network response. Inspect local task records; do not resubmit generation automatically.';
    console.error(`Error: ${message}`); process.exitCode = 1;
  }
}
if (process.argv[1] && await fs.realpath(process.argv[1]).catch(() => '') === await fs.realpath(fileURLToPath(import.meta.url))) await main();
