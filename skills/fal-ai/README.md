# fal-ai

供 Agent 按需读取的 fal.ai 图片处理技能。入口是 [SKILL.md](SKILL.md)，不是自动执行插件。由 dsaco 维护，MIT；不是 fal.ai 官方产品。

## 能力与运行环境

- 图片生成／编辑：Nano Banana、Nano Banana 2、Nano Banana Pro、GPT Image 2、GPT Image 2.5 Flare／Sunburst。
- 去背景：BiRefNet v2、Ideogram。
- 结构图：Depth Anything V2、DWPose。
- 队列任务：提交、状态、取回、补下载、取消；不自动重提或切换模型。
- 模型咨询：通过宿主的公开网页工具核对价格、参数与来源；脚本不提供账单抓取。
- 不含视频、ControlNet 生图、依赖安装或媒体私有 ACL 管理。

需要 Node.js 22+，无 npm 依赖。实际 API 操作需要本地环境变量 `FAL_KEY`；预检和帮助不需要。宿主仍需允许命令执行和相应文件访问。

## 快速检查

将下列 `<技能目录>` 替换为实际安装路径：

```sh
node "<技能目录>/scripts/fal.mjs" --help
node "<技能目录>/scripts/fal.mjs" text-to-image --prompt "陶瓷茶壶" --dry-run
node "<技能目录>/scripts/fal.mjs" image-to-depth --image "scene.png" --dry-run
```

任务参数见 [图片](references/images.md)、[去背景](references/background.md)、[结构图](references/structure.md)。只有用户明确要求实际生成／处理时才移除 `--dry-run`。提交后按 [任务与恢复](references/jobs.md) 使用 request.json 查询与取回，不把“已提交”当成生成完成。

输入输出按用户 cwd 解析，脚本从任意目录运行；默认产物在 `output/<任务>-<随机标识>/`，不要在 Skill 安装目录内运行真实任务。完整目录可通过 ai-pi 个人技能导入，或放入 DSH 默认的 `.agents/skills/` 扫描根。

## 安全与验收

- Key 只从环境读取，不写在命令参数、SKILL.md 或 prompt 中；不自动读取 `.env`。
- prompt、选定素材会发送给 fal；任务记录可能包含私人输入、上传后的素材 URL 和结果链接，请勿公开。
- 素材上传／媒体下载不附带 FAL_KEY；所有网络请求拒绝重定向。下载不覆盖已有不同内容。
- 安装不调用付费 API；缺少运行环境交由用户处理，不自动安装第三方软件。
- 测试只证明本地参数、队列接线与文件行为。保存成功只说明字节和图片签名符合检查，不证明尺寸、Alpha 或视觉质量；产物需要逐项验收。
- macOS 本地测试不等于 Windows、DSH／ai-pi 当前安装入口或真实 API 验收。

## 许可与来源

[MIT](LICENSE)，Copyright (c) 2026 dsaco。原始代码从作者的 ai-pi 项目 `resources/local-skills/fal-ai/` 整理而来；未复制第三方 SDK 或模型权重。模型名称与文档链接不构成可用性、定价、配额或输出质量承诺。
