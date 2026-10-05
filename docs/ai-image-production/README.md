# AI 图片生产补充资料

从旧 `ai-image-production` 整理，**只收录相对游戏素材资料的差异**。这是参考文档，不是可安装 Skill；没有迁入脚本、示例图、个人偏好或运行配置，不提供原技能执行能力。

## 共用内容不再复制

| 已有内容 | 阅读位置 |
| --- | --- |
| 任务规格、成员关系、尺寸与静态处理通则 | [游戏素材：规格与静态素材](../game-asset-production/production.md) |
| 技术／视觉／使用验收，局部修改与交付 | [游戏素材：局部修改与交付](../game-asset-production/production.md#局部修改与交付) |
| 公共坐标、动画时序与帧表 | [游戏素材：动画](../game-asset-production/animation.md) |
| 旧 fal 入口适配与底层调用边界 | [游戏素材：生成依赖](../game-asset-production/migration-review.md#生成依赖尚未接通) |

这些是资料引用，不要求先运行游戏技能，也不继承其 Flare 默认模型、动画参数或引擎约定。

## 本目录保留的差异

| 文档 | 补充内容 |
| --- | --- |
| [任务分流](production.md) | 完整图片／指定元素重建、HubKKK 旧路由和偏好差异 |
| [Alpha 与语义拆分](alpha-and-grid.md) | 黑键、整图组件归属、Sharp 阈值处理差异 |
| [画风与质量修复](styles-and-quality.md) | 五类可选视觉方向，瑕疵与有意纹理的区分 |
| [工具差异](tools.md) | 旧 Sharp 工具与游戏工具的区别，测试和写入行为 |
| [迁移审查](migration-review.md) | 本技能特有的模型／评测冲突和像素契约问题 |
| [来源摘要](sources.json) | 25 个文本源文件摘要；6 张未迁入示例图的元数据 |

阅读口径见[资料说明](../README.md#阅读口径)。新整理文字适用仓库 [MIT](../../LICENSE)；源目录缺独立 README／LICENSE，示例图来源和许可未核实，不能据此重新许可。图片未读取或复制，真实偏好与 `.env` 未打开。本次未运行原测试、图片处理或模型请求。
