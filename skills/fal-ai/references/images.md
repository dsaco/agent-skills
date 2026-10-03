# 图片生成与编辑

## 模型与端点

自然语言选型：完全未指定模型时用 Nano Banana 2；只说“2.5”、“gpt 2.5”或“GPT Image 2.5”时用 Flare；明确指定 Sunburst 时用 Sunburst。根据任务从下表选生成或编辑端点，通过 `--model` 传完整值。

| 模型 | text-to-image 端点 | image-to-image 端点 |
| --- | --- | --- |
| Nano Banana 初代 | `fal-ai/nano-banana` | `fal-ai/nano-banana/edit` |
| Nano Banana 2（默认） | `fal-ai/nano-banana-2` | `fal-ai/nano-banana-2/edit` |
| Nano Banana Pro | `fal-ai/nano-banana-pro` | `fal-ai/nano-banana-pro/edit` |
| GPT Image 2 | `openai/gpt-image-2` | `openai/gpt-image-2/edit` |
| GPT Image 2.5 Flare | `openai/gpt-image-2.5/flare/text-to-image` | `openai/gpt-image-2.5/flare/edit` |
| GPT Image 2.5 Sunburst | `openai/gpt-image-2.5/sunburst/text-to-image` | `openai/gpt-image-2.5/sunburst/edit` |

## 通用参数

| CLI | API 字段 | 规则 |
| --- | --- | --- |
| `--prompt` | `prompt` | 必填非空文本 |
| 重复 `--image` | `image_urls` | 仅编辑，1–16 张，保留顺序 |
| `--num-images` | `num_images` | 正整数，API 默认 1 |
| `--output-format` | `output_format` | png、jpeg、webp，API 默认 png |

GPT 官方页面明确最多 16 张参考图；Nano 的 16 张是技能边界，不宣称上游上限。素材、认证、目录与下载规则见[任务与恢复](jobs.md)。下列 API 默认值仅供选型参考。

## Nano 系列

| CLI → API | 初代 | Nano Banana 2 | Pro |
| --- | --- | --- | --- |
| `--seed` → seed | 整数 | 整数 | 整数 |
| `--aspect-ratio` → aspect_ratio | 标准比例；编辑另有 auto | auto、标准及极端比例 | auto、标准比例 |
| `--resolution` → resolution | 不支持 | 0.5K、1K、2K、4K | 1K、2K、4K |
| `--thinking-level` → thinking_level | 不支持 | minimal、high | 不支持 |
| `--system-prompt` → system_prompt | 不支持 | 非空文本 | 非空文本 |
| `--limit-generations` → limit_generations | true／false | true／false | true／false |
| `--enable-web-search` → enable_web_search | 不支持 | true／false | true／false |

标准比例：21:9、16:9、3:2、4:3、5:4、1:1、4:5、3:4、2:3、9:16。极端比例：4:1、1:4、8:1、1:8，仅 Nano Banana 2 支持。

API 默认：初代及 Pro 文生图比例 1:1，编辑 auto；Nano Banana 2 两类均 auto。分辨率支持的端点默认 1K，limit_generations 默认 true；thinking_level 省略则不启用，seed 及 web search 不擅自设置。system_prompt 官方默认空字符串，脚本只接受明确非空值。

Nano 使用本表参数，与下方 GPT 参数互斥。保持服务安全默认，safety_tolerance 未开放。Nano Banana 2 编辑仅接图片，音视频／PDF 上下文未开放；这是技能范围，不宣称 API 所有模式均必填参考图。

## GPT Image 2／2.5

| CLI → API | GPT Image 2 | GPT Image 2.5 Flare／Sunburst |
| --- | --- | --- |
| `--image-size` → image_size | 预设或 WIDTHxHEIGHT | 同左 |
| `--background` → background | auto、transparent、opaque | 同左 |
| `--quality` → quality | auto、low、medium、high | 同左，另支持 xhigh、max |
| `--output-compression` → output_compression | 不支持 | 0–100 整数，必须显式指定 output-format jpeg／webp |
| `--mask-url` → mask_url | 仅编辑，HTTPS 遮罩 URL | 同左 |

尺寸预设：square_hd、square、portrait_4_3、portrait_16_9、landscape_4_3、landscape_16_9、auto。自定义输入 `WIDTHxHEIGHT` 转成 `{width,height}`：宽高为正且均为 16 的倍数、最长边 ≤3840、比例 ≤3:1、总像素 655360–8294400。官方文生图页明确这些限制；编辑页未重复完整限制，本技能采取相同保守校验。

API 默认：文生图 image_size 为 landscape_4_3，编辑 auto；background 为 auto，quality 为 high；compression 未声明默认。

transparent 搭配 PNG／WebP，JPEG 会被本地拒绝；透明效果按主流程解码验收。`--mask-url` 独立于参考图，只接受 HTTPS 遮罩地址，本地遮罩上传未开放；遮罩内容及尺寸匹配需另核查。质量、分辨率和数量会影响费用与耗时。

## 示例

```sh
node <脚本> text-to-image --prompt "雨天街道上的陶瓷机器人" --dry-run
node <脚本> text-to-image --model openai/gpt-image-2.5/flare/text-to-image --prompt "陶瓷茶壶" --image-size 1024x1536 --quality high --background transparent --output-format png --dry-run
node <脚本> image-to-image --model openai/gpt-image-2.5/sunburst/edit --image "reference.png" --prompt "保留主体，调整构图" --mask-url "https://example.com/mask.png" --dry-run
node <脚本> image-to-image --model fal-ai/nano-banana-pro/edit --image "reference.png" --prompt "改成水彩风格" --resolution 2K --dry-run
```

## 来源

参数与默认值来自各端点的 fal 官方 Input／Output schema：`https://fal.ai/models/<端点>/api`。这是文档依据，不是付费实测；动态价格按[模型咨询](consultation.md)核实。
