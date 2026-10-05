#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { validateName, fetchWithTimeout, redact, writeJson, writeMedia, submitOnce } = require('./runtime.js');

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_MODEL = 'doubao-seedance-2-0-260128';
const DEFAULT_OUTPUT_DIR = 'output/seedance';
const IMAGE_ROLES = new Set(['first_frame', 'last_frame', 'reference_image']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.gif', '.heic', '.heif']);
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3']);
const RESOLUTIONS = new Set(['480p', '720p', '1080p']);
const RATIOS = new Set(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive']);


function die(message, code = 1) {
  process.stderr.write(`Error: ${redact(message)}\n`);
  process.exit(code);
}

function printHelp() {
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  create-video.js --prompt <text> [options]\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --prompt <text>               Text prompt. Required unless media is provided.\n`);
  process.stdout.write(`  --prompt-file <path>          Read text prompt from a UTF-8 file.\n`);
  process.stdout.write(`  --model <id>                  Model ID. Default: ${DEFAULT_MODEL}\n`);
  process.stdout.write(`  --name <name>                 Output bundle name. Default: create-video.\n`);
  process.stdout.write(`  --dir <path>                  Output root directory. Default: ${DEFAULT_OUTPUT_DIR}\n`);
  process.stdout.write(`  --image <path-or-url>         Image URL, asset:// ID, data URI, or local image. Repeatable.\n`);
  process.stdout.write(`  --image-role <role>           Role for previous --image. first_frame, last_frame, reference_image.\n`);
  process.stdout.write(`  --video <url-or-asset>        Video URL or asset:// ID. Repeatable.\n`);
  process.stdout.write(`  --audio <path-or-url>         Audio URL, asset:// ID, data URI, or local audio. Repeatable.\n`);
  process.stdout.write(`  --callback-url <url>          Callback URL.\n`);
  process.stdout.write(`  --return-last-frame           Return generated video last frame.\n`);
  process.stdout.write(`  --no-generate-audio           Pass generate_audio: false.\n`);
  process.stdout.write(`  --generate-audio              Pass generate_audio: true.\n`);
  process.stdout.write(`  --web-search                  Enable web_search tool.\n`);
  process.stdout.write(`  --safety-identifier <value>   End-user identifier, max 64 chars.\n`);
  process.stdout.write(`  --priority <0-9>              Queue priority.\n`);
  process.stdout.write(`  --execution-expires-after <s> Timeout seconds, 3600-259200.\n`);
  process.stdout.write(`  --resolution <value>          480p, 720p, or 1080p.\n`);
  process.stdout.write(`  --ratio <value>               16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive.\n`);
  process.stdout.write(`  --duration <seconds>          Seedance 2.0: 4-15 or -1.\n`);
  process.stdout.write(`  --seed <integer>              -1 to 4294967295.\n`);
  process.stdout.write(`  --watermark                   Pass watermark: true.\n`);
  process.stdout.write(`  --json-out <path>             Raw JSON output path. Default: <dir>/<name>/create.json\n`);
  process.stdout.write(`  --dry-run                     Print request without calling API.\n`);
  process.stdout.write(`  --help                        Show this help.\n`);
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const args = {
    prompt: '', promptFile: '', model: DEFAULT_MODEL, name: 'create-video', dir: DEFAULT_OUTPUT_DIR,
    images: [], videos: [], audios: [], callbackUrl: '',
    returnLastFrame: false, generateAudio: undefined, webSearch: false, safetyIdentifier: '',
    priority: '', executionExpiresAfter: '', resolution: '', ratio: '', duration: '', seed: '',
    watermark: false, jsonOut: '', dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--dry-run') { args.dryRun = true; continue; }
    if (arg === '--return-last-frame') { args.returnLastFrame = true; continue; }
    if (arg === '--generate-audio') { args.generateAudio = true; continue; }
    if (arg === '--no-generate-audio') { args.generateAudio = false; continue; }
    if (arg === '--web-search') { args.webSearch = true; continue; }
    if (arg === '--watermark') { args.watermark = true; continue; }

    if (!next || next.startsWith('--')) die(`${arg} requires a value.`, 2);

    if (arg === '--prompt') args.prompt = next;
    else if (arg === '--prompt-file') args.promptFile = next;
    else if (arg === '--model') args.model = next;
    else if (arg === '--name') args.name = next;
    else if (arg === '--dir') args.dir = next;
    else if (arg === '--image') args.images.push({ value: next, role: '' });
    else if (arg === '--image-role') setLastImageRole(args.images, next);
    else if (arg === '--video') args.videos.push(next);
    else if (arg === '--audio') args.audios.push(next);
    else if (arg === '--callback-url') args.callbackUrl = next;
    else if (arg === '--safety-identifier') args.safetyIdentifier = next;
    else if (arg === '--priority') args.priority = next;
    else if (arg === '--execution-expires-after') args.executionExpiresAfter = next;
    else if (arg === '--resolution') args.resolution = next;
    else if (arg === '--ratio') args.ratio = next;
    else if (arg === '--duration') args.duration = next;
    else if (arg === '--seed') args.seed = next;
    else if (arg === '--json-out') args.jsonOut = next;
    else die(`Unknown argument: ${arg}`, 2);

    index += 1;
  }

  return args;
}

function setLastImageRole(images, role) {
  if (images.length === 0) die('--image-role must follow --image.', 2);
  images[images.length - 1].role = role;
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
  if (args.prompt && args.promptFile) die('--prompt and --prompt-file cannot be used together.', 2);
  if (args.promptFile) args.prompt = readPromptFile(args.promptFile);
  if (!args.prompt.trim() && args.images.length === 0 && args.videos.length === 0) {
    die('--prompt is required unless image or video input is provided.', 2);
  }
  if (!args.model.trim()) die('--model is required.', 2);
  if (!args.name.trim()) die('--name cannot be empty.', 2);
  validateName(args.name);
  if (!args.dir.trim()) die('--dir cannot be empty.', 2);
  if (args.images.length > 9) die('Seedance 2.0 supports at most 9 images.', 2);
  if (args.videos.length > 3) die('Seedance 2.0 supports at most 3 reference videos.', 2);
  if (args.audios.length > 3) die('Seedance 2.0 supports at most 3 reference audios.', 2);
  if (args.audios.length > 0 && args.images.length === 0 && args.videos.length === 0) {
    die('Audio cannot be used alone. Provide at least one image or video.', 2);
  }
  args.images.forEach((image) => {
    if (image.role && !IMAGE_ROLES.has(image.role)) die('--image-role must be one of: first_frame, last_frame, reference_image.', 2);
  });
  args.videos.forEach(validateRemoteMedia);
  validateEnum(args.resolution, RESOLUTIONS, '--resolution');
  validateEnum(args.ratio, RATIOS, '--ratio');
  validateDuration(args.duration);
  validateIntegerRange(args.seed, '--seed', -1, 4_294_967_295);
  validateIntegerRange(args.priority, '--priority', 0, 9);
  validateIntegerRange(args.executionExpiresAfter, '--execution-expires-after', 3600, 259200);
  if (args.safetyIdentifier.length > 64) die('--safety-identifier must be at most 64 characters.', 2);
}

function readPromptFile(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) die(`Prompt file does not exist: ${resolvedPath}`, 2);
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) die(`Prompt path is not a file: ${resolvedPath}`, 2);
  return fs.readFileSync(resolvedPath, 'utf8').trim();
}

