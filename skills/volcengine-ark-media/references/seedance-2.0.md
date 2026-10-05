# Seedance 2.0 API 参考

> 本文为导入版本的参考快照，本轮未重新核验模型、价格或媒体限制；实际能力以当前官方文档和账户权限为准。命令中的 `<技能目录>` 需解析为本 Skill 的绝对路径，输入输出相对用户 cwd。

来源：火山方舟官方文档：`https://www.volcengine.com/docs/82379/1520757?lang=zh` 和 `https://www.volcengine.com/docs/82379/1521309?lang=zh`。

## 目录

- [接口](#接口)
- [模型](#模型)
- [创建任务请求体](#创建任务请求体)
- [创建任务脚本用法](#创建任务脚本用法)
- [媒体限制](#媒体限制)
- [查询任务响应](#查询任务响应)
- [价格计算](#价格计算)

## 接口

- 创建任务：`POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`
- 查询任务：`GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`
- 鉴权：`Authorization: Bearer $ARK_API_KEY`
- 请求类型：`application/json`

## 模型

- 默认模型：`doubao-seedance-2-0-260128`
- 本页只定义 2.0；选择 2.5 时读取[2.5 参数](seedance-2.5.md)，不沿用本页数量／时长限制。

## 创建任务请求体

必填字段：

- `model`：模型 ID 或 Endpoint ID。
- `content`：输入内容数组，支持文本、图片、视频、音频。

内容结构：

```json
{ "type": "text", "text": "提示词" }
{ "type": "image_url", "image_url": { "url": "..." }, "role": "first_frame" }
{ "type": "video_url", "video_url": { "url": "..." }, "role": "reference_video" }
{ "type": "audio_url", "audio_url": { "url": "..." }, "role": "reference_audio" }
```

支持的 Seedance 2.0 场景：

- 多模态参考生视频：参考图片 `0~9` + 参考视频 `0~3` + 参考音频 `0~3` + 文本提示词可选。不可单独输入音频，至少包含 1 个参考图片或参考视频。
- 图生视频-首尾帧：首帧图片 + 尾帧图片 + 文本提示词可选。
- 图生视频-首帧：首帧图片 + 文本提示词可选。
- 文生视频：只输入文本提示词。

图片 role：

- `first_frame`：首帧图片。
- `last_frame`：尾帧图片。
- `reference_image`：Seedance 2.0 多模态参考图片。
- 图生视频-首帧场景中，官方允许省略 role 或使用 `first_frame`。

视频 role：

- `reference_video`

音频 role：

- `reference_audio`

支持的可选请求字段：

- `callback_url`：任务状态变化回调地址。
- `return_last_frame`：是否返回生成视频的尾帧图像。
- `execution_expires_after`：任务超时阈值，单位秒，取值范围 `[3600, 259200]`，默认 `172800`。
- `generate_audio`：是否生成有声视频，默认 `true`。
- `tools`：Seedance 2.0 支持 `{ "type": "web_search" }`。
- `safety_identifier`：终端用户唯一标识，最长 64 字符。
- `priority`：任务优先级，整数 `0~9`，数值越大优先级越高。
- `resolution`：`480p`、`720p`、`1080p`。Seedance 2.0 fast 不支持 `1080p`。
- `ratio`：`16:9`、`4:3`、`1:1`、`3:4`、`9:16`、`21:9`、`adaptive`。
- `duration`：生成视频时长，整数秒。Seedance 2.0 支持 `[4, 15]` 或 `-1`。
- `seed`：随机种子，整数范围 `[-1, 2^32 - 1]`。
- `watermark`：是否添加 AI 生成水印，默认 `false`。

当前不支持或刻意不接入的字段：

- `draft`：本 Skill 未接样片工作流；2.5 的边界见其专页。
- `frames`：Seedance 2.0 系列暂不支持。
- `camera_fixed`：Seedance 2.0 系列暂不支持。
- `service_tier`：Seedance 2.0 系列仅支持在线推理模式，不支持配置该参数。

## 创建任务脚本用法

创建前读取[任务规则](jobs.md)，输出目录和提交记录统一见该文档。以下示例仅用于预检；实际生成按 SKILL 流程执行。

文生视频：

```bash
node "<技能目录>/scripts/ark-media.js" video-create \
  --prompt "一只黑猫走在霓虹雨夜街道，电影感，低机位跟拍" \
  --name "cat-neon" \
  --resolution 1080p \
  --ratio 16:9 \
  --duration 8 --dry-run
```

首帧图生视频：

```bash
node "<技能目录>/scripts/ark-media.js" video-create \
  --prompt "让画面中的猫缓慢走向镜头，雨水反射霓虹灯" \
  --image "input/cat.png" --image-role first_frame \
  --name "cat-neon" \
  --resolution 1080p \
  --ratio 16:9 \
  --duration 8 --dry-run
```

首尾帧视频：

```bash
node "<技能目录>/scripts/ark-media.js" video-create \
  --prompt "从第一张图平滑过渡到第二张图，镜头缓慢推进" \
  --image "input/start.png" --image-role first_frame \
  --image "input/end.png" --image-role last_frame \
  --name "cat-neon" \
  --resolution 1080p \
  --ratio 16:9 \
  --duration 8 --dry-run
```

多参考图：

```bash
node "<技能目录>/scripts/ark-media.js" video-create \
  --prompt "参考这些图的角色、服装和环境，生成自然行走的视频" \
  --image "input/character.png" --image-role reference_image \
  --image "input/style.png" --image-role reference_image \
  --image "input/background.png" --image-role reference_image \
  --name "ref-walk" \
  --resolution 1080p \
  --ratio 16:9 \
  --duration 8 --dry-run
```

## 媒体限制

图片支持 URL、Base64 data URI 或 `asset://<ASSET_ID>`。

单张图片要求：

- 格式：jpeg、png、webp、bmp、tiff、gif、heic、heif。
- 宽高比，宽 / 高：`(0.4, 2.5)`。
- 宽高长度：`(300, 6000)` px。
- 大小：单张图片小于 30 MB。
- 请求体大小不超过 64 MB；接近上限的输入改用 URL 或 `asset://` 提供。

图片数量：

- 图生视频-首帧：1 张。
- 图生视频-首尾帧：2 张。
- Seedance 2.0 多模态参考生视频：0 到 9 张。如果传入音频，则至少还要提供 1 个参考图片或参考视频。

视频支持 URL 或 `asset://<ASSET_ID>`。

单个视频要求：

- 格式：mp4、mov。
- 分辨率：480p、720p、1080p。
- 时长：`[2, 15]` 秒。
- 最多传入 3 个参考视频。
- 所有参考视频总时长不超过 15 秒。
- 宽高比，宽 / 高：`[0.4, 2.5]`。
- 宽高长度：`[300, 6000]` px。
- 总像素数：`[409600, 2086876]`。
- 大小：单个视频不超过 50 MB。
- 帧率：`[24, 60]`。

音频支持 URL、Base64 data URI 或 `asset://<ASSET_ID>`。

单个音频要求：

- 格式：wav、mp3。
- 时长：`[2, 15]` 秒。
- 最多传入 3 段参考音频。
- 所有参考音频总时长不超过 15 秒。
- 大小：单个音频不超过 15 MB。
- 请求体大小不超过 64 MB；接近上限的输入改用 URL 或 `asset://` 提供。
- 不可单独输入音频，至少包含 1 个参考图片或参考视频。

## 查询任务响应

状态处理、轮询预算与查询命令见[视频取回](jobs.md#视频取回)。

重要响应字段：

- `id`：任务 ID。
- `model`：模型名称和版本。
- `status`：任务状态。
- `error`：任务成功时为 `null`，任务失败时返回错误对象。
- `content.video_url`：生成视频 URL，mp4 格式，有效期 24 小时。
- `content.last_frame_url`：尾帧图片 URL。创建任务时设置 `return_last_frame` 才会返回。
- `created_at`、`updated_at`：Unix 秒级时间戳。
- `seed`、`resolution`、`ratio`、`duration`、`framespersecond`、`generate_audio`、`priority`。
- `usage.completion_tokens`、`usage.total_tokens`：token 用量。

只能查询最近 7 天的任务记录。视频 URL 有效期为 24 小时，应及时下载或转存。

## 价格计算

脚本按导入时的静态价格表和成功响应的 token 用量估算；以下单价未重新核验，不是实时报价或账单。实际费用以官方账单为准。

价格公式：

```text
视频费用 = completion_tokens / 1,000,000 * 每百万 token 单价
```

准确 token 用量以查询接口返回的 `usage.completion_tokens` 为准。

`doubao-seedance-2.0` 在线推理价格：

- 输出 `480p` 或 `720p`，输入不含视频：`46` 元 / 百万 token。
- 输出 `480p` 或 `720p`，输入包含视频：`28` 元 / 百万 token。
- 输出 `1080p`，输入不含视频：`51` 元 / 百万 token。
- 输出 `1080p`，输入包含视频：`31` 元 / 百万 token。

`doubao-seedance-2.0-fast` 在线推理价格：

- 输入不含视频：`37` 元 / 百万 token。
- 输入包含视频：`22` 元 / 百万 token。
- 不支持输出 `1080p`。

查询成功后写出价格 JSON，路径规则见[输出与提交记录](jobs.md#输出与提交记录)。创建时输入包含参考视频的，查询时需传 `--input-has-video` 选择对应档位；该值不会从 task id 自动恢复。
