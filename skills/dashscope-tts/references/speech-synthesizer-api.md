# A 线：SpeechSynthesizer

官方依据：[CosyVoice HTTP](https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api)、[Qwen-Audio-TTS HTTP](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-http-api)。运行、认证和输出规则见 [jobs.md](jobs.md)。本脚本只接非流式。

端点：`POST /api/v1/services/audio/tts/SpeechSynthesizer`；北京地域。官方建议使用业务空间专属域名，脚本用 `--workspace <WorkspaceId>` 选择；省略则使用官方文档提及的原通用域名。

## 请求

```json
{
  "model": "cosyvoice-v3-plus",
  "input": {
    "text": "你好，欢迎来到今天的节目。",
    "voice": "longanhuan",
    "format": "mp3",
    "sample_rate": 24000
  }
}
```

model、input.text、input.voice 必填；只传用户需要的可选字段，其余交给服务默认。

| input 字段 | 规则 |
| --- | --- |
| format | mp3（服务默认）、wav、pcm、opus |
| sample_rate | 8000 / 12000 / 16000 / 22050（服务默认）/ 24000 / 44100 / 48000；opus 排除 22050、44100 |
| volume | 整数 0–100，服务默认 50 |
| rate / pitch | 0.5–2，服务默认 1；语速字段为 rate |
| bit_rate | 整数 6–510，仅 opus |
| enable_ssml | 布尔；需音色及模型支持，查[SSML 限制](https://help.aliyun.com/zh/model-studio/ssml-latex-user-guide) |
| seed | 整数 0–65535，服务默认 0 |
| language_hints | 语言代码数组；官方当前只处理首项，本脚本要求恰好一项；可用 zh/en/fr/de/ja/ko/ru/pt/th/id/vi/es/it/ms/fil/ar |
| instruction | 风格控制文本；格式与可用情感依赖具体音色，按音色列表填写 |
| hot_fix | pronunciation / replace 的值均为单键对象数组；cosyvoice-v2 不支持 |
| enable_aigc_tag | 布尔；wav/mp3/opus，CosyVoice v3.5 不开放此参数的启用 |
| aigc_propagator / aigc_propagate_id | 文本，需 enable_aigc_tag=true |

热修复结构：

```json
{"hot_fix":{"pronunciation":[{"天气":"tian1 qi4"}],"replace":[{"今天":"金天"}]}}
```

`word_timestamp_enabled` 只对流式及支持音色有效；本脚本拒绝该字段。`enable_markdown_filter` 仅特定模型的复刻音色支持，本脚本暂未开放。文本长度、instruction 语法和音色匹配由对应模型文档与服务端裁决，本地校验不能替代。

## 返回与 seed

非流式响应主要包含 `request_id`、`output.finish_reason`、`output.audio.url`、`usage.characters`；URL 通常有效 24 小时。`finish_reason=stop` 后下载，下载失败从保存的 result.json 恢复。

官方表述为：模型版本、文本、音色和其他参数相同时，相同 seed 可复现相同合成结果。它不是跨版本逐字节保证。文件大小相同不能证明内容相同；字节相同应比较哈希，听感改进需要试听。用户授权“换一种渲染”时可显式更换 seed，记录改变；重下原文件则沿用响应，不重新合成。

## 流式参考（脚本未实现）

请求头 `X-DashScope-SSE: enable` 返回 `sentence-begin`、多个 `sentence-synthesis`、`sentence-end`；音频块按序处理，最终 `finish_reason=stop` 帧带完整 URL。需要此能力时先确认扩展实现，不能把非流式脚本宣称为实时播放或字级时间戳支持。
