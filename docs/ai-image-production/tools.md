# Sharp 工具差异与来源清单

通用裁切、预览和交付流程已有[游戏工具资料](../game-asset-production/tools.md)。本页只登记旧 Sharp 文件及不能与其混用的行为，未迁入脚本。

## CLI 与公共模块

| 源 `scripts/` 文件 | 相对已有资料需要保留的区别 |
| --- | --- |
| `inspect-image.mjs` | 独立 JSON 检查入口；可选写报告，字段含义见 [Alpha 差异](alpha-and-grid.md#阈值和-alpha-字段) |
| `trim-transparent.mjs` | 可仅转格式；padding 扩展源图内裁框，不保证足额新增透明外边距 |
| `split-grid-assets.mjs` | 整图组件归属与 Mask，不是规则格位硬切；允许部分跨格但清除低 Alpha |
| `black-key-to-alpha.mjs` | 黑底亮度转 Alpha 和 RGB 重算，与绿幕／语义去背景不同 |
| `create-alpha-check-preview.mjs` | 合成黑白灰接触表；用途标记只是报告字段，后续 CLI 不统一校验 |
| `image-utils.mjs` | 公共模块，提供路径字符串判重、检查、编码与报告；不是单独命令 |

## 依赖与像素选项

源 `package.json` 声明 ESM、Node.js >=20、Sharp `^0.34.5`。本工具组不调用模型，但依赖 Sharp 原生库；本次未安装、读取本地锁文件或复制依赖。

编码支持 PNG／WebP／JPEG，后两者默认 quality 95，JPEG 需明确底色。不同于游戏帧打包器的 exact WebP 路线，这里没有默认 lossless／exact；裁切与拆分固定 Lanczos3，也没有像素风近邻选项。

## 测试定义

| 源文件 | 覆盖方向 |
| --- | --- |
| `scripts/test-black-key-to-alpha.mjs` | 告知参数、黑键结果、边框与外沿、路径冲突 |
| `scripts/test-create-alpha-check-preview.mjs` | 三底色接触表、用途字段与输入检查 |
| `scripts/test-split-grid-assets.mjs` | 跨格、组件 Mask、多组件同格、数量／格式及失败门禁 |
| `evals/evals.json` | 14 个任务案例；预期冲突见[评测审查](migration-review.md#评测定义与正文冲突) |

本次未运行这些测试。当前 test 入口未列独立 inspect／trim 测试；三个启动脚本使用 URL `.pathname`，中文、空格和 Windows 路径转换需补测。

## 与游戏工具不同的写入保护

游戏静态脚本要求新输出目录；这组 Sharp 工具没有统一拒绝已有输出：图片暂存后 rename，报告直接 writeFile。路径判重只比较字符串，未覆盖链接和大小写等价身份。

拆分与预览逐个提交文件，失败时可能已留下部分输出，不具备全组回滚。报告包含本地绝对路径，不能当公开资料直接迁入。后续要补的是本工具组自己的覆盖、路径和失败恢复测试，不能把游戏脚本已有保护视作这里也已实现。
