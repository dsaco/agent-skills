#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fetchWithTimeout, writeMedia } = require('./runtime.js');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const option = argv[i];
    if (option === '--dry-run') { args.dryRun = true; continue; }
    if (!['--result', '--out-dir'].includes(option)) throw new Error(`Unknown option: ${option}`);
    if (!argv[i + 1]?.trim() || argv[i + 1].startsWith('--')) throw new Error(`${option} requires a value.`);
    if (args[option]) throw new Error(`Duplicate option: ${option}`);
    args[option] = argv[++i];
  }
  if (!args['--result'] || !args['--out-dir']) throw new Error('--result and --out-dir are required.');
  return args;
}

function extension(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return '.jpeg';
  throw new Error('Expected nonempty PNG or JPEG bytes; inspect the saved response.');
}

async function imageBytes(item) {
  if (typeof item?.b64_json === 'string' && item.b64_json) {
    if (item.b64_json.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json)) {
      throw new Error('Invalid base64 image.');
    }
    return Buffer.from(item.b64_json, 'base64');
  }
  if (typeof item?.url !== 'string' || !item.url) throw new Error('Image item has neither url nor b64_json.');
  // No API key or headers; never submit a generation request from a recovery operation.
  const response = await fetchWithTimeout(item.url, { method: 'GET' });
  if (!response.ok) throw new Error(`Image download failed HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: ark-media.js image-download --result <saved-response.json> --out-dir <new-directory> [--dry-run]\nDownloads saved data[] only. No API key, generation, or overwrite.');
    return;
  }
  const args = parseArgs(argv);
  const source = path.resolve(args['--result']);
  const outDir = path.resolve(args['--out-dir']);
  const result = JSON.parse(fs.readFileSync(source, 'utf8'));
  if (!Array.isArray(result?.data) || !result.data.length) throw new Error('Saved response must contain a nonempty data array.');
  // lstat catches dangling symlinks as well as existing files/directories.
  try {
    fs.lstatSync(outDir);
    throw new Error('Output directory already exists. Choose a new recovery directory.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (args.dryRun) {
    console.log(JSON.stringify({ dryRun: true, resultFile: source, count: result.data.length, outDir }, null, 2));
    return;
  }
  fs.mkdirSync(path.dirname(outDir), { recursive: true });
  fs.mkdirSync(outDir); // Exclusive reservation, including concurrent invocations.
  const items = [];
  for (const [index, item] of result.data.entries()) {
    try {
      const bytes = await imageBytes(item);
      const out = path.join(outDir, `image-${index + 1}${extension(bytes)}`);
      writeMedia(out, bytes);
      items.push({ index: index + 1, path: out, bytes: bytes.length });
    } catch {
      // Avoid echoing signed URLs, embedded credentials or response bodies in errors.
      items.push({ index: index + 1, error: 'Download, decoding or save failed; inspect this response item and local output permissions.' });
    }
  }
  console.log(JSON.stringify({ resultFile: source, outDir, items }, null, 2));
  if (items.some(item => item.error)) process.exitCode = 1;
}

main().catch(() => {
  console.error('Image recovery failed: check arguments, saved JSON and a new output directory. Use image-download --help.');
  process.exitCode = 1;
});
