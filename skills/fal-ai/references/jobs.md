# 任务、恢复与交付

## 认证与文件

脚本只读环境变量 `FAL_KEY`，不自动加载 dotenv。由宿主本地启动环境注入所需 Key；需要从本地配置读取时只注入该变量，凭据不进入命令参数、聊天或日志。生成使用该 Key 对应账户，不读取 MCP 授权。公开模型发现与 schema 无需 Key。

每次生成创建全新目录；默认 `<cwd>/output/fal-<随机标识>/`，或 `--out-dir` 指定尚不存在的目录。提交前 CLI 报出目录，失败时也能定位记录。记录含私人输入与媒体 URL，私有保管。

| 文件 | 内容 |
| --- | --- |
| schema.json | 此次生成所用 schema 快照 |
| request.json | version=2；端点、输入、阶段、上传回执、请求 ID 与服务返回的操作 URL |
| status.json | 最近一次原始队列状态 |
| result.json | 原始完整模型结果，包括非媒体字段 |
| downloads.json | 已保存文件、来源 Pointer、大小、SHA-256 与逐项失败 |
| cancel.json | 原始取消响应 |

仅使用当前通用版本记录，不兼容旧固定模型版 request.json。已有不同内容的媒体文件不覆盖；同字节文件复用。写入使用临时文件与原子发布，需要文件系统支持硬链接。JSON 与单次 API 响应上限 16 MiB，媒体限制见[生成](generation.md)。

## 任务操作

```sh
node <脚本> status --request "output/job-01/request.json"
node <脚本> wait --request "output/job-01/request.json" --timeout 40 --interval 5
node <脚本> result --request "output/job-01/request.json"
node <脚本> download --request "output/job-01/request.json"
node <脚本> cancel --request "output/job-01/request.json"
```

- `status`：只读一次队列状态；COMPLETED 不保证成功。
- `wait`：轮询既有请求，完成后取回结果并下载；轮询预算最多 40 秒，网络请求本身另有 120 秒超时。返回 pending 后继续对同一记录调用，直到完成、失败或用户停止；耗时明显超过预期时报告当前状态，继续跟进，不重提。
- `result`：查询一次；未完成返回 pending，完成且无错则保存结果并下载。
- `download`：只用已有 result.json 补取文件，可用 `--output` 指定结果中的文件路径；不查询队列、不上传、不提交。
- `cancel`：用户明确要求时发送取消；接受请求不保证停止或不计费。停止本地等待不等于取消云端任务。

## 异常处理

| 状态 | 处理 |
| --- | --- |
| preparing | 尚未提交生成；核对输入或上传回执。上传状态不明时核对已记录 fileUrl，避免重复上传。 |
| submitting 且无 ID | 可能已收到并计费；保留记录，核查 fal 控制台。禁止盲目重提。 |
| 有 ID，但操作 URL 缺失或无效 | 保留 ID，核查控制台；不猜子端点 URL。 |
| 云端失败或 HTTP 错误 | 保留原记录，报告已知状态；默认不自动重试。HTTP 错误正文不打印，避免泄露输入与凭据。 |
| failures 中 recoverable=true | 下载／文件保存失败；保留成功项，用 download 补取。 |
| recoverable=false | schema 输出不符、选定输出缺失；补下载不能创造缺少内容。 |

重新生成、增加数量或更换模型属于新付费请求，按用户授权范围执行。所有外部请求拒绝重定向；预签名上传和媒体下载不携带 Key，API Key 仅发往官方 API 地址。凭据失败不会切换账号或从其他位置寻找替代凭据。

## 验收与交付

对照用户要求、request.json 与 downloads.json，逐项检查数量和内容。图片查看原图并解码尺寸／Alpha；动图核对帧数、时序与循环；视频／音频核对时长、编码、画面／听感；3D 及其他格式用可用工具打开。无法验证的项目明确标注。脚本只证明文件已保存及传输哈希，API 元数据不是最终质量证据。

交付实际端点、请求记录和全部成功文件，以及失败／待处理项。`partial` 表示有失败，CLI 非零退出但成功项保留；`json_only` 只证明结构结果保存。不得以首个成功文件代表整项任务完成。
