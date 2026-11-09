---
name: minimax
description: MiniMax 云端媒体：H3 视频与参考语音、语音合成、音色设计及克隆、音色查询、图片与音乐生成，已有任务查询和媒体补下载。用于用户指定 MiniMax API 的创作与接入，不替代本地 ComfyUI H3 工作流。
---

# MiniMax 媒体

自维护 Skill，依据 MiniMax 官方 API 实现，非官方发布。运行时 Node.js 24+，无 npm 依赖；本地参考素材校验需要 FFprobe。完整目录可独立分发，不依赖其他技能、CLI、项目或宿主配置。

## 选择入口

保持用户任务 cwd，用绝对路径运行 `node "<技能目录>/scripts/minimax.mts" <动作>`。输入和输出路径均相对任务 cwd，不在技能源码目录生成媒体。

| 用户需求 | 必读资料 | 动作与完成条件 |
| --- | --- | --- |
| H3 文生视频、图生视频、参考图／视频／语音 | [视频](references/video.md) | `videoCreate`保存任务ID → `videoQuery`取回；解码和观看后报告实际规格与未验收项 |
| 查询已有视频或继续取回 | [任务与恢复](references/jobs.md) | 复用`request.json`执行`videoQuery`；仅询问进度时查询一次 |
| 文字配音、设计新声音、克隆声音、列音色 | [语音](references/speech.md) | `speech`、`voiceDesign`、`upload`、`voiceClone`、`voices`；保存音频／ID，区分生成成功与用户选定 |
| 图片、人物主体参考图、音乐 | [图片与音乐](references/media.md) | `image`、`music`；下载逐项验收，部分成功明确报告 |
| 同步音频／图片已生成但未下载，或视频已有成功查询响应 | [任务与恢复](references/jobs.md) | `recover`从原记录取回；不再次生成 |
| API参数、价格、账户适用性 | 对应能力资料中的官方链接 | 区分文档能力、账户权限和实测；按当前官方价格计算，不把历史报价当现价 |

详细选项用`--help`，参数使用官方 JSON 字段名；这能保留语音情绪、发音词典等参数，避免另造不完整的提示词接口。

## 配置

- `MINIMAX_API_KEY`：本地注入的按量计费 API Key；H3不使用Token Plan订阅Key或OAuth登录态。
- `MINIMAX_REGION=cn|global`，默认cn；可用`MINIMAX_API_HOST`明确选择官方主机，见脚本帮助与任务资料。
- `MINIMAX_FFPROBE`：FFprobe未在PATH时指定可执行文件。
- `config`只报告是否配置与主机，不打印密钥，不联网。脚本不自动加载`.env`、不改Agent模型配置。
- 缺少密钥时让用户在本机配置。已有安全注入可直接复用，避免让用户在聊天中再次提供密钥。

## 新任务

1. 按用户已授权的内容、模型、素材、数量和预算形成官方请求体。为每次真实请求选一个新目录；用户只要求接入或咨询时不调用付费生成。
2. 用`--dryRun`校验，核对规格、模式互斥和素材顺序。预检不联网、不写文件；远程URL和直接传入的data URI的时长、编码、尺寸仍需额外核对。
3. 提交一次。脚本在发请求前保存`request.json`，随后保存`response.json`；视频先返回任务ID，同步媒体保存响应后下载。结果未知时按[任务与恢复](references/jobs.md)处理，避免重复付费。
4. 视频继续查询同一任务，文件完成后执行FFprobe或图片解码检查；媒体质量按用户目标观看／试听判断，不能把字节数和解码通过当作创意验收。

保留用户原文和已确认的角色音色，不默认换模型、改台词、加音乐、变调或批量生成候选。角色音色的年龄感、性格和相似度须通过试听确认；声音描述是生成条件，不是效果保证。

## 范围

当前脚本接入H3 V2、非流式TTS、音色设计／克隆、克隆素材上传、音色列表、图片生成及历史付费账户的音乐生成。未封装流式TTS、ASR、长文本异步配音、音乐翻唱、视频再生成和任务删除；需要这些能力时先查官方文档，勿以已有命令声称支持。

源文档核对于2026-10-24。入口：[官方文档索引](https://platform.minimaxi.com/docs/llms.txt)、[视频API](https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create)、[官方H3 Skill](https://github.com/MiniMax-AI/cli/blob/main/skill/h3-video/SKILL.md)。本实现直接调用HTTP API，支持官方CLI当时尚未开放的H3 768P及不同型号选择。
