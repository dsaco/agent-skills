# 调用、任务与恢复

## 运行与素材

本文及其他参数文档中的 `<脚本>` 指本技能 `scripts/fal.mjs` 的绝对路径。

- **认证**：脚本只读环境变量 `FAL_KEY`，不自动加载 dotenv。需要从文件注入时优先项目根 `.env`，否则询问本地配置路径；在宿主允许的本地启动环境中只注入所需的 FAL_KEY，密钥不进入命令参数、prompt、URL、聊天或日志。缺少 Node 或版本不足时交用户处理环境，技能不安装运行时或依赖。
- **素材**：`--image` 接受本地普通 PNG／JPEG／WebP 文件或 HTTPS 图片直链；本地文件非空、签名与扩展名一致、每张 ≤20 MiB，Ideogram 的例外见[去背景](background.md)。这是技能限制，不是通用上游承诺；符号链接及 data URI 不接受。远程 URL 只检查语法，不验证内容、大小、可达性、尺寸匹配或所有权。
- **外发**：本地图片会上传，prompt 和素材会发送给 fal；默认 CDN 链接可访问，任务记录含私人输入及媒体 URL，应私有保管。需要私有媒体或特殊 ACL 时先说明当前脚本不支持。普通下载与预签名上传不携带 FAL_KEY，全部请求拒绝重定向；受限 CDN 访问失败时报告限制，不改 ACL 或把 Key 填入 URL。

所有任务使用非流式队列，保留可取回记录；sync_mode／partial_images 未开放。

## 目录与文件

默认 `<cwd>/output/<任务>-<随机标识>/`；`--out-dir` 可指定一个尚不存在的任务目录，父目录可已存在。JSON 原子写入，媒体完整写入临时文件后以硬链接发布。同名同字节文件复用，不同内容拒绝覆盖；不支持硬链接的文件系统如实失败。

| 文件 | 含义 |
| --- | --- |
| request.json | version=1；端点、输入、提交阶段、请求 ID、服务返回的操作 URL |
| status.json | 最近一次原始状态 |
| result.json | 原始模型结果，无 SDK data 包装 |
| downloads.json | 已保存路径、逐项失败及 `recoverable` 标记 |
| cancel.json | 原始取消响应 |

只下载下表指定字段，扩展名由实际文件签名决定；验收时按任务读取对应模型文档：

| 任务／模型文档 | 结果字段 → 文件 |
| --- | --- |
| [文生图／编辑](images.md) | `images[]` → `image-1`、`image-2` 等 |
| [去背景](background.md) | `image` → `image`；BiRefNet 返回 `mask_image` 时另存 `mask` |
| [深度／姿态提取](structure.md) | `image` → `image` |

缺少目标主图、请求的遮罩或显式数量不符是上游结果缺失，按下方[失败处理](#失败处理)报告。产物含义以任务及模型参数为准。

## 选择操作

```sh
node <脚本> status --request "output/<任务>/request.json"
node <脚本> result --request "output/<任务>/request.json"
node <脚本> download --request "output/<任务>/request.json"
node <脚本> cancel --request "output/<任务>/request.json"
```

| 用户目标 | 操作与完成条件 |
| --- | --- |
| 只查进度 | `status` 查询一次并保存状态；报告 IN_QUEUE／IN_PROGRESS／COMPLETED 及错误。COMPLETED 也可能失败。 |
| 取回成品 | `result` 先查状态；未完成立即返回，完成且无错时保存原始结果并逐一下载，再走下方验收。 |
| 补下载 | `download` 读取已有 result.json；不查询、上传或提交。它会重新传输字节，不是断点续传；按下载记录交付成功项和剩余失败。 |
| 用户明确要求取消云任务 | `cancel`；202 仅表示接受请求，处理中任务可能仍完成并收费；400／404 等如实报告失败。保存并报告取消响应后结束。 |

停止本地命令不等于取消云任务。每次网络操作独立有界，脚本不自动重试。

## 取回与交付

已有任务从 request.json 恢复预期产物；新任务沿用 SKILL.md 的产物清单。

1. **取回**：`result` 未完成时每隔 15–30 秒再查，直到完成、云端失败或用户停止；超过约 10 分钟仍未完成，报告当前状态及记录路径，由用户决定继续或取消。错误按下方分流。**完成：每项产物已落盘，或明确记录失败／待处理状态。**
2. **验收**：对照 request、result 和 downloads 逐项核对；用宿主图片工具查看每张下载原图，结合模型文档检查内容。用户要求的尺寸或 Alpha 以实际解码为准，脚本只验非空与文件签名。读取失败时保留原图并标明未验证；需转换则在现有权限内另存副本。**完成：每项要求都有检查结论或未验证说明；API 参数和 JSON 元数据不替代成品检查。**
3. **交付**：给出实际端点、request.json 路径、全部成功文件及失败／待处理项。**完成：产物清单逐项有去向，不以第一张成功代表全部成功。**

## 失败处理

优先复用句柄；更换模型、增加次数或重新生成是新请求，需用户明确同意，避免重复计费。

| 记录／故障 | 下一步 |
| --- | --- |
| `preparing` | 尚未提交生成，先检查输入／上传失败；已上传素材由用户另行管理，脚本不清理云端。 |
| `submitting` 且无 ID | 服务可能已接收；先核查 fal 控制台，禁止盲目重提。脚本不能搜索任意历史或自动匹配任务。 |
| 有 requestId，操作 URL 缺失／非法 | 保留 ID，请用户核查控制台；使用服务返回的合法 URL，不猜子端点或向非官方地址发送 Key。 |
| 云端失败 | 保留记录，说明错误及可选处理方式。 |
| 下载失败且 `recoverable=true` | 网络／本地保存问题；保留成功文件，执行 `download` 补取。 |
| `recoverable=false` 或原始结果缺少目标输出 | 报告缺失项；补下载无法补齐，由用户决定是否重新生成。 |

官方依据：[Queue](https://fal.ai/docs/documentation/model-apis/inference/queue) · [CDN](https://fal.ai/docs/documentation/model-apis/fal-cdn) · [文件访问控制](https://fal.ai/docs/documentation/model-apis/file-access-controls)。
