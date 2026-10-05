# 模型与接口快照

以下来自记录版本的源代码静态阅读，不表示接口当前可用。公共约定集中于本页；任务处理见[任务与实现审查](jobs-and-review.md)。

## 旧接口约定

| 项目 | 源码中的值 |
| --- | --- |
| 基础地址 | `https://api.lk888.ai` |
| 创建 | `POST /v1/media/generate` |
| 查询 | `GET /v1/media/status?task_id=<task_id>` |
| 认证 | `Authorization: Bearer`，值来自环境变量 `HUBKKK_API_KEY` |
| 请求形态 | 顶层 `model`、`prompt`、`params` |
| 参考图 | `params.images` URL 数组；脚本只校验 HTTP(S) 语法，不验证实际公开可访问 |
| 本地输出 | 旧默认 `hubkkk-output/image.png`，JSON 默认 `<out>.json`；不属于本项目已实现能力 |

本地参考图在旧文中要求先取得外部可访问 URL。后续设计应先确认素材外发授权和暴露范围，不能把“使用本地图片”自动等同于“公开上传”。

## 模型分支（源码支持范围）

| 模型标签 | 图片上限 | 参数 |
| --- | --- | --- |
| `gpt-image-2` | 10 | `size`、`quality`；可选 `aspect_ratio`、`n`、`resolution`、`response_format` |
| `gpt-image-2-guan` | 10 | `size`、`quality`；图片通过 `images` |
| `gemini-3.1-flash-image-preview-guan` | 11 | 必填 `aspectRatio`、`imageSize`；可选 `thinkingLevel`、`web_search` |
| `gemini-3.1-flash-image-preview` | 14 | 同上；imageSize 另允许 0.5K |

GPT 旧入口默认 **`gpt-image-2`**；Banana 旧入口默认 **`gemini-3.1-flash-image-preview-guan`**。通用分发入口只按精确 Banana 模型标签切换脚本，否则交给 GPT 入口验证；不写 model 不会自动选 Banana。

### GPT 参数

- `size`、`quality` 默认均为 `auto`；quality 枚举 `auto/high/medium/low`。
- size 可取内置预设或自定义 `WIDTHxHEIGHT`。自定义校验：最长边 ≤3840、宽高是 16 的倍数、长短边比 ≤3、像素总数 655360–8294400；这些是本地限制，不能代替提供方实际限制。
- 普通模型的附加枚举实际只接受 `aspect_ratio=1:1`、`resolution=1K`、`response_format=url`；旧文的“例如”容易让人误认为支持任意值。
- `n` 仅校验为正整数，没有脚本端最大值；远端上限未知。对官转模型传这些附加选项时，旧脚本会校验但不写入 payload，存在静默忽略。
- `--prompt` 与 `--prompt-file` 互斥；文件 UTF-8 读取并 trim，空白内容按缺少提示词处理。Banana 入口没有 prompt-file 支持。

### Banana 参数

- aspectRatio 枚举：`1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`4:5`、`5:4`、`9:16`、`16:9`、`21:9`、`1:4`、`4:1`、`1:8`、`8:1`。
- 官转 imageSize：`1K/2K/4K`；普通分支另支持 `0.5K`。
- thinkingLevel：`minimal/high`；`--web-search` 写入 `web_search: true`。命名和枚举应与实际提供方接口再核对。

## 透明背景：历史样本，不是能力保证

源文记录于 2026-08-25：普通 `gpt-image-2` 在文生图、图生图和多素材宫格中，提示词要求透明后曾返回真实 Alpha PNG；官转样本未返回 Alpha。没有本次复现或跨提示词质量评估。

可保留的提示词方向是孤立主体、真实透明通道、排除场景／地面阴影／棋盘格；这不能保证结果透明。旧脚本没有显式 background 选项，也不在下载后检查 Alpha。验收应查看真实通道、透明像素、有效主体及多背景边缘，不能凭 PNG 后缀或棋盘格外观判断。

源记录还观察到返回尺寸偏离请求，说明后处理应读取实际尺寸；不是“接口一定忽略 size”的证明。

## 原生 Gemini 格式待核实

旧 `nano-banana-2.md` 额外描述过提供方域名上的 `v1beta ... :generateContent`／`:streamGenerateContent` 与 `x-goog-api-key`，但 **4 个源脚本未实现这一调用分支**。仅能将 [Google generateContent 文档](https://ai.google.dev/api/generate-content)作为协议参考，无法据此确认 HubKKK 的端点、认证、流式语义或兼容程度。
