#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { validateName, fetchWithTimeout, redact, writeJson, writeMedia, submitOnce } = require('./runtime.js');

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_OUTPUT_DIR = 'output/seedance';
const PRICE_PER_MILLION_TOKENS = {
  'doubao-seedance-2.0': {
    noInputVideo: { low: 46, high: 51 },
    withInputVideo: { low: 28, high: 31 },
  },
  'doubao-seedance-2.0-fast': {
    noInputVideo: { low: 37, high: null },
    withInputVideo: { low: 22, high: null },
  },
};


function die(message, code = 1) {
  process.stderr.write(`Error: ${redact(message)}\n`);
  process.exit(code);
}

function printHelp() {
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  query-video.js --id <task-id> [options]\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --id <task-id>       Video generation task ID. Required.\n`);
  process.stdout.write(`  --name <name>        Output bundle name. Default: task ID.\n`);
  process.stdout.write(`  --dir <path>         Output root directory. Default: ${DEFAULT_OUTPUT_DIR}\n`);
  process.stdout.write(`  --out <path>         Override output video path and infer bundle directory from it.\n`);
  process.stdout.write(`  --last-frame-out <path> Download content.last_frame_url when present.\n`);
  process.stdout.write(`  --json-out <path>    Raw JSON output path. Default: <dir>/<name>/<name>.json\n`);
  process.stdout.write(`  --price-out <path>   Price JSON path. Default: <out-dir>/<out-name>/<out-name>.price.json\n`);
  process.stdout.write(`  --input-has-video    Use Seedance 2.0 price tier for requests containing input video.\n`);
  process.stdout.write(`  --dry-run            Print request without calling API.\n`);
  process.stdout.write(`  --help               Show this help.\n`);
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const args = {
    id: '',
    name: '',
    dir: DEFAULT_OUTPUT_DIR,
    out: '',
    lastFrameOut: '',
    jsonOut: '',
    priceOut: '',
    inputHasVideo: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--input-has-video') {
      args.inputHasVideo = true;
      continue;
    }
    if (!next || next.startsWith('--')) die(`${arg} requires a value.`, 2);

    if (arg === '--id') args.id = next;
    else if (arg === '--name') args.name = next;
    else if (arg === '--dir') args.dir = next;
    else if (arg === '--out') args.out = next;
    else if (arg === '--last-frame-out') args.lastFrameOut = next;
    else if (arg === '--json-out') args.jsonOut = next;
    else if (arg === '--price-out') args.priceOut = next;
    else die(`Unknown argument: ${arg}`, 2);

    index += 1;
  }
  return args;
}

function arkApiKey() {
  const value = process.env.ARK_API_KEY;
  if (!value || !value.trim()) die('ARK_API_KEY environment variable is required.', 2);
  return value.trim();
}

function baseUrl() {
  return DEFAULT_BASE_URL;
}

function validateArgs(args) {
  if (!args.id.trim()) die('--id is required.', 2);
  if (!args.dir.trim()) die('--dir cannot be empty.', 2);
  validateName(args.name || args.id, args.name ? '--name' : '--id');
}

async function queryTask(id) {
  const url = `${baseUrl()}/contents/generations/tasks/${encodeURIComponent(id)}`;
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${arkApiKey()}` },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) die(`Query task failed HTTP ${response.status}: ${text}`);
  return data;
}

async function downloadFile(url, outPath) {
  const response = await fetchWithTimeout(url, { method: 'GET' });
  if (!response.ok) {
    const text = await response.text();
    die(`Download failed HTTP ${response.status}: ${text}`);
  }
  writeMedia(outPath, Buffer.from(await response.arrayBuffer()));
  process.stdout.write(`Wrote ${outPath}\n`);
}



async function maybeDownload(result, args) {
  const videoPath = videoOutPath(args);
  const lastFramePath = lastFrameOutPath(args);
  if (videoPath) {
    if (result.status !== 'succeeded') die(`Task is ${result.status}; video is not ready.`);
    if (!result.content || !result.content.video_url) die('Task response does not contain content.video_url.');
    await downloadFile(result.content.video_url, videoPath);
  }
  if (lastFramePath) {
    if (result.status !== 'succeeded') die(`Task is ${result.status}; last frame is not ready.`);
    if (!result.content || !result.content.last_frame_url) {
      if (args.lastFrameOut) die('Task response does not contain content.last_frame_url.');
      return;
    }
    await downloadFile(result.content.last_frame_url, lastFramePath);
  }
}

