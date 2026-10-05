#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VARIABLES = ['QINIU_ACCESS_KEY', 'QINIU_SECRET_KEY', 'QINIU_BUCKET', 'QINIU_DOMAIN'];
function printHelp(log) {
  log(`Usage: upload.js --file <path> [options]
  --dir <prefix>      Only when user explicitly requests a prefix; default ai/YYYY-MM-DD.
  --name <filename>   Override object filename; takes precedence over --keep-name.
  --keep-name         Use local basename; default UUID with original extension.
  --https             Compatibility option; HTTPS is always enabled.
  --accelerate        Use bucket upload acceleration (explicit opt-in, may cost more).
  --dry-run           Read bucket/domain only; no credentials, SDK, network or output files.
  -h, --help          Show help.
Environment (all required for upload):
  QINIU_ACCESS_KEY    Access Key; never printed.
  QINIU_SECRET_KEY    Secret Key; never printed.
  QINIU_BUCKET        Destination bucket; no built-in default.
  QINIU_DOMAIN        HTTPS delivery origin, e.g. https://cdn.example.com; no built-in default.`);
}
function parseArgs(argv) {
  const args = { file: '', dir: '', name: '', keepName: false, accelerate: false, dryRun: false };
  const seen = new Set();
  for (let i=0;i<argv.length;i++) {
    const flag = argv[i];
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === '--dry-run') { args.dryRun = true; continue; }
    if (flag === '--keep-name') { args.keepName = true; continue; }
    if (flag === '--accelerate') { args.accelerate = true; continue; }
    if (flag === '--https') continue;
    if (!['--file','--dir','--name'].includes(flag)) throw new Error('Unknown option. See --help.');
    const value = argv[++i];
    if (!value?.trim() || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    args[flag.slice(2)] = value;
  }
  if (!args.file) throw new Error('--file is required.');
  return args;
}
function environment(env, dryRun) {
  const names = dryRun ? VARIABLES.slice(2) : VARIABLES;
  const values = {}, missing = [];
  for (const name of names) {
    const value = env[name];
    if (typeof value !== 'string' || !value.trim()) missing.push(name);
    else values[name] = value.trim();
  }
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(values.QINIU_BUCKET)) throw new Error('QINIU_BUCKET must be a valid 3–63 character bucket name.');
  let domain;
  try { domain = new URL(values.QINIU_DOMAIN); } catch { throw new Error('QINIU_DOMAIN must be an HTTPS origin.'); }
  if (domain.protocol !== 'https:' || domain.username || domain.password || domain.search || domain.hash || domain.pathname !== '/') throw new Error('QINIU_DOMAIN must be an HTTPS origin without credentials, path, query or fragment.');
  // Prevent accidental key reuse as printable destination configuration.
  if (!dryRun && [values.QINIU_ACCESS_KEY, values.QINIU_SECRET_KEY].some(secret => values.QINIU_BUCKET.includes(secret) || domain.origin.includes(secret))) throw new Error('Destination configuration must not contain credentials.');
  return { bucket: values.QINIU_BUCKET, domain: domain.origin, accessKey: values.QINIU_ACCESS_KEY, secretKey: values.QINIU_SECRET_KEY };
}
function safePart(value) {
  return value && value !== '.' && value !== '..' && !/[\\/\x00-\x1f\x7f]/.test(value);
}
function plan(args, config, now, uuid) {
  const file = path.resolve(args.file), stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Input must be a regular file, not a directory or symlink.');
  const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const prefix = args.dir ? args.dir.replace(/^\/+|\/+$/g, '') : `ai/${date}`;
  if (!prefix.split('/').every(safePart)) throw new Error('Invalid --dir prefix.');
  const name = args.name || (args.keepName ? path.basename(file) : `${uuid}${path.extname(file)}`);
  if (!safePart(name)) throw new Error('--name must be a filename, not a path.');
  const key = `${prefix}/${name}`;
  if (Buffer.byteLength(key) > 750) throw new Error('Object key exceeds local 750-byte limit.');
  return { bucket: config.bucket, key, file, size: stat.size, https: true, accelerate: args.accelerate, insertOnly: true, url: `${config.domain}/${key.split('/').map(encodeURIComponent).join('/')}` };
}
function loadSdk() {
  try { return require('qiniu'); }
  catch { throw new Error('Missing qiniu SDK. After user approval, run npm install --omit=dev --ignore-scripts in the Skill directory.'); }
}
async function run(argv, { env = process.env, sdkLoader = loadSdk, now = new Date(), uuid = crypto.randomUUID(), log = console.log } = {}) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { printHelp(log); return; }
  const args = parseArgs(argv);
  const config = environment(env, args.dryRun);
  const uploadPlan = plan(args, config, now, uuid);
  if (args.dryRun) { log(JSON.stringify({ dryRun: true, ...uploadPlan }, null, 2)); return uploadPlan; }
  if ([config.accessKey, config.secretKey].some(secret => JSON.stringify(uploadPlan).includes(secret))) throw new Error('Upload metadata must not contain credentials.');
  const qiniu = sdkLoader();
  let result;
  // Avoid echoing SDK errors: they can contain credentials, signed URLs or token-bearing requests.
  try {
    const mac = new qiniu.auth.digest.Mac(config.accessKey, config.secretKey);
    const policy = new qiniu.rs.PutPolicy({ scope: `${config.bucket}:${uploadPlan.key}`, insertOnly: 1, expires: 600 });
    const token = policy.uploadToken(mac);
    const uploader = new qiniu.form_up.FormUploader(new qiniu.conf.Config({ useHttpsDomain: true, accelerateUploading: args.accelerate }));
    // Safe evidence before network I/O: enables console reconciliation after an unknown outcome.
    log(JSON.stringify({ state: 'uploading', ...uploadPlan }));
    result = await uploader.putFile(token, uploadPlan.key, uploadPlan.file, new qiniu.form_up.PutExtra());
    if (result?.resp?.statusCode !== 200 || result?.data?.key !== uploadPlan.key || typeof result?.data?.hash !== 'string' || !result.data.hash) throw new Error('Invalid upload response.');
  } catch {
    throw new Error('Upload failed or outcome unknown. Check the bucket/key from the uploading record before retrying; the script will not start another upload automatically.');
  }
  const output = { state: 'uploaded', statusCode: 200, ...uploadPlan, hash: result.data.hash, urlVerified: false };
  const serialized = JSON.stringify(output, null, 2);
  if ([config.accessKey, config.secretKey].some(secret => serialized.includes(secret))) throw new Error('Upload response contained credentials; output suppressed. Reconcile the object in the provider console.');
  log(serialized);
  return output;
}
module.exports = { run, parseArgs, environment, plan };
if (require.main === module) {
  run(process.argv.slice(2)).catch(error => {
    let message = error instanceof Error ? error.message : 'Upload failed.';
    if (!process.argv.includes('--dry-run')) {
      for (const name of VARIABLES.slice(0,2)) {
        const secret = process.env[name]?.trim(); if (secret) message = message.split(secret).join('[REDACTED]');
      }
    }
    process.stderr.write(`Error: ${message}\n`); process.exitCode = 1;
  });
}
