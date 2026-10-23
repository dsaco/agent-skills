# 豆包语音合成 2.0

用于把用户提供的文案变成配音文件，使用预设音色和 HTTP Chunked 单向流式接口。不是实时对话，也不创建声音复刻音色。

## 配置与选声

复用 `VOLCENGINE_SPEECH_API_KEY`，服务资源为 `seed-tts-2.0`。语音识别服务已开通不代表语音合成也有权限；先在语音控制台开通语音合成 2.0 并确认 Key 所属项目有权使用。

旧版配置可用 `VOLCENGINE_SPEECH_APP_ID` + `VOLCENGINE_SPEECH_ACCESS_TOKEN`；TTS 使用 `X-Api-App-Id` 请求头，不能照搬 ASR 的 `X-Api-App-Key`。新版 Key 优先；脚本不读取 `.env`，也不使用 `ARK_API_KEY`。

`--speaker` 必填。从[官方音色列表](https://www.volcengine.com/docs/6561/1257544)中选择“豆包语音合成模型 2.0”的音色 ID，不能把展示名称、1.0 音色或复刻音色 ID 当作 2.0 预设音色。用户指定的声音必须保留；用户让 Agent 选择时可按用途选声并说明选择，未取得选择授权且声音是关键要求时再询问。脚本仅校验 ID 形式，不证明音色可用或账户权限。

## 新合成

1. 保留原文，确定音色、语气和输出格式；`--text` 与 UTF-8 `--text-file` 二选一。以用户任务 cwd 运行，输出使用不存在的新目录。只在明确要求实际配音时提交，咨询或接入开发只做预检。
2. 运行 `audio-synthesize ... --dry-run`，检查模型、文字、音色及参数。预检无需 Key、不联网、不写文件，不代表远端验收。
3. 移除 `--dry-run` 提交一次。脚本先保存 `request.json`，再接收并保存 `events.jsonl`；只有收到业务完成码且音频非空，才导出文件。网络断开、服务错误、音频空或完成标记缺失均报错，不自动重试，不把片段当成成品。
4. 成功后交付 `speech.mp3`／`speech.wav`／`speech.pcm`。MP3 只检查头部签名，PCM 只检查采样字节完整性；交付前用媒体工具验证可解码、时长，再按需试听。没有听过就明确未做听感验收，不把输出成功说成音色或情绪已达标。

```sh
node "<技能目录>/scripts/ark-media.js" audio-synthesize --text-file narration.txt --speaker VOICE_ID --out-dir output/narration-01 --dry-run
node "<技能目录>/scripts/ark-media.js" audio-synthesize --text-file narration.txt --speaker VOICE_ID --out-dir output/narration-01
```

| 参数 | 行为 |
| --- | --- |
| `--format mp3\|pcm\|wav` | 默认 MP3；WAV 请求 PCM 后在本地封装，避免拼接多个 WAV 头 |
| `--sample-rate` | 8000、16000、22050、24000、32000、44100、48000；默认 24000 |
| `--speech-rate` | -50～100，0 为正常速度，-50 为 0.5 倍、100 为 2 倍；负数使用 `--speech-rate=-25` |
| `--loudness-rate` | -50～100，0 为正常音量；负数使用 `--loudness-rate=-25` |
| `--instruction` | 一条原样传递的语气指令，如“用温和、舒缓的语气说”；放入 `additions.context_texts`，与朗读正文分开 |

WAV 封装按单声道、16-bit little-endian PCM 处理；PCM 裸文件播放时也应使用这些参数和请求采样率。脚本不自动播放。具体指令效果取决于模型与音色，不保证每次完全一致。

文本文件设 1 MiB 本地读入上限，响应设 128 MiB 上限，单次请求含响应读取超时 120 秒；这些是脚本保护范围，不是官方文本长度或生成时长保证。长文不自动拆分成多次付费请求，应按任务规划分段并逐项验收。

## 恢复与异常

`request.json` 含原文、音色、请求 ID、状态和服务返回的用量；`response.json` 记录 HTTP 状态和 log ID；`events.jsonl` 保存音频响应。凭据不落盘，但文案与音频本身仍是用户数据。

如果完整响应已经保存，只有本地导出失败，可使用以下命令离线恢复到新目录，无需 Key、不会再次生成：

```sh
node "<技能目录>/scripts/ark-media.js" audio-recover --job output/narration-01/request.json --out-dir output/narration-recovered
```

恢复会重新检查完整标记和音频格式；缺少成功结束标记的流不能恢复成完整配音。本接口没有接入异步任务查询，不能用 `audio-query` 查询 TTS 请求。提交超时／中断时保留请求 ID 和 log ID，核对控制台或联系服务方；重复生成可能再次收费，应由用户决定。

## 来源与范围

[官方 HTTP 单向流式文档](https://www.volcengine.com/docs/6561/1598757)，2026-10-23 核对：鉴权、`seed-tts-2.0`、参数、JSON 字符串 additions、Base64 音频片段和 `20000000` 完成码。当前仅接入 2.0 预设音色配音，不含声音复刻、混音、播客、实时语音对话、SSML 或双向 WebSocket。