function validateRemoteMedia(value) {
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('asset://')) return;
  die('--video only supports HTTP(S) URL or asset:// ID. Upload local video first.', 2);
}

function validateEnum(value, allowed, optionName) {
  if (!value) return;
  if (!allowed.has(value)) die(`${optionName} must be one of: ${Array.from(allowed).join(', ')}.`, 2);
}

function validateDuration(value) {
  if (!value) return;
  if (!/^-?\d+$/.test(value)) die('--duration must be an integer.', 2);
  const numberValue = Number(value);
  if (numberValue !== -1 && (numberValue < 4 || numberValue > 15)) die('--duration must be -1 or an integer from 4 to 15.', 2);
}

function validateIntegerRange(value, optionName, min, max) {
  if (!value) return;
  if (!/^-?\d+$/.test(value)) die(`${optionName} must be an integer.`, 2);
  const numberValue = Number(value);
  if (numberValue < min || numberValue > max) die(`${optionName} must be between ${min} and ${max}.`, 2);
}

function createPayload(args) {
  const content = [];
  if (args.prompt.trim()) content.push({ type: 'text', text: args.prompt });
  args.images.forEach((image) => content.push(createImageContent(image)));
  args.videos.forEach((video) => content.push({ type: 'video_url', video_url: { url: video }, role: 'reference_video' }));
  args.audios.forEach((audio) => content.push({ type: 'audio_url', audio_url: { url: mediaValue(audio, AUDIO_EXTENSIONS, 'audio') }, role: 'reference_audio' }));

  const payload = { model: args.model, content };
  if (args.callbackUrl) payload.callback_url = args.callbackUrl;
  if (args.returnLastFrame) payload.return_last_frame = true;
  if (args.generateAudio !== undefined) payload.generate_audio = args.generateAudio;
  if (args.webSearch) payload.tools = [{ type: 'web_search' }];
  if (args.safetyIdentifier) payload.safety_identifier = args.safetyIdentifier;
  if (args.priority) payload.priority = Number(args.priority);
  if (args.executionExpiresAfter) payload.execution_expires_after = Number(args.executionExpiresAfter);
  if (args.resolution) payload.resolution = args.resolution;
  if (args.ratio) payload.ratio = args.ratio;
  if (args.duration) payload.duration = Number(args.duration);
  if (args.seed) payload.seed = Number(args.seed);
  if (args.watermark) payload.watermark = true;
  return payload;
}

