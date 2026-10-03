# 去背景

任务 `remove-background` 恰好接收一张 `--image`（API `image_url`），无需 prompt。素材、认证与输出规则见[任务与恢复](jobs.md)；选择额外遮罩或 mask-only 时，把产物含义列入清单。

## BiRefNet v2（默认）

端点 `fal-ai/birefnet/v2`，分离前景或提取遮罩。

```sh
node <脚本> remove-background --image "input.png" --dry-run
```

| CLI | API 字段 | 可用值 |
| --- | --- | --- |
| `--birefnet-model` | `model` | General Use (Light)、General Use (Light 2K)、General Use (Heavy)、Matting、Portrait、General Use (Dynamic) |
| `--operating-resolution` | `operating_resolution` | 1024x1024、2048x2048、2304x2304 |
| `--output-mask` | `output_mask` | true／false |
| `--refine-foreground` | `refine_foreground` | true／false |
| `--mask-only` | `mask_only` | true／false |
| `--output-format` | `output_format` | png／webp／gif |

- 2304x2304 要求显式选择 General Use (Dynamic)；处理分辨率不等于成品尺寸。
- `mask-only=true` 的主图是分割遮罩；`output-mask=true` 请求前景外的额外遮罩。两者择一，脚本拒绝组合。
- 验收透明前景时检查 Alpha 和边缘；遮罩按分割范围验收。

官方契约：https://fal.ai/models/fal-ai/birefnet/v2/api

## Ideogram

端点 `fal-ai/ideogram/remove-background`，输入只有图片，输出透明前景；额外遮罩使用上面的 BiRefNet。

```sh
node <脚本> remove-background --model fal-ai/ideogram/remove-background --image "input.png" --dry-run
```

官方支持 JPEG／PNG／WebP、最大 10 MB；本技能按 **10,000,000 字节**在预检及上传前校验本地文件。远程文件由上游校验。成品检查 Alpha 与边缘质量。

官方契约：https://fal.ai/models/fal-ai/ideogram/remove-background/api
