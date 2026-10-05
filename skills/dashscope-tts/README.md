# dashscope-tts

阿里云百炼非实时语音合成 Skill，提供 CosyVoice／Qwen-Audio-TTS 和 Qwen-TTS 两类 HTTP 请求、响应留据与音频补下载。不是阿里云官方 Skill。

## 安装与运行

完整复制本目录，保留 SKILL.md、scripts、references 和 LICENSE。需要 Node.js 22+，无 npm 依赖；合成需要环境变量 `DASHSCOPE_API_KEY`，补下载和预检不需要 Key。

```sh
node "<技能目录>/scripts/tts.mjs" --help
node "<技能目录>/scripts/tts.mjs" models
node "<技能目录>/scripts/tts.mjs" synthesize --request "input/tts.json" --out-dir "output/tts-01" --dry-run
```

从用户工作目录执行。请求 JSON 示例见 [A 线](references/speech-synthesizer-api.md)／[B 线](references/qwen-tts-api.md)；凭据、输出、防重复提交及恢复规则统一见 [任务规则](references/jobs.md)。

## 范围

- 脚本支持非流式合成、已有响应补下载、本地模型清单、离线预检。
- 北京端点，可选北京 Workspace 专属域名；音色与模型的账户权限仍由服务端决定。
- 不包含流式播放、字级时间戳、声音复刻创建、音色设计、批量分段或自动转码。参考资料提到上游流式能力，不代表脚本已支持。
- 输出遵循请求格式。需要转码时另用本机已有工具，技能不自动安装依赖。

## 离线测试与许可

在本 Skill 目录运行：

```sh
node --test tests/tts.test.mjs
```

测试用假凭据、临时目录和内存 fetch 替身，不执行真实合成。原创整理内容与脚本使用 [MIT](LICENSE)，不授予阿里账户、API 配额、音色或素材权利。官方参考链接不纳入本项目的许可授权范围。
