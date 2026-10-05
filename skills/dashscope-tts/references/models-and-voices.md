# 模型与音色

## 选线

优先遵循用户指定的模型与音色，其次考虑格式和控制参数；冲突时确认取舍，不能为输出 MP3 擅自更换用户指定的 Qwen 音色。

| 需求 | 接口线与选择 |
| --- | --- |
| CosyVoice／Qwen-Audio-TTS 音色；直接输出 mp3/wav/pcm/opus；SSML、seed、rate 等 | A：[SpeechSynthesizer](speech-synthesizer-api.md) |
| Qwen3-TTS 系统音色；普通多语配音、无格式要求 | B：[Qwen-TTS](qwen-tts-api.md)，建议 `qwen3-tts-flash` + `Cherry`，输出 WAV |
| B 线情绪／方言指令 | `qwen3-tts-instruct-flash` + `instructions` |
| 已有复刻／设计音色 | 先确认该音色的创建模型与官方支持接口；本脚本仅为 A 线已支持模型开放非空 voice ID，不负责创建音色 |

模型与 voice 必须在请求 JSON 中显式指定，脚本不随机选音色、不自动切模型。用户未指定时说明所选组合；A 线可用 `cosyvoice-v3-plus` + `longanhuan`，不同费用档位按用户需求确认。

## 本地模型清单

- A：`cosyvoice-v3.5-plus`、`cosyvoice-v3.5-flash`、`cosyvoice-v3-plus`、`cosyvoice-v3-flash`、`cosyvoice-v2`、`qwen-audio-3.0-tts-plus`、`qwen-audio-3.0-tts-flash`。
- B：`qwen3-tts-flash`、`qwen3-tts-instruct-flash`、`qwen-tts`。

`qwen-tts` 为旧模型，按 token 计量；其他列出的模型按字符计量，实际价格及权限以官方控制台为准。清单不是账户可用性查询；新模型／快照 ID 需核对官方文档后再接入脚本。

## 核对音色

| 模型组合 | 音色示例 | 依据 |
| --- | --- | --- |
| `cosyvoice-v3-plus` | `longanhuan` 龙安欢、`longanyang` 龙安洋 | [CosyVoice 音色列表](https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list) |
| `qwen-audio-3.0-tts-flash` | `longanhuan_v3.6` | [Qwen-Audio HTTP 官方示例](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-http-api) |
| `qwen3-tts-flash` | `Cherry` 芊悦 | [Qwen-TTS HTTP 官方示例](https://help.aliyun.com/zh/model-studio/qwen-tts-api) |

其他音色，包括 Serena、带 `_v3`／`_v3.6` 后缀或新模型组合，先查对应官方列表，保留大小写和空格。不能从中文名或前缀推断跨模型兼容性。

- [Qwen-Audio 音色列表](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list)
- [Qwen-TTS 系统音色与模型](https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide)

本轮核对公开文档，没有逐音色实测；已移除原文“所有列举音色均生产验证、可放心使用”的保证。音色列表支持地域不等于此 HTTP 接口支持所有地域；本技能脚本只接北京端点。