function modelPriceKey(model) {
  if (typeof model !== 'string') return '';
  if (model.includes('doubao-seedance-2-0-fast') || model.includes('doubao-seedance-2.0-fast')) {
    return 'doubao-seedance-2.0-fast';
  }
  if (model.includes('doubao-seedance-2-0') || model.includes('doubao-seedance-2.0')) {
    return 'doubao-seedance-2.0';
  }
  return '';
}

function resolutionTier(resolution) {
  if (resolution === '480p' || resolution === '720p') return 'low';
  if (resolution === '1080p') return 'high';
  return '';
}

function outputBundle(args) {
  if (!args.out) {
    const name = args.name || args.id;
    return {
      dir: path.join(args.dir, name),
      name,
      ext: '.mp4',
    };
  }
  const parsed = path.parse(args.out);
  return {
    dir: path.join(parsed.dir, parsed.name),
    name: parsed.name,
    ext: parsed.ext || '.mp4',
  };
}

function videoOutPath(args) {
  const bundle = outputBundle(args);
  if (!bundle) return '';
  return path.join(bundle.dir, `${bundle.name}${bundle.ext}`);
}

function jsonOutPath(args) {
  if (args.jsonOut) return args.jsonOut;
  const bundle = outputBundle(args);
  return path.join(bundle.dir, `${bundle.name}.json`);
}

function priceOutPath(args) {
  if (args.priceOut) return args.priceOut;
  const bundle = outputBundle(args);
  return path.join(bundle.dir, `${bundle.name}.price.json`);
}

function lastFrameOutPath(args) {
  if (args.lastFrameOut) return args.lastFrameOut;
  const bundle = outputBundle(args);
  if (!bundle) return '';
  return path.join(bundle.dir, `${bundle.name}.last-frame.png`);
}

function calculatePrice(result, args) {
  const tokens = result && result.usage ? result.usage.completion_tokens || result.usage.total_tokens : 0;
  const priceKey = modelPriceKey(result.model);
  const tier = resolutionTier(result.resolution);
  const inputTier = args.inputHasVideo ? 'withInputVideo' : 'noInputVideo';
  const unitPrice = priceKey && tier ? PRICE_PER_MILLION_TOKENS[priceKey][inputTier][tier] : null;
  const amount = unitPrice === null || unitPrice === undefined ? null : (tokens / 1_000_000) * unitPrice;

  return {
    taskId: result.id,
    model: result.model,
    status: result.status,
    resolution: result.resolution,
    ratio: result.ratio,
    duration: result.duration,
    framespersecond: result.framespersecond,
    inputHasVideo: args.inputHasVideo,
    tokens,
    unit: 'CNY',
    pricePerMillionTokens: unitPrice,
    estimatedPrice: amount === null ? null : Number(amount.toFixed(6)),
    formula: 'estimatedPrice = completion_tokens / 1000000 * pricePerMillionTokens',
    note: '使用导入时的静态价格表，未核验当前价格，不是账单；输入视频档位由用户指定。实际费用以官方账单为准。',
  };
}

function maybeWritePrice(result, args) {
  if (result.status !== 'succeeded') return;
  const price = calculatePrice(result, args);
  const outputPath = priceOutPath(args);
  writeJson(outputPath, price);
  process.stdout.write(`Wrote ${outputPath}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);
  const url = `${baseUrl()}/contents/generations/tasks/${encodeURIComponent(args.id)}`;
  if (args.dryRun) {
    process.stdout.write(`${JSON.stringify({ url, jsonOut: jsonOutPath(args), out: videoOutPath(args), lastFrameOut: lastFrameOutPath(args), priceOut: priceOutPath(args), inputHasVideo: args.inputHasVideo }, null, 2)}\n`);
    return;
  }
  const result = await queryTask(args.id);
  const jsonPath = jsonOutPath(args);
  writeJson(jsonPath, result);
  process.stdout.write(`${redact(JSON.stringify(result, null, 2))}\n`);
  process.stdout.write(`Wrote ${jsonPath}\n`);
  if (['queued', 'running'].includes(result?.status)) return;
  if (result?.status !== 'succeeded' || result.error != null) {
    die(`Task is ${result?.status || 'unknown'}: ${JSON.stringify(result?.error || null)}`);
  }
  await maybeDownload(result, args);
  maybeWritePrice(result, args);
}

main().catch((error) => die(error instanceof Error ? error.message : String(error)));
