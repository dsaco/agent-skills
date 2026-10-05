#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { validateName, fetchWithTimeout, redact, writeJson, writeMedia, submitOnce } = require('./runtime.js');

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_MODEL = 'doubao-seedream-5-0-260128';
const DEFAULT_OUTPUT_DIR = 'output/seedream';
const MODELS = [
  {
    id: 'doubao-seedream-4-0-250828',
    aliases: ['seedream-4.0', 'seedream-4-0', 'doubao-seedream-4-0'],
    sequential: true,
    maxReferenceImages: 14,
  },
  {
    id: 'doubao-seedream-4-0-20260415',
    aliases: ['seedream-4.0-20260415', 'seedream-4-0-20260415'],
    sequential: true,
    maxReferenceImages: 14,
  },
  {
    id: 'doubao-seedream-4-5-251128',
    aliases: ['seedream-4.5', 'seedream-4-5', 'doubao-seedream-4-5'],
    sequential: true,
    maxReferenceImages: 14,
  },
  {
    id: 'doubao-seedream-5-0-260128',
    aliases: ['seedream-5.0', 'seedream-5-0', 'seedream-5.0-lite', 'seedream-5-0-lite', 'doubao-seedream-5-0', 'doubao-seedream-5-0-lite'],
    sequential: true,
    maxReferenceImages: 14,
  },
  {
    id: 'doubao-seedream-5-0-pro-260628',
    aliases: ['seedream-5.0-pro', 'seedream-5-0-pro', 'doubao-seedream-5-0-pro'],
    sequential: false,
    maxReferenceImages: 10,
  },
];
const MODEL_BY_NAME = new Map(MODELS.flatMap((model) => [model.id, ...model.aliases].map((name) => [name, model])));
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.gif', '.heic', '.heif']);
const RESPONSE_FORMATS = new Set(['url', 'b64_json']);
const OUTPUT_FORMATS = new Set(['jpeg', 'png']);
const SEQUENTIAL_VALUES = new Set(['auto', 'disabled']);
const PROMPT_MODE_VALUES = new Set(['standard', 'fast']);

function die(message, code = 1) {
  process.stderr.write(`Error: ${redact(message)}\n`);
  process.exit(code);
}

