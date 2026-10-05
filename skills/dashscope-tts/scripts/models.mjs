export const A_MODELS = ['cosyvoice-v3.5-plus', 'cosyvoice-v3.5-flash', 'cosyvoice-v3-plus', 'cosyvoice-v3-flash', 'cosyvoice-v2', 'qwen-audio-3.0-tts-plus', 'qwen-audio-3.0-tts-flash'];
export const B_MODELS = ['qwen3-tts-flash', 'qwen3-tts-instruct-flash', 'qwen-tts'];
const aFields = ['format', 'sample_rate', 'volume', 'rate', 'pitch', 'bit_rate', 'enable_ssml', 'seed', 'language_hints', 'instruction', 'enable_aigc_tag', 'aigc_propagator', 'aigc_propagate_id', 'hot_fix'];
const bFields = ['language_type', 'instructions', 'optimize_instructions'];
function check(condition, message) { if (!condition) throw new Error(message); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function keys(value, allowed) { check(object(value), 'Expected JSON object.'); for (const k of Object.keys(value)) check(allowed.includes(k), `Unsupported field: ${k}`); }
function text(value, label) { check(typeof value === 'string' && value.trim().length > 0, `${label} must be nonempty text.`); }
function range(value, min, max, label, integer = false) { check(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)), `Invalid ${label}.`); }

export function validateRequest(body) {
  keys(body, ['model', 'input']);
  const route = A_MODELS.includes(body.model) ? 'A' : B_MODELS.includes(body.model) ? 'B' : null;
  check(route, 'Unsupported model. Consult model references before adding a model.');
  keys(body.input, ['text', 'voice', ...(route === 'A' ? aFields : bFields)]);
  const input = body.input;
  text(input.text, 'input.text'); text(input.voice, 'input.voice');
  for (const name of ['instruction', 'instructions', 'aigc_propagator', 'aigc_propagate_id']) if (name in input) text(input[name], name);
  for (const name of ['enable_ssml', 'enable_aigc_tag', 'optimize_instructions']) if (name in input) check(typeof input[name] === 'boolean', `Invalid ${name}.`);
  if (route === 'A') {
    const format = input.format ?? 'mp3';
    check(['mp3', 'wav', 'pcm', 'opus'].includes(format), 'Invalid format.');
    if ('sample_rate' in input) check((format === 'opus' ? [8000, 12000, 16000, 24000, 48000] : [8000, 12000, 16000, 22050, 24000, 44100, 48000]).includes(input.sample_rate), 'Invalid sample_rate.');
    for (const name of ['rate', 'pitch']) if (name in input) range(input[name], 0.5, 2, name);
    if ('volume' in input) range(input.volume, 0, 100, 'volume', true);
    if ('seed' in input) range(input.seed, 0, 65535, 'seed', true);
    if ('bit_rate' in input) { check(format === 'opus', 'bit_rate requires opus.'); range(input.bit_rate, 6, 510, 'bit_rate', true); }
    if ('language_hints' in input) check(Array.isArray(input.language_hints) && input.language_hints.length === 1 && ['zh','en','fr','de','ja','ko','ru','pt','th','id','vi','es','it','ms','fil','ar'].includes(input.language_hints[0]), 'Use one supported language_hints value.');
    if ('hot_fix' in input) {
      check(body.model !== 'cosyvoice-v2', 'cosyvoice-v2 does not support hot_fix.');
      keys(input.hot_fix, ['pronunciation', 'replace']);
      for (const entries of Object.values(input.hot_fix)) {
        check(Array.isArray(entries) && entries.length > 0, 'hot_fix values must be nonempty arrays.');
        for (const entry of entries) { check(object(entry) && Object.keys(entry).length === 1, 'hot_fix item must be a one-key object.'); for (const [k,v] of Object.entries(entry)) { text(k, 'hot_fix key'); text(v, 'hot_fix value'); } }
      }
    }
    if (input.enable_aigc_tag) check(format !== 'pcm' && !body.model.startsWith('cosyvoice-v3.5'), 'AIGC tags unsupported for this format/model.');
    if ('aigc_propagator' in input || 'aigc_propagate_id' in input) check(input.enable_aigc_tag === true, 'AIGC metadata requires enable_aigc_tag.');
  } else {
    if (body.model !== 'qwen-tts') check([...input.text].length <= 600, 'Qwen3 text exceeds 600 characters.');
    if ('language_type' in input) check(['Auto','Chinese','English','German','Italian','Portuguese','Spanish','Japanese','Korean','French','Russian'].includes(input.language_type), 'Invalid language_type.');
    if ('instructions' in input || 'optimize_instructions' in input) check(body.model === 'qwen3-tts-instruct-flash', 'Instructions require instruct model.');
    if (input.optimize_instructions) text(input.instructions, 'instructions');
  }
  return { route, format: route === 'A' ? input.format ?? 'mp3' : 'wav' };
}

export function endpoint(route, workspace) {
  if (workspace !== undefined) check(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(workspace), 'Invalid workspace ID.');
  const base = workspace ? `https://${workspace}.cn-beijing.maas.aliyuncs.com/api/v1` : 'https://dashscope.aliyuncs.com/api/v1';
  return base + (route === 'A' ? '/services/audio/tts/SpeechSynthesizer' : '/services/aigc/multimodal-generation/generation');
}
