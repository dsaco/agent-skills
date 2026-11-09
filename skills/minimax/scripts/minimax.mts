import { readFile, writeFile, mkdir, rename, open, unlink, stat, link } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

type Json = Record<string, any>;
const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const endpoints: Record<string, string> = {
  videoCreate: "/v2/video_generation",
  speech: "/v1/t2a_v2",
  voiceDesign: "/v1/voice_design",
  voiceClone: "/v1/voice_clone",
  voices: "/v1/get_voice",
  upload: "/v1/files/upload",
  image: "/v1/image_generation",
  music: "/v1/music_generation",
};
const hosts = ["https://api.minimax.cn", "https://api.minimaxi.com", "https://api.minimax.io"];
const speechModels = ["speech-2.8-hd", "speech-2.8-turbo", "speech-2.6-hd", "speech-2.6-turbo", "speech-02-hd", "speech-02-turbo", "speech-01-hd", "speech-01-turbo"];
const videoSpecs: Record<string, { resolutions: string[]; minDuration: number }> = {
  "MiniMax-H3": { resolutions: ["768P", "2K"], minDuration: 4 },
  "MiniMax-H3-Highspeed": { resolutions: ["768P"], minDuration: 4 },
  "MiniMax-H3-Lite": { resolutions: ["480P", "768P"], minDuration: 4 },
  "MiniMax-H3-Max": { resolutions: ["480P", "768P"], minDuration: 5 },
};
const help = `MiniMax 媒体工具（Node.js 24+，无 npm 依赖）
用法：node <技能目录>/scripts/minimax.mts <动作> [参数]
动作：videoCreate | videoQuery | speech | voiceDesign | voiceClone | voices | upload | image | music | recover | config
新请求：--input <官方请求体.json或-表示stdin> --out <尚不存在的任务目录> [--dryRun]
上传：upload --file <音频> --purpose voice_clone|prompt_audio --out <新任务目录> [--dryRun]
视频取回：videoQuery --job <任务目录/request.json> [--wait <秒，0=查询一次>]
补下载：recover --job <任务目录/request.json>（只恢复已存成功响应）
配置：MINIMAX_API_KEY；MINIMAX_REGION=cn|global；可选 MINIMAX_API_HOST、MINIMAX_FFPROBE。
--timeout <单次HTTP超时秒数，默认300>；--help
dryRun 不联网、不写文件、不需要密钥。新生成不自动重试；视频默认只提交，任务ID立即落盘。
本地参考素材用请求体 url 字段的 @./相对路径，路径相对当前任务 cwd。
`;

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, name: string): asserts value is Json {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), `${name} 必须是 JSON 对象`);
}

function textValue(value: unknown, name: string, max = Infinity) {
  requireValue(typeof value === "string" && value.trim().length > 0 && [...value].length <= max, `${name} 必须是非空字符串，最多 ${max} 字符`);
}

function range(value: unknown, name: string, min: number, max: number, integer = false) {
  requireValue(typeof value === "number" && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)), `${name} 范围 ${min}～${max}${integer ? "，必须是整数" : ""}`);
}

function parseJson(text: string): Json {
  // 保留官方 int64 文件ID；不能先解析成不精确的 JavaScript number。
  return JSON.parse(text.replace(/^\uFEFF/, ""), (_key: string, value: any, context?: { source: string }) => {
    if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)) {
      requireValue(context?.source, "需要支持精确JSON整数的Node.js 24+");
      return context.source;
    }
    return value;
  });
}

function apiJson(value: Json) {
  return JSON.stringify(value, (key, item) => {
    if (["file_id", "prompt_audio"].includes(key) && typeof item === "string" && /^\d+$/.test(item)) return (JSON as typeof JSON & { rawJSON: (text: string) => unknown }).rawJSON(item);
    return item;
  });
}

function hash(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function summary(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("data:")) return { omittedDataUri: true, bytes: Buffer.byteLength(value), sha256: hash(value) };
  if (Array.isArray(value)) return value.map(summary);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, summary(item)]));
  return value;
}

function redact(text: string) {
  const key = process.env.MINIMAX_API_KEY?.trim();
  return key ? text.replaceAll(key, "[redacted]") : text;
}

async function readJson(path: string) {
  return parseJson(await readFile(path, "utf8"));
}

