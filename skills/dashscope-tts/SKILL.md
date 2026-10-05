---
name: dashscope-tts
description: 百炼语音合成：用户指定阿里云 DashScope、CosyVoice、Qwen-TTS／Qwen-Audio-TTS 模型或龙安欢、Cherry 等阿里音色生成配音时使用；也处理已有合成响应的音频补下载。
compatibility: Node.js 22+；合成需要环境变量 DASHSCOPE_API_KEY；无 npm 依赖；转码另需本机已有音频工具。
---

# DashScope TTS

使用 `node "<技能目录>/scripts/tts.mjs"`，将技能目录解析为绝对路径，保留用户任务 cwd。参数疑问用 `--help`。

## 选择分支

| 需求 | 必读文档 | 路径与结束条件 |
| --- | --- | --- |
| 新合成或授权重新生成 | [模型与音色](references/models-and-voices.md)、对应接口参数、[任务规则](references/jobs.md) | 下方新合成流程 |
| 已有响应补下载 | [恢复与验收](references/jobs.md#补下载) | `download` 复用 result.json；只下载，不新合成；按验收清单交付 |
| 本地模型清单 | 无 | `models`；报告本地定义与账户权限未验证后结束 |
| 流式播放、字级时间戳、创建复刻音色 | 对应接口参数 | 说明当前脚本仅非流式、仅使用已有音色；确认扩展实现或替代方案后再执行，不静默降级 |

## 新合成流程

1. **列交付清单。** 确认原文、模型与音色、语言、输出格式、分段和风格要求，按模型文档选择唯一接口线。保留用户文本；改写、拆分或转码影响交付时说明方案。**完成：每项要求映射到参数或明确边界，音色与模型对应，影响费用的歧义已解决。**
2. **构造并预检。** 在用户工作目录写请求 JSON，A 线读 [SpeechSynthesizer](references/speech-synthesizer-api.md)，B 线读 [Qwen-TTS](references/qwen-tts-api.md)。执行 `synthesize --request <json> --out-dir <新目录> --dry-run`。**完成：预检通过、文本与参数逐项一致；仅预览时交付请求摘要并结束。**
3. **单次提交留据。** 用户授权实际合成后，按任务规则准备环境并移除 `--dry-run`。**完成：request.json 与 result.json 已保存，响应表明合成结束；异常按失败分流报告，状态不明时禁止自动重提。**
4. **验收交付。** 执行[验收与交付](references/jobs.md#验收与交付)，转码仅在用户需要且本地工具可用时另存副本。**完成：每个分段有文件或失败状态，每项要求有检查结论或未验证说明，实际格式符合约定。**
