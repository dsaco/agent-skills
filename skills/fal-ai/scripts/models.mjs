import { InputError } from './errors.mjs';
// Explicit endpoint contracts; API defaults are not injected into requests.
const baseRatios = ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'];
const autoRatios = ['auto', ...baseRatios];
const sizes = ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9', 'auto'];
const common = { 'num-images': ['num_images', 'positive'], 'output-format': ['output_format', ['png', 'jpeg', 'webp']] };
const nano = { ...common, seed: ['seed', 'integer'], 'aspect-ratio': ['aspect_ratio', baseRatios], 'limit-generations': ['limit_generations', 'boolean'] };
const pro = { ...nano, 'aspect-ratio': ['aspect_ratio', autoRatios], resolution: ['resolution', ['1K', '2K', '4K']], 'system-prompt': ['system_prompt', 'text'], 'enable-web-search': ['enable_web_search', 'boolean'] };
const nano2 = { ...pro, 'aspect-ratio': ['aspect_ratio', [...autoRatios, '4:1', '1:4', '8:1', '1:8']], resolution: ['resolution', ['0.5K', '1K', '2K', '4K']], 'thinking-level': ['thinking_level', ['minimal', 'high']] };
const gpt = { ...common, 'image-size': ['image_size', 'image-size'], background: ['background', ['auto', 'transparent', 'opaque']], quality: ['quality', ['auto', 'low', 'medium', 'high']] };
const gpt25 = { ...gpt, quality: ['quality', ['auto', 'low', 'medium', 'high', 'xhigh', 'max']], 'output-compression': ['output_compression', 'compression'] };
export const defaults = {
  'text-to-image': 'fal-ai/nano-banana-2', 'image-to-image': 'fal-ai/nano-banana-2/edit', 'remove-background': 'fal-ai/birefnet/v2',
  'image-to-depth': 'fal-ai/image-preprocessors/depth-anything/v2', 'image-to-pose': 'fal-ai/dwpose',
};
export const models = {};
function imagePair(textEndpoint, editEndpoint, options) {
  models[textEndpoint] = { task: 'text-to-image', options, prompt: true, images: false };
  models[editEndpoint] = { task: 'image-to-image', options: { ...options, ...(textEndpoint === 'fal-ai/nano-banana' ? { 'aspect-ratio': ['aspect_ratio', autoRatios] } : {}), ...(textEndpoint.startsWith('openai/') ? { 'mask-url': ['mask_url', 'https-url'] } : {}) }, prompt: true, images: true };
}
imagePair('fal-ai/nano-banana', 'fal-ai/nano-banana/edit', nano);
imagePair('fal-ai/nano-banana-2', 'fal-ai/nano-banana-2/edit', nano2);
imagePair('fal-ai/nano-banana-pro', 'fal-ai/nano-banana-pro/edit', pro);
imagePair('openai/gpt-image-2', 'openai/gpt-image-2/edit', gpt);
for (const variant of ['flare', 'sunburst']) imagePair(`openai/gpt-image-2.5/${variant}/text-to-image`, `openai/gpt-image-2.5/${variant}/edit`, gpt25);
models['fal-ai/birefnet/v2'] = { task: 'remove-background', images: true, options: {
  'birefnet-model': ['model', ['General Use (Light)', 'General Use (Light 2K)', 'General Use (Heavy)', 'Matting', 'Portrait', 'General Use (Dynamic)']],
  'operating-resolution': ['operating_resolution', ['1024x1024', '2048x2048', '2304x2304']],
  'output-mask': ['output_mask', 'boolean'], 'refine-foreground': ['refine_foreground', 'boolean'],
  'mask-only': ['mask_only', 'boolean'], 'output-format': ['output_format', ['png', 'webp', 'gif']],
} };
models['fal-ai/ideogram/remove-background'] = { task: 'remove-background', images: true, maxImageBytes: 10_000_000, options: {} };
models['fal-ai/image-preprocessors/depth-anything/v2'] = { task: 'image-to-depth', images: true, options: {} };
models['fal-ai/dwpose'] = { task: 'image-to-pose', images: true, options: {
  'draw-mode': ['draw_mode', ['full-pose', 'body-pose', 'face-pose', 'hand-pose', 'face-hand-mask', 'face-mask', 'hand-mask']],
} };
export function getModel(task, endpoint = defaults[task]) {
  const model = Object.hasOwn(models, endpoint ?? '') ? models[endpoint] : undefined;
  if (!model || model.task !== task) throw new InputError('任务与模型端点不匹配或尚未支持；请用 --help 查看，不会自动换模型。');
  return model;
}
function imageSize(raw) {
  if (sizes.includes(raw)) return raw;
  const match = /^(\d+)x(\d+)$/i.exec(raw);
  if (!match) throw new InputError(`--image-size 需要 ${sizes.join(', ')} 或 WIDTHxHEIGHT。`);
  const [width, height] = match.slice(1).map(Number);
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0 && value % 16 === 0) || Math.max(width, height) > 3840 || Math.max(width, height) / Math.min(width, height) > 3 || width * height < 655360 || width * height > 8294400) throw new InputError('自定义尺寸要求宽高为正的 16 倍数、最长边 ≤3840、比例 ≤3:1、总像素 655360–8294400。');
  return { width, height };
}
export function buildInput(task, flags) {
  const endpoint = flags.model ?? defaults[task];
  const model = getModel(task, endpoint);
  const input = {};
  if (model.prompt) {
    if (!flags.prompt?.trim()) throw new InputError('缺少 --prompt。');
    input.prompt = flags.prompt;
  } else if (flags.prompt !== undefined) throw new InputError('当前任务不接受 --prompt。');
  const images = flags.image ?? [];
  if (!model.images && images.length) throw new InputError('文生图不接受 --image。');
  if (model.images && !images.length) throw new InputError('至少需要一张 --image。');
  if (['remove-background', 'image-to-depth', 'image-to-pose'].includes(task) && images.length !== 1) throw new InputError('当前任务只接受一张 --image。');
  if (images.length > 16) throw new InputError('本技能一次最多接受 16 张参考图。');
  for (const [key, raw] of Object.entries(flags)) {
    if (['model', 'prompt', 'image', 'out-dir', 'dry-run'].includes(key)) continue;
    const rule = Object.hasOwn(model.options, key) ? model.options[key] : undefined;
    if (!rule) throw new InputError(`当前模型不支持 --${key}。`);
    const [field, type] = rule;
    if (Array.isArray(type)) {
      if (!type.includes(raw)) throw new InputError(`--${key} 可用值：${type.join(', ')}`);
      input[field] = raw;
    } else if (type === 'image-size') input[field] = imageSize(raw);
    else if (type === 'text') {
      if (!raw.trim()) throw new InputError(`--${key} 需要非空文本。`);
      input[field] = raw;
    } else if (type === 'https-url') {
      let url; try { url = new URL(raw); } catch { throw new InputError(`--${key} 需要 HTTPS URL。`); }
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new InputError(`--${key} 需要无用户凭据的 HTTPS URL。`);
      input[field] = raw;
    } else if (type === 'boolean') {
      if (!['true', 'false'].includes(raw)) throw new InputError(`--${key} 需要 true 或 false。`);
      input[field] = raw === 'true';
    } else {
      if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || (type === 'positive' && Number(raw) < 1) || (type === 'compression' && (Number(raw) < 0 || Number(raw) > 100))) throw new InputError(`--${key} 需要有效整数${type === 'compression' ? '（0–100）' : ''}。`);
      input[field] = Number(raw);
    }
  }
  if (input.background === 'transparent' && input.output_format === 'jpeg') throw new InputError('透明背景不能使用 JPEG，请选择 PNG 或 WebP。');
  if (input.output_compression !== undefined && !['jpeg', 'webp'].includes(input.output_format)) throw new InputError('output-compression 要求显式 output-format jpeg 或 webp。');
  if (input.operating_resolution === '2304x2304' && input.model !== 'General Use (Dynamic)') throw new InputError('2304x2304 仅适用于 General Use (Dynamic)。');
  if (input.mask_only && input.output_mask) throw new InputError('本技能不组合 mask-only 与 output-mask，请分别选择。');
  return { endpoint, input, images };
}