async function readInput(path: string) {
  if (path !== "-") return readJson(resolve(path));
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    requireValue(size <= 64 * 1024 * 1024, "stdin请求超过64MB");
    chunks.push(bytes);
  }
  return parseJson(Buffer.concat(chunks).toString("utf8"));
}

async function atomicJson(path: string, data: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, redact(JSON.stringify(data, null, 2)) + "\n", { flag: "wx", mode: 0o600 });
  try { await rename(temp, path); } catch (error) { await unlink(temp).catch(() => {}); throw error; }
}

function apiHost(value?: string) {
  const region = process.env.MINIMAX_REGION || "cn";
  requireValue(["cn", "global"].includes(region), "MINIMAX_REGION 只能是 cn 或 global");
  const host = value || process.env.MINIMAX_API_HOST || (region === "global" ? hosts[2] : hosts[0]);
  requireValue(hosts.includes(host), "API 主机必须为官方 HTTPS 主机，不向自定义主机发送密钥");
  return host;
}

function probe(path: string) {
  const result = spawnSync(process.env.MINIMAX_FFPROBE || "ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  requireValue(!result.error && result.status === 0, "本地素材需要可用的 ffprobe；可用 MINIMAX_FFPROBE 指定路径，请确认文件能解码");
  return parseJson(result.stdout);
}

function validateProbe(info: Json, kind: string) {
  const duration = Number(info.format?.duration);
  if (kind === "audio" || kind === "video") range(duration, "参考素材时长（秒）", 2, 15);
  if (kind === "voice_clone") range(duration, "克隆源音频时长（秒）", 10, 300);
  if (kind === "prompt_audio") requireValue(duration > 0 && duration < 8, "克隆示例音频必须短于8秒");
  if (["audio", "voice_clone", "prompt_audio"].includes(kind)) requireValue(info.streams?.some((s: Json) => s.codec_type === "audio"), "素材必须含音频流");
  if (kind === "image" || kind === "video") {
    const video = info.streams?.find((s: Json) => s.codec_type === "video");
    requireValue(video, "素材缺少可解码画面");
    range(video.width, "宽度", 256, 5760, true);
    range(video.height, "高度", 256, 5760, true);
    range(video.width / video.height, "宽高比", 0.4, 2.5);
    if (kind === "video") {
      requireValue(["h264", "hevc"].includes(video.codec_name), "参考视频编码必须是 H.264/H.265");
      const [num, den] = String(video.avg_frame_rate).split("/").map(Number);
      range(num / den, "视频帧率", 23.976, 60);
      for (const stream of info.streams.filter((s: Json) => s.codec_type === "audio")) requireValue(["aac", "mp3"].includes(stream.codec_name), "参考视频音轨必须为 AAC/MP3");
    }
  }
  return duration;
}

async function media(value: string, kind: string, evidence: Json[]) {
  textValue(value, "素材地址");
  if (!value.startsWith("@")) {
    requireValue(/^(https:\/\/|mm_file:\/\/|data:)/.test(value), "素材需 HTTPS URL、mm_file://、data URI 或 @本地路径");
    if (value.startsWith("https://")) { const url = new URL(value); requireValue(!url.username && !url.password, "素材URL不能含用户名密码"); }
    if (value.startsWith("data:")) {
      const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
      requireValue(match && match[1].startsWith(`${kind}/`), "data URI 类型或Base64格式错误");
      const limit = kind === "image" ? 30 : kind === "video" ? 50 : 15;
      requireValue(Buffer.from(match[2], "base64").length <= limit * 1024 * 1024, "内嵌素材超出大小限制");
    }
    evidence.push({ kind, source: "remoteOrEmbedded", technicalPropertiesVerified: false });
    return value;
  }
  const path = resolve(value.slice(1));
  const formats: Record<string, Record<string, string>> = {
    image: { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heif" },
    video: { ".mp4": "video/mp4", ".mov": "video/quicktime" },
    audio: { ".mp3": "audio/mpeg", ".wav": "audio/wav" },
  };
  const mime = formats[kind]?.[extname(path).toLowerCase()];
  requireValue(mime, "本地素材扩展名不受当前分支支持");
  const fileStat = await stat(path);
  const limit = kind === "image" ? 30 : kind === "video" ? 50 : 15;
  requireValue(fileStat.isFile() && fileStat.size > 0 && fileStat.size <= limit * 1024 * 1024, `素材大小需在0～${limit}MB之间`);
  const duration = validateProbe(probe(path), kind);
  const bytes = await readFile(path);
  evidence.push({ kind, path, bytes: bytes.length, sha256: hash(bytes), duration: Number.isFinite(duration) ? duration : null, technicalPropertiesVerified: true });
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function prepare(action: string, body: Json, evidence: Json[]) {
  object(body, "请求体");
  requireValue(!["api_key", "apiKey", "Authorization", "authorization", "headers"].some(key => key in body), "凭据只通过环境变量提供");
  if (action === "videoCreate") {
    const spec = videoSpecs[body.model];
    requireValue(spec, "不支持的视频模型，请按视频参考文档选择 H3 型号");
    requireValue(spec.resolutions.includes(body.resolution), "分辨率不适用于所选H3型号");
    range(body.duration, "视频时长", spec.minDuration, 15, true);
    requireValue(Array.isArray(body.content) && body.content.length > 0, "content 必须是非空数组");
    const counts: Record<string, number> = {};
    for (const item of body.content) {
      object(item, "content项");
      if (item.type === "text") { textValue(item.text, "提示词", 7000); counts.text = (counts.text || 0) + 1; continue; }
      requireValue(["image_url", "video_url", "audio_url"].includes(item.type), "content类型不受支持");
      const kind = item.type.split("_")[0];
      const role = item.role || (kind === "image" ? "first_frame" : "");
      const roles = kind === "image" ? ["first_frame", "last_frame", "reference_image"] : [`reference_${kind}`];
      requireValue(roles.includes(role), "素材角色与类型不匹配");
      counts[role] = (counts[role] || 0) + 1;
      object(item[item.type], item.type);
      item[item.type].url = await media(item[item.type].url, kind, evidence);
    }
    requireValue(counts.text === 1, "需要且仅需要一个非空text项");
    for (const [role, max] of Object.entries({ first_frame: 1, last_frame: 1, reference_image: 9, reference_video: 3, reference_audio: 3 })) requireValue((counts[role] || 0) <= max, `${role} 最多 ${max} 个`);
    const frames = (counts.first_frame || 0) + (counts.last_frame || 0);
    const refs = (counts.reference_image || 0) + (counts.reference_video || 0) + (counts.reference_audio || 0);
    requireValue(!(frames && refs), "固定首尾帧与多模态参考互斥；参考音频须使用参考图模式");
    requireValue(refs <= 12, "参考文件合计最多12个");
    requireValue(!counts.reference_audio || counts.reference_image || counts.reference_video, "参考音频应与参考图片或视频一起使用");
    const ratios = ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
    requireValue(ratios.includes(body.ratio), "显式填写ratio（横屏一般16:9；固定首尾帧用adaptive）");
    requireValue(!frames || body.ratio === "adaptive", "固定首尾帧按输入图比例，ratio应为adaptive");
    requireValue(frames || refs || body.ratio !== "adaptive", "文生视频需明确画幅");
    requireValue(!(body.model === "MiniMax-H3-Lite" && refs && body.ratio === "adaptive"), "H3-Lite参考模式需明确画幅");
    for (const kind of ["audio", "video"]) requireValue(evidence.filter(item => item.kind === kind).reduce((sum, item) => sum + (item.duration || 0), 0) <= 15, `${kind} 本地参考总时长超过15秒`);
  } else if (action === "speech") {
    requireValue(speechModels.includes(body.model), "未知语音模型");
    textValue(body.text, "合成文本", 9999);
    object(body.voice_setting, "voice_setting");
    textValue(body.voice_setting.voice_id, "voice_id");
    for (const [key, min, max] of [["speed", 0.5, 2], ["vol", 0.01, 10], ["pitch", -12, 12]] as const) if (body.voice_setting[key] !== undefined) range(body.voice_setting[key], key, min, max, key === "pitch");
  } else if (action === "voiceDesign") {
    textValue(body.prompt, "音色描述");
    textValue(body.preview_text, "试听文本", 500);
  } else if (action === "voiceClone") {
    requireValue(typeof body.file_id === "string" && /^\d+$/.test(body.file_id), "file_id 使用上传返回的十进制字符串，避免int64精度丢失");
    requireValue(typeof body.voice_id === "string" && /^[A-Za-z][A-Za-z0-9_-]{6,254}[A-Za-z0-9]$/.test(body.voice_id), "克隆voice_id需8～256字符，字母开头、字母数字结尾");
    if (body.text !== undefined) { textValue(body.text, "试听文本", 1000); requireValue(speechModels.includes(body.model), "提供试听文本时需指定语音model"); }
    if (body.clone_prompt) {
      object(body.clone_prompt, "clone_prompt");
      requireValue(typeof body.clone_prompt.prompt_audio === "string" && /^\d+$/.test(body.clone_prompt.prompt_audio), "prompt_audio需为文件ID字符串");
      textValue(body.clone_prompt.prompt_text, "示例音频转写");
    }
  } else if (action === "voices") {
    requireValue(["system", "voice_cloning", "voice_generation", "all"].includes(body.voice_type), "voice_type无效");
  } else if (action === "image") {
    requireValue(["image-01", "image-01-live"].includes(body.model), "未知图片模型");
    textValue(body.prompt, "图片提示词", 1500);
    if (body.n !== undefined) range(body.n, "图片数量", 1, 9, true);
    if (body.response_format !== undefined) requireValue(["url", "base64"].includes(body.response_format), "图片response_format须为url或base64");
    if (body.subject_reference !== undefined) {
      requireValue(Array.isArray(body.subject_reference), "subject_reference必须为数组");
      for (const ref of body.subject_reference) {
        requireValue(ref.type === "character", "图片主体参考仅支持character");
        ref.image_file = await media(ref.image_file, "image", evidence);
        if (ref.image_file.startsWith("data:")) {
          requireValue(/^data:image\/(jpeg|png);base64,/.test(ref.image_file), "图片主体参考仅支持JPEG/PNG");
          requireValue(Buffer.from(ref.image_file.split(",")[1], "base64").length < 10 * 1024 * 1024, "图片主体参考须小于10MB");
        }
      }
    }
  } else if (action === "music") {
    requireValue(["music-3.0", "music-2.6"].includes(body.model), "当前脚本仅接入music-3.0、music-2.6（仅历史付费账户），不使用已停止的free接口");
    if (body.is_instrumental || body.lyrics_optimizer) textValue(body.prompt, "音乐提示词", 2000);
    else textValue(body.lyrics, "歌词", 3500);
    if (body.prompt !== undefined) requireValue(typeof body.prompt === "string" && [...body.prompt].length <= 2000, "音乐prompt最多2000字符");
  }
  if (["speech", "music"].includes(action)) {
    requireValue(body.stream === undefined || body.stream === false, "本工具采用非流式音频，stream须为false");
    body.stream = false;
    body.output_format ??= "hex";
    requireValue(["hex", "url"].includes(body.output_format), "音频output_format须为hex或url");
    const formats = action === "speech" ? ["mp3", "wav", "pcm", "flac"] : ["mp3", "wav", "pcm"];
    requireValue(formats.includes(body.audio_setting?.format), "显式填写audio_setting.format");
  }
  requireValue(Buffer.byteLength(apiJson(body)) <= 64 * 1024 * 1024, "JSON请求体超过64MB，请改用URL或平台文件ID");
}

async function apiRequest(host: string, path: string, body: string | FormData | undefined, timeout: number, responsePath: string) {
  const key = process.env.MINIMAX_API_KEY?.trim();
  requireValue(key, "缺少MINIMAX_API_KEY；请在本地环境配置，不要粘贴到聊天");
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (typeof body === "string") headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${apiHost(host)}${path}`, { method: body === undefined ? "GET" : "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(timeout * 1000) });
    const raw = await response.text();
    let parsed: Json | undefined;
    try { parsed = parseJson(raw); } catch { /* 保存非JSON错误响应以供恢复判断。 */ }
    await atomicJson(responsePath, { httpStatus: response.status, receivedAt: new Date().toISOString(), body: parsed, rawText: parsed === undefined ? raw : undefined });
  } catch (error) {
    // 已发出的POST即使超时也可能成功；调用者必须恢复同一任务而不是重发。
    throw new Error(`请求或响应保存未完成（${(error as Error).name}）；提交结果可能未知，禁止自动重发。记录目录：${dirname(responsePath)}`);
  }
  const saved = await readJson(responsePath);
  validateResponse(saved);
  return saved.body;
}

function validateResponse(saved: Json) {
  requireValue(saved.httpStatus >= 200 && saved.httpStatus < 300, `HTTP ${saved.httpStatus}；详情已保存，停止自动重试`);
  const body = saved.body;
  object(body, "API响应");
  requireValue(!body.error && body.type !== "error", `API错误（${body.error?.type || "unknown"}），详情已保存`);
  if (body.base_resp !== undefined) requireValue(body.base_resp.status_code === 0, `业务错误码 ${body.base_resp.status_code}；详情已保存`);
}

async function exclusiveOutput(path: string, bytes: Uint8Array) {
  requireValue(bytes.length > 0, "拒绝保存空文件");
  const temp = `${path}.${randomUUID()}.part`;
  await writeFile(temp, bytes, { flag: "wx", mode: 0o600 });
  try { await link(temp, path); } finally { await unlink(temp); }
}

async function download(url: string, timeout: number) {
  const parsed = new URL(url);
  requireValue(parsed.protocol === "https:" && !parsed.username && !parsed.password, "下载仅接受无用户凭据的HTTPS URL");
  // 下载媒体绝不附带API Authorization。
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout * 1000), redirect: "error" });
  requireValue(response.ok, `媒体下载HTTP ${response.status}；复用已存响应恢复，不重新生成`);
  const contentType = response.headers.get("content-type") || "";
  requireValue(!/text\/html/.test(contentType), "媒体下载返回HTML，拒绝当作成品保存");
  return Buffer.from(await response.arrayBuffer());
}

function decode(value: string, encoding: "hex" | "base64") {
  const text = encoding === "base64" ? value.replace(/^data:[^,]+,/, "") : value;
  requireValue(typeof text === "string" && (encoding === "hex" ? /^(?:[a-fA-F0-9]{2})+$/.test(text) : /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)), `响应${encoding}数据不完整`);
  return Buffer.from(text, encoding);
}

async function recover(job: Json, directory: string, timeout: number) {
  const name = job.action === "videoCreate" ? "status.json" : "response.json";
  const saved = await readJson(resolve(directory, name));
  validateResponse(saved);
  const body = saved.body;
  if (job.action !== "videoCreate") requireValue(body.base_resp?.status_code === 0, "同步接口缺少成功业务状态，保留响应并停止");
  if (job.action === "upload") requireValue(typeof body.file?.file_id === "string" || Number.isSafeInteger(body.file?.file_id), "上传响应缺少有效文件ID");
  if (job.action === "voices") requireValue([body.system_voice, body.voice_cloning, body.voice_generation].some(Array.isArray), "音色查询未返回音色列表");
  const items: { name: string; value: string; encoding?: "hex" | "base64" }[] = [];
  const format = job.payload?.audio_setting?.format || "mp3";
  requireValue(["mp3", "wav", "pcm", "flac"].includes(format), "记录中的音频格式无效");
  if (job.action === "videoCreate") {
    requireValue(body.task?.status === "succeeded", `视频尚未成功：${body.task?.status || "unknown"}`);
    textValue(body.task?.content?.url, "视频下载地址");
    items.push({ name: "video.mp4", value: body.task.content.url });
  } else if (["speech", "music"].includes(job.action)) {
    requireValue(body.data?.status === 2, "音频响应尚未完成，不能交付");
    textValue(body.data?.audio, "音频数据");
    items.push({ name: `audio.${format}`, value: body.data.audio, encoding: job.payload.output_format === "url" ? undefined : "hex" });
    if (body.data.subtitle_file) items.push({ name: "subtitles.json", value: body.data.subtitle_file });
  } else if (job.action === "voiceDesign") {
    textValue(body.voice_id, "生成音色ID");
    textValue(body.trial_audio, "试听音频");
    items.push({ name: "preview.mp3", value: body.trial_audio, encoding: "hex" });
  } else if (job.action === "voiceClone") {
    requireValue(!body.input_sensitive_type && !(body.input_sensitive === true) && !(body.input_sensitive?.type > 0), "克隆源命中限制，不能认定音色可用");
    if (job.payload.text) { textValue(body.demo_audio, "克隆试听地址"); items.push({ name: "preview.mp3", value: body.demo_audio }); }
  } else if (job.action === "image") {
    const urls = body.data?.image_urls;
    const encoded = body.data?.image_base64;
    requireValue(Array.isArray(urls) || Array.isArray(encoded), "响应没有图片列表");
    (urls || encoded).forEach((value: string, index: number) => items.push({ name: `image${index + 1}.jpg`, value, encoding: urls ? undefined : "base64" }));
    requireValue(items.length > 0, "未生成可下载图片");
  }
  const files: Json[] = [];
  for (const item of items) {
    const bytes = item.encoding ? decode(item.value, item.encoding) : await download(item.value, timeout);
    if (["voiceDesign", "voiceClone"].includes(job.action)) {
      if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE") item.name = "preview.wav";
      else requireValue(bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224), "试听音频未识别为MP3或WAV，保留原始响应待核实");
    }
    if (job.action === "image") {
      if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) item.name = item.name.replace(/\.jpg$/, ".png");
      else if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") item.name = item.name.replace(/\.jpg$/, ".webp");
      else requireValue(bytes[0] === 255 && bytes[1] === 216, "图片不是可识别的JPEG/PNG/WebP");
    }
    const target = resolve(directory, item.name);
    try { await exclusiveOutput(target, bytes); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      requireValue(hash(await readFile(target)) === hash(bytes), `已有${item.name}内容不同，保留原文件并停止覆盖`);
    }
    files.push({ path: target, bytes: bytes.length, sha256: hash(bytes) });
  }
  const expected = job.action === "image" ? (job.payload.n || 1) : files.length;
  const result = { files, complete: files.length === expected, expected, actual: files.length, voiceId: body.voice_id || job.payload?.voice_id, fileId: body.file?.file_id, technicalDecodeVerified: false, userAccepted: false };
  await atomicJson(resolve(directory, "downloads.json"), result);
  requireValue(result.complete, `图片仅返回${files.length}/${expected}张；已保存可用部分，不自动补生成`);
  return result;
}

async function withJob<T>(jobPath: string, work: (job: Json, directory: string) => Promise<T>): Promise<T> {
  const path = resolve(jobPath);
  requireValue(basename(path) === "request.json", "--job须指向request.json");
  const directory = dirname(path);
  requireValue(directory !== skillRoot && !directory.startsWith(skillRoot + "/") && !directory.startsWith(skillRoot + "\\"), "任务不能放在技能源码中");
  const lockPath = resolve(directory, ".minimaxLock");
  const lock = await open(lockPath, "wx", 0o600);
  try {
    const job = await readJson(path);
    requireValue(job.schema === 1 && endpoints[job.action] !== undefined, "不是支持的MiniMax任务记录");
    apiHost(job.host);
    return await work(job, directory);
  } finally { await lock.close(); await unlink(lockPath); }
}

async function main() {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    input: { type: "string" }, out: { type: "string" }, job: { type: "string" }, file: { type: "string" }, purpose: { type: "string" },
    wait: { type: "string" }, timeout: { type: "string" }, dryRun: { type: "boolean" }, help: { type: "boolean" },
  } });
  const action = positionals[0];
  if (args.help || !action) { console.log(help); return; }
  requireValue(positionals.length === 1, "只接受一个动作");
  const timeout = Number(args.timeout ?? 300);
  range(timeout, "timeout", 1, 1800, true);
  if (action === "config") { console.log(JSON.stringify({ host: apiHost(), keyConfigured: Boolean(process.env.MINIMAX_API_KEY?.trim()), node: process.versions.node, ffprobeConfigured: Boolean(process.env.MINIMAX_FFPROBE) })); return; }
  if (action === "videoQuery" || action === "recover") {
    requireValue(args.job && !args.dryRun && !args.input && !args.out && !args.file, "查询/恢复使用--job，不接受input/out/file/dryRun");
    const result = await withJob(args.job, async (job, directory) => {
      if (action === "recover") return recover(job, directory, timeout);
      requireValue(job.action === "videoCreate", "videoQuery仅处理视频任务");
      const created = await readJson(resolve(directory, "response.json"));
      validateResponse(created);
      const taskId = created.body.task_id;
      requireValue(typeof taskId === "string" && /^[A-Za-z0-9_-]+$/.test(taskId), "没有有效task_id；提交可能未知，不能重新提交替代查询");
      const wait = Number(args.wait ?? 0);
      range(wait, "wait", 0, 7200, true);
      const deadline = Date.now() + wait * 1000;
      while (true) {
        const body = await apiRequest(job.host, `/v2/query/video_generation/${encodeURIComponent(taskId)}`, undefined, timeout, resolve(directory, "status.json"));
        const status = body.task?.status;
        requireValue(["queued", "running", "succeeded", "failed", "cancelled", "expired"].includes(status), "未知任务状态；保留记录，停止自动处理");
        if (status === "succeeded") return { taskId, status, ...await recover(job, directory, timeout) };
        requireValue(!["failed", "cancelled", "expired"].includes(status), `视频任务${status}；taskId=${taskId}，不自动新建任务`);
        if (!wait || Date.now() + 10000 > deadline) return { taskId, status, pending: true, job: args.job };
        console.error(JSON.stringify({ taskId, status }));
        await delay(10000);
      }
    });
    console.log(JSON.stringify(result, null, 2)); return;
  }
  requireValue(endpoints[action], "未知动作，使用--help查看");
  requireValue(args.out && !args.job && !args.wait, "新请求需要--out新任务目录，不接受job/wait");
  const host = apiHost();
  const directory = resolve(args.out);
  const relative = directory.toLowerCase();
  requireValue(relative !== skillRoot.toLowerCase() && !relative.startsWith(skillRoot.toLowerCase() + "/") && !relative.startsWith(skillRoot.toLowerCase() + "\\"), "任务产物必须放在用户工作目录，不放技能源码");
  const evidence: Json[] = [];
  let body: Json;
  let multipart: FormData | undefined;
  if (action === "upload") {
    requireValue(args.file && !args.input && ["voice_clone", "prompt_audio"].includes(args.purpose || ""), "upload需--file与--purpose voice_clone或prompt_audio");
    const path = resolve(args.file);
    requireValue([".mp3", ".m4a", ".wav"].includes(extname(path).toLowerCase()), "克隆上传仅支持MP3/M4A/WAV");
    const info = await stat(path);
    requireValue(info.isFile() && info.size > 0 && info.size <= 20 * 1024 * 1024, "克隆音频需不超过20MB");
    const duration = validateProbe(probe(path), args.purpose!);
    const bytes = await readFile(path);
    body = { purpose: args.purpose, file: path, bytes: bytes.length, sha256: hash(bytes), duration };
    multipart = new FormData(); multipart.append("purpose", args.purpose!); multipart.append("file", new Blob([bytes]), basename(path));
  } else {
    requireValue(!args.file && !args.purpose, "file/purpose只用于upload");
    requireValue(args.input || action === "voices", "需要--input官方JSON请求体");
    body = args.input ? await readInput(args.input) : { voice_type: "all" };
    await prepare(action, body, evidence);
  }
  const job = { schema: 1, action, host, endpoint: endpoints[action], createdAt: new Date().toISOString(), input: args.input === "-" ? "stdin" : args.input ? resolve(args.input) : null, payload: summary(body), media: evidence, requestSha256: hash(apiJson(body)) };
  if (args.dryRun) { console.log(JSON.stringify({ dryRun: true, out: directory, ...job }, null, 2)); return; }
  requireValue(process.env.MINIMAX_API_KEY?.trim(), "缺少MINIMAX_API_KEY；尚未创建任务或调用服务");
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory); // 已有目录即拒绝，防止覆盖记录或误重发。
  const jobPath = resolve(directory, "request.json");
  await writeFile(jobPath, JSON.stringify(job, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.error(JSON.stringify({ job: jobPath, state: "submitting", instruction: "中断后保留此目录，不以新提交代替恢复" }));
  const response = await apiRequest(host, endpoints[action], multipart || apiJson(body), timeout, resolve(directory, "response.json"));
  if (action === "videoCreate") {
    textValue(response.task_id, "task_id");
    console.log(JSON.stringify({ taskId: response.task_id, job: jobPath, next: "videoQuery --job <request.json> --wait 1800" }, null, 2));
  } else {
    console.log(JSON.stringify({ job: jobPath, ...await withJob(jobPath, (saved, dir) => recover(saved, dir, timeout)) }, null, 2));
  }
}

main().catch(error => { console.error(redact((error as Error).message)); process.exitCode = 1; });
