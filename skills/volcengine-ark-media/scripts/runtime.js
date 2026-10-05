'use strict';

const fs = require('node:fs');
const path = require('node:path');

function validateName(value, label = '--name') {
  if (!value.trim() || value === '.' || value === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(value)
      || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) {
    throw new Error(`${label} must be a portable file name, not a path.`);
  }
}

// Only the API request carries credentials. Reject redirects rather than forwarding them.
function fetchWithTimeout(url, options) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Only HTTP(S) URLs without embedded credentials are supported.');
  }
  return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(600_000) });
}

function redact(text) {
  const key = process.env.ARK_API_KEY?.trim();
  return key ? String(text).split(key).join('[REDACTED]') : String(text);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, redact(`${JSON.stringify(value, null, 2)}\n`), { mode: 0o600 });
}

function writeMedia(outPath, bytes) {
  if (!bytes.length) throw new Error('Downloaded media is empty; use the saved response to retry downloading, not generation.');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const temporary = `${outPath}.part`;
  // Leave failed or pre-existing .part files for explicit recovery, not blind deletion.
  fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, outPath);
}

// Reserve the output BEFORE a paid POST. A timeout is not evidence of rejection.
async function submitOnce(outputPath, operation) {
  if (fs.existsSync(outputPath)) throw new Error('Response file already exists. Inspect it; do not resubmit automatically.');
  const marker = `${outputPath}.submission.json`;
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  try {
    fs.writeFileSync(marker, JSON.stringify({ state: 'submitting', responseFile: outputPath }), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Submission marker already exists. Check the prior task; do not resubmit automatically.');
    throw error;
  }
  try {
    const result = await operation();
    writeJson(outputPath, result);
    writeJson(marker, { state: 'received', responseFile: outputPath });
    return result;
  } catch (error) {
    writeJson(marker, { state: 'unknown', responseFile: outputPath });
    throw new Error(`Submission outcome may be unknown. Do not resubmit automatically. ${redact(error.message)}`);
  }
}

module.exports = { validateName, fetchWithTimeout, redact, writeJson, writeMedia, submitOnce };
