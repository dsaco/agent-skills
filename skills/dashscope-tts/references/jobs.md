# 运行、恢复与验收

本文 `<脚本>` 指本技能 `scripts/tts.mjs` 的绝对路径。输入与输出相对用户 cwd，真实合成在用户任务目录执行。

## 凭据与请求边界

- 合成只读取环境变量 `DASHSCOPE_API_KEY`，不自动加载 `.env`。若 Key 在本地文件中，由用户本地启动流程仅注入所需变量；不向对话发送、读取或打印真实 Key。
- 脚本固定使用北京 `dashscope.aliyuncs.com`，可用 `--workspace <WorkspaceId>` 选择北京专属域名；不提供任意 API URL，拒绝请求重定向。
- 合成文本与音色参数会发往百炼，须在用户授权范围内。任务记录和媒体 URL 含私人内容，保存在用户工作目录，不入库。
- `--dry-run` 不读取 Key、不联网、不创建目录；读取请求文件并打印请求体，因此预览文本同样应私有保管。模型／音色权限、远程参数和质量不在预检验证范围内。

## 单次合成

```sh
node <脚本> synthesize --request "input/tts.json" --out-dir "output/tts-01" --dry-run
node <脚本> synthesize --request "input/tts.json" --out-dir "output/tts-01"
```

A 线专属域名可加 `--workspace <WorkspaceId>`。模型和音色不自动选择，按对应接口文档写入请求 JSON。

`--out-dir` 必须不存在。脚本独占创建目录，POST 前原子保存 `request.json` 的 `submitting` 状态；已有目录会被拒绝，防止直接重跑导致重复计费。保存响应后更新为 `received`，记录 HTTP 状态和 request ID；这表示收到响应，不等于成功。

| 文件 | 含义 |
| --- | --- |
| request.json | 接口、路由、格式、请求正文、提交阶段，凭据不入盘 |
| result.json | 原始响应 JSON（已知 Key 脱敏），先保存再下载 |
| audio.mp3 / .wav / .opus / .pcm | 对应格式的音频 |
| downloads.json | 文件路径、字节数、格式及尚未解码标记 |

每次网络请求有 120 秒超时，JSON 上限 16 MiB、下载音频上限 128 MiB；这是本地保护而非上游限制。脚本不自动重试，不自动分段、不安装或执行转码工具。媒体先写 `.part`，用硬链接发布以拒绝覆盖；不支持硬链接的文件系统会报错。

## 补下载

```sh
node <脚本> download --result "output/tts-01/result.json" --format wav --out-dir "output/tts-recovery-01" --dry-run
node <脚本> download --result "output/tts-01/result.json" --format wav --out-dir "output/tts-recovery-01"
```

format 与原任务一致，可从 request.json 查看。该分支不读取 API Key，只下载已完成响应的 audio.url 或解码 audio.data；使用新目录，不覆盖原响应或媒体。媒体 URL 允许服务返回的 HTTP(S)，不附带鉴权且拒绝重定向；HTTP 链接没有传输加密保证，敏感任务需考虑风险，不能擅自改签名 URL。

预检验证响应终态与参数，不验证远程文件。URL 过期时报告失败；新增合成需用户重新授权。

## 失败分流

| 故障／状态 | 下一步 |
| --- | --- |
| 缺 Key 或本地预检失败 | 修正本地环境／参数，不发请求 |
| submitting、超时、断网、非法 JSON | 结果未知，保留目录和记录；核查控制台，禁止换目录自动重提 |
| received 且 HTTP／code／finish_reason 异常 | 报告服务错误或未完成状态；不能把收到响应当成成功 |
| 已有成功 result.json，下载或落盘失败 | 使用 download 新目录补下载，不重新合成 |
| usage 缺失 | 标注计量信息未知；不以此触发新合成 |
| 残留 .part / .tmp | 保留证据；确认进程停止后由用户处理，补下载可选新目录 |

## 验收与交付

1. **技术验收。** 核对响应终态与清单中每个文件；脚本仅检查非空和粗略文件签名，PCM 无容器签名。用可用本地音频工具解码，检查格式、时长、采样率和声道；PCM 需结合请求采样率及官方编码约定。**完成：每项都有检查结果，无法解码时标未验证，不凭后缀宣称成功。**
2. **内容验收。** 有试听能力时核对读音、漏字、音色、停顿、噪音和用户风格要求；无试听能力则明确未听感验收。需要比较字节用哈希，不能用文件大小推断内容一致或质量改进。**完成：每项质量要求有结论或未验证说明；改参数重合成须用户授权。**
3. **交付。** 给出模型、voice、全部文件、result.json 和 request ID（如有），列出失败／未验证项。用户要 MP3 而来源为 WAV 时，确认本地工具可用后另存转码副本；否则交付原文件并说明格式未满足。**完成：产物清单逐项有去向，不强制 MP3，不把 usage 当作付款凭证。**