function createImageContent(image) {
  const content = { type: 'image_url', image_url: { url: mediaValue(image.value, IMAGE_EXTENSIONS, 'image') } };
  if (image.role) content.role = image.role;
  return content;
}

function mediaValue(value, allowedExtensions, mediaType) {
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('asset://') || value.startsWith('data:')) return value;
  const filePath = path.resolve(value);
  if (!fs.existsSync(filePath)) die(`Local ${mediaType} does not exist: ${filePath}`, 2);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) die(`Local ${mediaType} path is not a file: ${filePath}`, 2);
  const extension = path.extname(filePath).toLowerCase();
  if (!allowedExtensions.has(extension)) die(`Unsupported local ${mediaType} extension: ${extension}`, 2);
  const mimeType = mediaType === 'image' ? imageMimeType(extension) : audioMimeType(extension);
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function imageMimeType(extension) {
  if (extension === '.jpg') return 'image/jpeg';
  return `image/${extension.slice(1)}`;
}

function audioMimeType(extension) {
  return `audio/${extension.slice(1)}`;
}

function dryRunPayload(payload) {
  return JSON.parse(JSON.stringify(payload, (key, value) => {
    if (typeof value === 'string' && value.startsWith('data:')) return value.replace(/;base64,.*/s, ';base64,<base64 omitted>');
    return value;
  }));
}

function jsonOutPath(args) {
  if (args.jsonOut) return args.jsonOut;
  return path.join(args.dir, args.name, 'create.json');
}

async function createTask(payload) {
  const url = `${baseUrl()}/contents/generations/tasks`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${arkApiKey()}` },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Create task failed HTTP ${response.status}: ${redact(text)}`);
  return data;
}



async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);
  const payload = createPayload(args);
  const outputPath = jsonOutPath(args);
  if (args.dryRun) {
    process.stdout.write(`${JSON.stringify({ url: `${baseUrl()}/contents/generations/tasks`, payload: dryRunPayload(payload), jsonOut: outputPath }, null, 2)}\n`);
    return;
  }
  arkApiKey();
  const result = await submitOnce(outputPath, () => createTask(payload));
  if (!result || typeof result.id !== 'string' || !result.id.trim()) {
    die('Response has no task ID. Inspect saved JSON; do not resubmit automatically.');
  }
  process.stdout.write(`${redact(JSON.stringify(result, null, 2))}\n`);
  process.stdout.write(`Wrote ${outputPath}\n`);
}

main().catch((error) => die(error instanceof Error ? error.message : String(error)));
