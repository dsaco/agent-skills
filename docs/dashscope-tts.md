# dashscope-tts 来源与验证

## 范围与来源

按用户确认，本轮只迁入本地 `dashscope-tts`。ElevenLabs 的 music、sound-effects、text-to-speech 使用[官方仓库](https://github.com/elevenlabs/skills)，本仓库仅在 README 给安装示例，不复制第三方技能。

百炼源文件为 SKILL.md 与 3 个 references，共 4 个文件，无执行脚本、独立版本或 Git commit。导入前 SHA-256 见[源码摘要](dashscope-tts-source.json)，仅用于溯源，不是发布签名。未读取用户真实 `.env`、凭据或生成记录，未修改已安装副本。

本地来源无独立第三方 LICENSE；按仓库原创内容 MIT 规则补充独立 LICENSE。新脚本和整理文档采用 MIT，官方链接用于接口依据，不复制 SDK、整页官方文档或赋予第三方音色／服务权利。

## 官方核对

本轮实际读取：

- [CosyVoice HTTP API](https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api)
- [Qwen-Audio-TTS HTTP API](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-http-api)
- [Qwen-TTS HTTP API](https://help.aliyun.com/zh/model-studio/qwen-tts-api)
- [CosyVoice 音色列表](https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list)
- [Qwen-Audio-TTS 音色列表](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list)
- [ElevenLabs 官方 README](https://github.com/elevenlabs/skills/blob/main/README.md)：确认整仓库安装命令及三个技能名称；指定技能使用 Skills CLI 的 `--skill` 选项。

参数修正：补入 A 线 12000 Hz、opus 采样率例外；hot_fix 改为官方对象数组；seed 仅说明同条件可复现，不声称文件大小证明内容一致。Qwen 响应的可选 status_code 包装与原始 HTTP 状态分开处理。地域只声明本技能脚本使用北京，不推导为所有 Qwen 服务仅北京可用。

## 流程与实现

- 保留 dashscope-tts 名称，触发范围限定百炼服务／模型／音色，避免抢占所有通用 TTS 或 ElevenLabs 请求。
- 模型／音色、A/B 参数、任务规则分开按需读取；新合成、补下载、模型列表有独立完成条件。
- 删除来源中面向特定项目的“全部音色均生产验证、可放心使用”保证；只保留有官方出处的示例，其余要求先核对。
- 输出按需求，不强制 MP3；不以 usage 缺失认定未合成，不以同大小判断逐字节相同；解码检查与试听分别报告。
- 新增 Node.js 22+ 标准库 `scripts/tts.mjs` 和参数模块：非流式 synthesize、无 Key download、models、dry-run；无 npm 依赖。
- 必填新任务目录、提交前留据、原子 JSON 保存、收到响应先保存再下载；状态不明不自动重提。新目录只能防止直接重跑，不能防止 Agent 擅自换目录，因此 SKILL 仍明确付费授权边界。
- API 固定北京域名，可选受校验的 Workspace 专属域名；拒绝重定向，媒体下载不附带 API Key。媒体 URL 允许官方响应中的 HTTP(S)，HTTP 不提供传输加密，已在任务规则提示。
- 本地 JSON 16 MiB、下载音频 128 MiB 上限，请求 120 秒超时；音频非空和粗略签名检查，不替代解码与试听。

## 当前限制

原 Skill 含流式和时间戳参考，本轮脚本明确仅接非流式，保留上游流式说明但不当作已实现能力。未接声音复刻创建、声音设计、批量切分、自动转码、实时播放或自动查价。部分高级字段保守拒绝；模型／音色兼容性、文本 token 限额和 instruction 语法不由本地脚本完整裁决。

## 验证

macOS / Node.js 24.14.0：仓库 `npm test` **33 项通过**，含新增 8 项百炼脚本测试及 1 项仓库结构检查。使用假 Key、内存 fetch 替身、临时目录；未调用真实付费 API。

覆盖 A/B 参数隔离和边界、独立中文空格路径、无 Key 预检、响应／提交记录、无凭据媒体 GET、Base64、缺 usage、错误脱敏、超时／HTTP 错误／非法 JSON、防重复目录、响应补下载和签名异常。

未验收实际音色、音质、全部模型和地区权限、Node.js 22、Windows、硬链接不支持的文件系统、宿主实际安装或 Agent 触发率。官方文档核对不等于真实 API 测试；未执行 ElevenLabs 安装命令。
