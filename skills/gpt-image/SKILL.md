---
name: gpt-image
description: 使用 GPT Image（Sunburst、Flare）文生图，或按一张、多张参考图重绘与编辑。
---

# GPT Image

从任务工作目录用 Python 3.8+ 运行 [generate.py](scripts/generate.py)。下例中的 `<skill-dir>` 指本文件所在目录。

`--prompt` 只写希望看到的画面。编辑时写清参考图里要保留什么、改变什么。参考文件用 `--image` 传入，多图可重复传参。用户指定模型或尺寸时用 `--model`、`--size` 传递。默认模型为 `gpt-image-2.6-sunburst`。

```sh
python3 "<skill-dir>/scripts/generate.py" --prompt "橘猫趴在窗台上，午后的光落在前爪上" --out-dir outputs
python3 "<skill-dir>/scripts/generate.py" --image "素材/人物.png" --prompt "保留人物的猫耳、紫瞳和尾巴，改绘成彩绘玻璃，背景透明" --background transparent --format png --out-dir outputs
```

涉及 GIF、精确尺寸、多张输出、编码格式、质量档位或局部编辑时，先查 [Sunburst 参数实测表](references/sunburst-parameters.md)。按脚本输出的路径预览成图，核对用户要求的尺寸、格式和张数。透明图还要确认背景像素的 alpha 为零。

缺少连接配置时，检查运行环境中的 `SUB2API_BASE_URL` 和 `SUB2API_API_KEY`。请求超时后先核对调用记录，再决定是否重试。