function printHelp() {
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  generate-image.js --prompt <text> [options]\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --prompt <text>                  Text prompt. Required.\n`);
  process.stdout.write(`  --prompt-file <path>             Read prompt from a UTF-8 file.\n`);
  process.stdout.write(`  --model <name-or-id>             Model alias, full ID, or Endpoint ID. Default: ${DEFAULT_MODEL}\n`);
  process.stdout.write(`  --image <path-or-url>             Reference image. Repeatable.\n`);
  process.stdout.write(`  --image-count <1-15>             Maximum number of output images.\n`);
  process.stdout.write(`  --size <value>                   Output size, for example 2K or 2048x2048.\n`);
  process.stdout.write(`  --response-format <value>        url or b64_json. Default: url.\n`);
  process.stdout.write(`  --output-format <value>          jpeg or png.\n`);
  process.stdout.write(`  --watermark                      Add a watermark.\n`);
  process.stdout.write(`  --optimize-prompt                Enable standard server-side prompt optimization.\n`);
  process.stdout.write(`  --prompt-mode <value>            standard or fast.\n`);
  process.stdout.write(`  --sequential <value>             auto or disabled.\n`);
  process.stdout.write(`  --name <name>                    Output bundle name. Default: generate-image.\n`);
  process.stdout.write(`  --dir <path>                     Output root. Default: ${DEFAULT_OUTPUT_DIR}\n`);
  process.stdout.write(`  --out <path>                     Override first image output path.\n`);
  process.stdout.write(`  --json-out <path>                Raw JSON output path.\n`);
  process.stdout.write(`  --dry-run                        Print request without calling API.\n`);
  process.stdout.write(`  --list-models                    List supported Seedream models.\n`);
  process.stdout.write(`  --help                            Show this help.\n`);
}

function printModels() {
  process.stdout.write(`${JSON.stringify(MODELS.map((model) => ({
    id: model.id,
    aliases: model.aliases,
    sequentialImageGeneration: model.sequential,
    maxReferenceImages: model.maxReferenceImages,
  })), null, 2)}\n`);
}

function parseArgs(argv) {
  if (argv.includes('--list-models')) {
    printModels();
    process.exit(0);
  }
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const args = {
    prompt: '', promptFile: '', model: DEFAULT_MODEL, images: [], imageCount: '', size: '',
    responseFormat: 'url', outputFormat: '', watermark: false,
    optimizePrompt: false, promptMode: '', sequential: '', name: 'generate-image',
    dir: DEFAULT_OUTPUT_DIR, out: '', jsonOut: '', dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--dry-run' || arg === '--watermark' || arg === '--optimize-prompt') {
      if (arg === '--dry-run') args.dryRun = true;
      if (arg === '--watermark') args.watermark = true;
      if (arg === '--optimize-prompt') args.optimizePrompt = true;
      continue;
    }

    if (!next || next.startsWith('--')) die(`${arg} requires a value.`, 2);
    if (arg === '--prompt') args.prompt = next;
    else if (arg === '--prompt-file') args.promptFile = next;
    else if (arg === '--model') args.model = next;
    else if (arg === '--image') args.images.push(next);
    else if (arg === '--image-count') args.imageCount = next;
    else if (arg === '--size') args.size = next;
    else if (arg === '--response-format') args.responseFormat = next;
    else if (arg === '--output-format') args.outputFormat = next;
    else if (arg === '--prompt-mode') args.promptMode = next;
    else if (arg === '--sequential') args.sequential = next;
    else if (arg === '--name') args.name = next;
    else if (arg === '--dir') args.dir = next;
    else if (arg === '--out') args.out = next;
    else if (arg === '--json-out') args.jsonOut = next;
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

function validateArgs(args) {
  if (args.prompt && args.promptFile) die('--prompt and --prompt-file cannot be used together.', 2);
  if (args.promptFile) args.prompt = readPromptFile(args.promptFile);
  if (!args.prompt.trim()) die('--prompt is required.', 2);
  if (!args.model.trim()) die('--model is required.', 2);
  args.model = resolveModel(args.model.trim());
  if (!args.name.trim()) die('--name cannot be empty.', 2);
  validateName(args.name);
  if (!args.dir.trim()) die('--dir cannot be empty.', 2);
  const model = MODEL_BY_NAME.get(args.model);
  if (model && args.images.length > model.maxReferenceImages) {
    die(`${args.model} supports at most ${model.maxReferenceImages} reference images.`, 2);
  }
  validateEnum(args.responseFormat, RESPONSE_FORMATS, '--response-format');
  validateEnum(args.outputFormat, OUTPUT_FORMATS, '--output-format');
  validateEnum(args.promptMode, PROMPT_MODE_VALUES, '--prompt-mode');
  validateEnum(args.sequential, SEQUENTIAL_VALUES, '--sequential');
  validateIntegerRange(args.imageCount, '--image-count', 1, 15);
  if (args.imageCount && Number(args.imageCount) > 1 && args.sequential === 'disabled') {
    die('--image-count greater than 1 conflicts with --sequential disabled.', 2);
  }
  if (model && model.sequential && args.imageCount && args.images.length + Number(args.imageCount) > 15) {
    die('Reference image count plus --image-count cannot exceed 15.', 2);
  }
  if (model && !model.sequential && (args.imageCount || args.sequential)) {
    die(`${args.model} does not support sequential image generation.`, 2);
  }
  args.images.forEach((image) => validateImageInput(image));
}

function resolveModel(value) {
  const model = MODEL_BY_NAME.get(value.toLowerCase());
  return model ? model.id : value;
}

function readPromptFile(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) die(`Prompt file does not exist: ${resolvedPath}`, 2);
  if (!fs.statSync(resolvedPath).isFile()) die(`Prompt path is not a file: ${resolvedPath}`, 2);
  return fs.readFileSync(resolvedPath, 'utf8').trim();
}

function validateImageInput(value) {
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) return;
  const filePath = path.resolve(value);
  if (!fs.existsSync(filePath)) die(`Local image does not exist: ${filePath}`, 2);
  if (!fs.statSync(filePath).isFile()) die(`Local image path is not a file: ${filePath}`, 2);
  if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) die(`Unsupported local image extension: ${path.extname(filePath)}`, 2);
}

function validateEnum(value, allowed, optionName) {
  if (value && !allowed.has(value)) die(`${optionName} must be one of: ${Array.from(allowed).join(', ')}.`, 2);
}

function validateIntegerRange(value, optionName, min, max) {
  if (!value) return;
  if (!/^-?\d+$/.test(value)) die(`${optionName} must be an integer.`, 2);
  const numberValue = Number(value);
  if (numberValue < min || numberValue > max) die(`${optionName} must be between ${min} and ${max}.`, 2);
}

function imageMimeType(extension) {
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.tiff') return 'image/tiff';
  return `image/${extension.slice(1)}`;
}

function mediaValue(value) {
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) return value;
  const filePath = path.resolve(value);
  const extension = path.extname(filePath).toLowerCase();
  return `data:${imageMimeType(extension)};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function createPayload(args) {
  const payload = { model: args.model, prompt: args.prompt };
  if (args.images.length === 1) payload.image = mediaValue(args.images[0]);
  if (args.images.length > 1) payload.image = args.images.map(mediaValue);
  if (args.imageCount) {
    payload.sequential_image_generation = args.sequential || (Number(args.imageCount) > 1 ? 'auto' : 'disabled');
    if (payload.sequential_image_generation === 'auto') {
      payload.sequential_image_generation_options = { max_images: Number(args.imageCount) };
    }
  } else if (args.sequential) {
    payload.sequential_image_generation = args.sequential;
  }
  if (args.size) payload.size = args.size;
  if (args.responseFormat) payload.response_format = args.responseFormat;
  if (args.outputFormat) payload.output_format = args.outputFormat;
  payload.watermark = args.watermark;
  if (args.optimizePrompt || args.promptMode) {
    payload.optimize_prompt_options = { mode: args.promptMode || 'standard' };
  }
  return payload;
}

function redactPayload(payload) {
  return JSON.parse(JSON.stringify(payload, (key, value) => {
    if (typeof value === 'string' && value.startsWith('data:')) return value.replace(/;base64,.*/s, ';base64,<base64 omitted>');
    return value;
  }));
}

function outputBundle(args) {
  if (args.out) {
    const parsed = path.parse(args.out);
    return { dir: parsed.dir || '.', name: parsed.name, ext: parsed.ext || extensionFor(args) };
  }
  return { dir: path.join(args.dir, args.name), name: args.name, ext: extensionFor(args) };
}

function extensionFor(args) {
  if (args.outputFormat === 'png') return '.png';
  return '.jpeg';
}

function jsonOutPath(args) {
  if (args.jsonOut) return args.jsonOut;
  const bundle = outputBundle(args);
  return path.join(bundle.dir, `${bundle.name}.json`);
}

function imageOutPath(args, index) {
  const bundle = outputBundle(args);
  if (args.out && index === 0) return path.join(bundle.dir, `${bundle.name}${bundle.ext}`);
  const suffix = index === 0 ? '' : `-${index + 1}`;
  return path.join(bundle.dir, `${bundle.name}${suffix}${bundle.ext}`);
}

async function generateImage(payload) {
  const response = await fetchWithTimeout(`${DEFAULT_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${arkApiKey()}` },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Generate image returned invalid JSON HTTP ${response.status}`);
  }
  if (!response.ok) throw new Error(`Generate image failed HTTP ${response.status}: ${redact(JSON.stringify(data))}`);
  return data;
}



function imageItems(result) {
  if (!result || !Array.isArray(result.data)) die('API response does not contain a data image array.');
  if (result.data.length === 0) die('API response contains no generated images.');
  return result.data;
}

async function downloadImage(item, outPath) {
  if (item && item.b64_json) {
    writeMedia(outPath, Buffer.from(item.b64_json, 'base64'));
    process.stdout.write(`Wrote ${outPath}\n`);
    return;
  }
  if (!item || !item.url) die('Image response item contains neither url nor b64_json.');
  const response = await fetchWithTimeout(item.url, { method: 'GET' });
  if (!response.ok) die(`Image download failed HTTP ${response.status}: ${await response.text()}`);
  writeMedia(outPath, Buffer.from(await response.arrayBuffer()));
  process.stdout.write(`Wrote ${outPath}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);
  const payload = createPayload(args);
  const jsonPath = jsonOutPath(args);
  if (args.dryRun) {
    process.stdout.write(`${JSON.stringify({ url: `${DEFAULT_BASE_URL}/images/generations`, payload: redactPayload(payload), jsonOut: jsonPath }, null, 2)}\n`);
    return;
  }
  arkApiKey(); // Fail before reserving output if credentials are absent.
  const result = await submitOnce(jsonPath, () => generateImage(payload));
  process.stdout.write(`${redact(JSON.stringify(result, null, 2))}\n`);
  process.stdout.write(`Wrote ${jsonPath}\n`);
  const items = imageItems(result);
  for (let index = 0; index < items.length; index += 1) await downloadImage(items[index], imageOutPath(args, index));
}

main().catch((error) => die(error instanceof Error ? error.message : String(error)));
