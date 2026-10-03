# 深度图与人体姿态图

目标是提取结构图；深度与姿态是独立任务，按用户所需选择。两项均恰好接收一张 `--image`，无需 prompt。素材、认证、输出及恢复规则见[任务与恢复](jobs.md)。

| CLI 任务 | 默认且唯一支持的端点 | 参数 |
| --- | --- | --- |
| `image-to-depth` | `fal-ai/image-preprocessors/depth-anything/v2` | `--image` → `image_url` |
| `image-to-pose` | `fal-ai/dwpose` | `--image` → `image_url`，可选 `--draw-mode` → `draw_mode` |

可省略 `--model`，指定时传表中完整端点。只接受表中参数及公共 CLI 选项，尺寸、数量和输出格式由服务端决定。

## 深度图：Depth Anything V2

```sh
node <脚本> image-to-depth --image "scene.png" --dry-run
```

交付深度估计图片，不是米制距离、原始浮点深度或相机参数。官方接口未承诺原图尺寸、位深或近远亮暗约定；这些性质需检查成品。

验收时查看是否有与输入场景对应的深度结构；视觉检查不能证明几何精度或真实距离。

官方契约：https://fal.ai/models/fal-ai/image-preprocessors/depth-anything/v2/api

## 人体姿态图：DWPose

```sh
node <脚本> image-to-pose --image "person.png" --dry-run
node <脚本> image-to-pose --image "person.png" --draw-mode full-pose --dry-run
```

`--draw-mode` 省略时由 API 使用 `body-pose`；按明确要求选择其他模式：

| 模式 | 产物 |
| --- | --- |
| `body-pose` | 身体姿态图（默认） |
| `full-pose` | 身体、脸部与手部姿态图 |
| `face-pose` | 脸部关键点图 |
| `hand-pose` | 手部关键点图 |
| `face-hand-mask` | 脸部与手部遮罩 |
| `face-mask` | 脸部遮罩 |
| `hand-mask` | 手部遮罩 |

输出是渲染图片，不含关节点坐标 JSON、置信度或 3D 骨架；动物骨骼、动画绑骨与动作捕捉不在此接口范围。三个 `*-mask` 是区域遮罩，与骨骼连线及透明前景区分。

验收模式、可见人体及明显遗漏，遮罩核对目标区域；遮挡、小人物、非写实角色和手部细节尤其需检查。空白图或缺失姿态应报告，文件保存成功不代表识别完整。

官方契约：https://fal.ai/models/fal-ai/dwpose/api

## 后续生成

当前技能止于结构图提取。若用户要用它约束新图生成，说明 ControlNet 生图尚未接入，确认后续方案；GPT／Nano 的普通参考图编辑不等同于 ControlNet 约束。
