# Seedream 图片生成 API 参考

> 本文为导入版本的参考快照，本轮未重新核验模型、价格或媒体限制；实际能力以当前官方文档和账户权限为准。命令中的 `<技能目录>` 需解析为本 Skill 的绝对路径，输入输出相对用户 cwd。

来源：火山方舟官方文档 [图片生成 API](https://www.volcengine.com/docs/82379/1541523?lang=zh)，以及火山方舟官方 Ark CLI 的图片生成参考。

运行、输出及图片补下载见[任务规则](jobs.md)；新生成前和恢复时必读。

## 接口

- 请求：`POST https://ark.cn-beijing.volces.com/api/v3/images/generations`
- 鉴权：`Authorization: Bearer $ARK_API_KEY`
- 请求类型：`application/json`
- 图片生成是同步响应，不创建需要轮询的任务。

## 模型

来源还包括用户提供的火山方舟控制台模型详情页：

- [Seedream 4.0](https://console.volcengine.com/ark/region:cn-beijing/model/detail?name=doubao-seedream-4-0)
- [Seedream 4.5](https://console.volcengine.com/ark/region:cn-beijing/model/detail?name=doubao-seedream-4-5)
- [Seedream 5.0](https://console.volcengine.com/ark/region:cn-beijing/model/detail?name=doubao-seedream-5-0)

| 模型 | 完整模型 ID | 参考图 | 组图 |
| --- | --- | ---: | --- |
| Seedream 4.0 首推版 | `doubao-seedream-4-0-250828` | 最多 14 张 | 支持 |
| Seedream 4.0 更新版 | `doubao-seedream-4-0-20260415` | 最多 14 张 | 支持 |
| Seedream 4.5 | `doubao-seedream-4-5-251128` | 最多 14 张 | 支持 |
| Seedream 5.0 lite | `doubao-seedream-5-0-260128` | 最多 14 张 | 支持 |
| Seedream 5.0 pro | `doubao-seedream-5-0-pro-260628` | 最多 10 张 | 不支持 |

说明：

- 默认模型是 `doubao-seedream-5-0-260128`。
- 4.0、4.5、5.0 lite 都支持文本、单图和多图输入，也支持组图。
- 5.0 pro 支持文生图、单图/多图生图、图层拆分和交互编辑，但当前不支持组图、联网搜索和流式输出；调用时不要传 `--image-count` 或 `--sequential`。
- 脚本接受完整 ID，也接受 `seedream-4.0`、`seedream-4.5`、`seedream-5.0-lite`、`seedream-5.0-pro` 等别名。
- 自定义模型或 Endpoint ID 不在本地模型表中，脚本原样传入，并由服务端判定能力。

## Prompt 长度与注意力建议

仅在用户要求优化图片 prompt 时应用；否则保留原文。

以下是生成质量建议，不是接口请求体的服务端硬性校验上限：

- 中文提示词建议不超过 **300 个汉字**。
- 英文提示词建议不超过 **600 个英文单词**。
- 不要为了接近上限而扩写。提示词过长或重复会分散模型注意力，使模型只执行高权重重点、忽略次要细节，可能造成主体、局部元素、空间关系、材质或文字缺失。
- 优先保留当前图片真正需要控制的内容：核心主体、关键空间关系、一个明确构图、主要视觉风格、必要材质与少量关键禁忌。
- 每项重要指令只写一次；删除同义重复、候选方案、设计理论、过程解释和冗长负面词列表。
- 复杂需求应先明确优先级。若多个元素都不可缺失，考虑拆分验证或减少单次变量，而不是继续堆长 prompt。

## 请求体

常用字段：

```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "简约商务笔记本电脑，深蓝色，白色背景",
  "size": "2K",
  "response_format": "url",
  "watermark": false
}
```

可选字段：

- `size`：图片尺寸，可使用模型支持的分辨率档位或像素尺寸，例如 `2K`、`2048x2048`。不同模型支持范围不同，应以当前模型文档为准。
- `image`：参考图输入。可传单个字符串或字符串数组，支持公网 HTTP(S) URL 和 Base64 data URI。脚本的 `--image` 可重复使用。
- `sequential_image_generation`：连续图片模式，常用值为 `auto` 或 `disabled`。
- `sequential_image_generation_options.max_images`：连续图片模式的最多输出张数，范围 `[1, 15]`。参考图数量与最终生成图数量之和不能超过 15；脚本使用 `--image-count` 映射此字段。
- `watermark`：是否添加水印，服务端默认值为 `true`。脚本默认显式传 `false`，只有用户明确要求水印时才传 `true`。
- `response_format`：`url` 或 `b64_json`。默认使用 `url`，脚本会自动下载 URL；使用 `b64_json` 时脚本直接解码落盘。
- `optimize_prompt_options.mode`：服务端 prompt 优化模式，`standard` 质量优先，`fast` 速度优先。不要默认开启，避免改变用户原始意图；5.0 lite 当前不支持 `fast`。
- `output_format`：图片格式，通常为 `jpeg` 或 `png`。

参考图示例：

```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "保留人物姿态和服装，把背景改成黄昏海滩",
  "image": "https://example.com/reference.jpg",
  "size": "2K"
}
```

多张参考图：

```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "参考第一张图的角色，参考第二张图的室内风格，生成一张完整海报",
  "image": [
    "https://example.com/character.jpg",
    "https://example.com/style.jpg"
  ],
  "size": "2K"
}
```

## 脚本参数

```text
--prompt <text>                  必填，图片生成提示词
--prompt-file <path>             从 UTF-8 文件读取 prompt
--model <id>                     模型或 Endpoint ID，默认 doubao-seedream-5-0-260128
--image <path-or-url>             参考图，可重复
--image-count <1-15>             最多输出图片数量；大于 1 自动启用连续图片模式
--size <value>                   输出尺寸，例如 2K 或 2048x2048
--response-format <url|b64_json> 响应格式，默认 url
--output-format <jpeg|png>       输出格式
--watermark                      添加水印
--optimize-prompt                启用服务端标准 prompt 优化
--prompt-mode <value>            standard、fast
--sequential <auto|disabled>     连续图片模式
--name <name>                    输出 bundle 名称
--dir <path>                     输出根目录，默认 output/seedream
--out <path>                     覆盖单张/首张图片路径
--json-out <path>                覆盖响应 JSON 路径
--dry-run                        只打印请求，不调用 API
--list-models                    列出支持的模型、别名和能力
```

## 响应

URL 响应通常类似：

```json
{
  "model": "doubao-seedream-5-0-260128",
  "created": 1700000000,
  "data": [
    { "url": "https://..." }
  ]
}
```

当 `response_format` 为 `b64_json` 时，数据项可能包含：

```json
{ "b64_json": "..." }
```

- `data` 是生成图片数组，数量可能由 `sequential_image_generation_options.max_images` 或模型能力决定。
- `url` 是临时预签名 URL，官方资料说明通常约 24 小时失效；需要长期保留时及时下载或转存。
- 不同模型和版本可能返回额外字段，例如 `revised_prompt`、`usage` 或 `size`；脚本原样保存完整 JSON。

## 媒体限制和注意事项

- 本地参考图由脚本读取并编码为 data URI；大文件会增大请求体，不适合超大图片。
- 远程参考图必须是服务端可访问的 URL；不要把本地路径直接放入请求体。
- Seedream 5.0 lite、4.5 和 4.0 支持组图；5.0 pro 不支持 `sequential_image_generation`。
- 图片数量、尺寸、可用参数和单次请求大小由具体模型版本裁决；遇到参数错误，先查看对应模型的官方 `supported_params`，不要盲目重试。
- 参考图过多可能造成主体、构图或风格权重冲突。除非任务需要，优先使用少量高质量参考图。
- 不要在 prompt 中要求规避平台安全审核，也不要使用脚本绕过内容安全策略。
