# 调用、取回与恢复

## 运行与认证

本文 `<脚本>` 指本 Skill 的 `scripts/ark-media.js` 绝对路径。真实任务在用户任务 cwd 执行，源码目录仅用于开发测试。

- 生成和视频查询只读环境变量 `ARK_API_KEY`；不自动加载 `.env`。从文件注入时由用户本地启动流程仅注入所需变量，真实凭据留在本地，不进入聊天、参数或日志。缺少 Node.js 22+ 时先处理环境，技能不安装依赖。
- API 固定为 `https://ark.cn-beijing.volces.com/api/v3`。媒体下载不附带 API Key，所有请求拒绝重定向。
- 本地图片／音频会编码发送给方舟；prompt、响应和临时 URL 可能包含私人素材，私有保存。视频输入方式见[视频参数](seedance-2.0.md#媒体限制)。
- `--dry-run` 不读取 Key、不联网、不写文件；会读取指定本地输入，输出省略 Base64。它只预检本地请求，不能证明远程素材可用或上游接受参数。

## 输出与提交记录

| 动作 | 默认输出（相对 cwd） |
| --- | --- |
| `image` | `output/seedream/<name>/<name>.json` 和图片；默认名称 `generate-image` |
| `video-create` | `output/seedance/<name>/create.json`；默认名称 `create-video` |
| `video-query` | `output/seedance/<name>/<name>.json`、`.mp4`／`.mov`、可选 `.last-frame.png` 和 `.price.json`；默认名称为 task id |
| `image-download` | 必填 `--out-dir` 指定新恢复目录；`image-1.jpeg`／`.png` 等，扩展名按字节签名识别；其他格式失败 |

生成／查询的 `--dir` 改输出根目录，`--json-out` 改响应路径。图片 `--out` 为首张图路径；视频 `--out movies/demo.mp4` 实际写入 `movies/demo/demo.mp4`，同目录保存其他产物。视频格式按响应字段／URL 后缀识别，缺少依据时默认 mp4，可用 `--output-format mov` 明确；与 `--out` 后缀冲突时拒绝下载，不隐式转码。视频 `--last-frame-out`、`--price-out` 分别指定尾帧和估价文件。2.0 估价含义见[价格计算](seedance-2.0.md#价格计算)；2.5 单价与估价为 null。

每个新生成任务使用唯一 `--name` 或 `--json-out`。付费 POST 前写 `<响应路径>.submission.json`；已有响应或标记时拒绝提交。标记含义：

| state | 含义与下一步 |
| --- | --- |
| `submitting` | 可能仍在执行或中途退出；先检查进程和控制台，不能推断服务端未受理 |
| `unknown` | 请求、响应解析或落盘异常；核查控制台，禁止自动重提 |
| `received` | 响应已保存；检查响应内容及产物，不等于生成质量合格 |

保留标记作为核查依据；确认重新生成时由用户授权新任务，而非删除标记绕过保护。

## 视频取回

```sh
node <脚本> video-query --id "cgt-example" --name "cat-walk" --dry-run
node <脚本> video-query --id "cgt-example" --name "cat-walk"
```

`video-query` 查询一次，保存响应；成功则自动下载视频和可用尾帧。重复查询会更新同名状态和产物文件；仅查进度也可能在已成功时下载，当前没有 status-only 参数。

| 状态 | Agent 下一步 |
| --- | --- |
| `queued` / `running` | 只查进度则报告后结束；要求成品时每隔 15–30 秒再查，累计等待约 10 分钟仍未完成则报告 ID、状态和响应路径，交用户决定是否继续 |
| `succeeded` 且 error 为空 | 检查 `content.video_url` 与本地文件；按产物清单核对尾帧需求，再验收 |
| `failed` / `cancelled` / `expired` | 终态，停止轮询并报告 error；重新生成另获授权 |
| 未知状态或非空 error | 停止并保留响应，核查异常；不按成功交付 |

用户停止时结束本地轮询；这不取消云任务，本脚本未接入取消操作。以上间隔和预算是 Agent 调度规则，不是脚本内自动循环。

## 图片恢复

图片响应是同步 `data[]`，不使用视频的 status 判据。生成后下载失败时，复用用户指定的已保存响应：

```sh
node <脚本> image-download --result "output/seedream/cat/cat.json" --out-dir "output/cat-recovery-01" --dry-run
node <脚本> image-download --result "output/seedream/cat/cat.json" --out-dir "output/cat-recovery-01"
```

该命令无需 Key，仅下载 `data[].url` 或解码 `data[].b64_json`，无生成请求。预检检查响应结构和恢复目录，输出条目数与目标目录，不输出临时 URL／Base64；不会验证远程内容。

恢复目录须尚不存在，脚本独占创建；原响应和已下载文件不变。每项独立处理，标准输出 JSON 按原索引列出保存路径或错误，部分失败仍继续其余项，退出码非零。再次恢复使用新目录，会重新下载全部条目，不是断点续传。URL 过期或结果缺项时补下载无法修复，应报告缺失；重新生成由用户决定。

## 验收与交付

新任务沿用产物清单；已有任务从用户需求和指定记录恢复预期，缺少原参数时标明无法核对的项。

1. **核对文件。** 图片逐项对照响应 `data[]`；视频核对视频及用户要求的尾帧。字节数大于 0 只是落盘检查；使用宿主媒体工具解码、查看成品。图片检查内容、实际尺寸及所需 Alpha；视频检查时长、分辨率、动作、音频等用户要求。**完成：每个预期产物均有核对结果，无法读取或检查的项标为未验证。**
2. **交付清单。** 报告实际模型（未知则说明）、响应 JSON 路径、视频 task id，以及全部成功文件、失败和待处理项；把已验证与未验证要求分开。**完成：产物清单逐项有去向；用户要求的数量即使只是 API 最大值，也须明确实际数量差异。**

## 失败分流

| 故障 | 下一步 |
| --- | --- |
| 提交超时／无视频 ID | 保留响应与提交标记，核查控制台；状态不明时不重提 |
| 图片下载失败 | 使用上方 `image-download`；仅已有条目可恢复 |
| 视频下载失败 | 复用 task id 执行 `video-query`；既有文件会更新 |
| 查询网络失败 | 可间隔重查；连续失败 3 次或达到等待预算则报告并交用户决定 |
| 空媒体／非法图片签名 | 报告下载或结果异常；非空也不能代替质量验收 |
| 残留 `.part` | 先确认没有进程使用，再由用户清理并重试下载 |

脚本不自动重试。下载重试不代表重新生成；更换模型、增加生成次数或重新创建任务均属于新的付费操作。
