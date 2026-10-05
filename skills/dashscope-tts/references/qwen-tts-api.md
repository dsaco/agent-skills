# B 线：Qwen-TTS

官方依据：[Qwen-TTS HTTP API](https://help.aliyun.com/zh/model-studio/qwen-tts-api)。运行与恢复见 [jobs.md](jobs.md)。

端点：`POST /api/v1/services/aigc/multimodal-generation/generation`。本技能只接北京端点；北京与新加坡 Key 不通用，不应把本技能地域范围说成整个 Qwen 服务的范围。

## 请求

```json
{
  "model": "qwen3-tts-flash",
  "input": {
    "text": "你好，欢迎来到今天的节目。",
    "voice": "Cherry",
    "language_type": "Chinese"
  }
}
```

| 字段 | 规则 |
| --- | --- |
| model | qwen3-tts-flash、qwen3-tts-instruct-flash、qwen-tts |
| input.text | 必填非空；Qwen3 最多 600 字符，脚本按 Unicode 码点计数；qwen-tts 为 512 Token，本地不估算 token |
| input.voice | 必填非空；系统音色按[模型与音色](models-and-voices.md)选择 |
| input.language_type | Auto（服务默认）/ Chinese / English / German / Italian / Portuguese / Spanish / Japanese / Korean / French / Russian |
| input.instructions | 仅 instruct 模型；中文或英文，最多 1600 Token，本地不估算 token |
| input.optimize_instructions | 仅 instruct 模型；布尔，为 true 时要求 instructions 非空，只有用户要求优化指令才启用 |

脚本不给 B 线传 format/sample_rate/rate/pitch 等 A 线参数。输出按 WAV 保存；需要 MP3 时在用户确认后本地转码，保留原 WAV，不改音色来规避转码。

## 响应

重点读取 HTTP 状态、`code`、`output.finish_reason`、`output.audio.data/url`、`request_id`、`usage`。官方示例包含 `status_code` 包装；脚本在存在时检查其为 200，不把所有原始 HTTP JSON 都假设成 SDK 包装。

完成须 HTTP 成功、无 code 错误、finish_reason 为 stop，且音频可用。非空 data 按 Base64 解码，否则下载 url。usage 留作计量信息，缺少 usage 不等于无音频或必须重合成；实际扣费以账单为准。

## 流式参考（脚本未实现）

官方支持 `X-DashScope-SSE: enable`。中间块可携带 Base64 数据，最终块带完整音频 URL。流式数据的编码、封装与播放方式以当前接口文档为准，不能仅拼接后缀就认为得到有效 WAV。当前脚本只请求非流式，实时播放需求需另行实现和验收。
