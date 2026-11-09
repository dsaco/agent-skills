---
name: fal-ai
description: fal.ai 通用媒体生成与编辑：动态发现模型、读取实时参数、上传参考素材、生成图片／动图／视频／音频／音乐／3D，以及查询、取回、补下载或取消本次生成任务。直接调用官方 API，不依赖 MCP；不处理资产库或账号管理。
compatibility: Node.js 22+，无 npm 依赖；实际生成需要环境变量 FAL_KEY 和网络访问。
---

# fal.ai

以 `node "<技能目录>/scripts/fal.mjs"` 调用官方 API，保持用户任务 cwd；路径相对 cwd。模型与参数以本次取得的 schema 为准，新增标准队列模型无需修改技能。命令语法见 `--help`。

## 新生成任务

先读[通用输入与生成](references/generation.md)；认证、任务恢复与交付见[任务](references/jobs.md)。

1. **确定模型与产物。** 用户给完整端点时直接 `schema`；否则 `search` 找真实 endpoint ID，再 `schema` 核对能力。按用户需求列出输出数量、媒体类型及尺寸／时长／透明度等要求。未指定模型时依据搜索结果与 schema 选择匹配项并说明选择；搜索排序不是质量排名。**完成：端点已查证，关键要求均有对应参数或明确能力边界。**
2. **构建输入。** 将实际模型字段写入 JSON；本地参考素材用 `$file` 标记，顺序沿用用户要求。保留显式参数，省略项交给 API 默认。读取 schema 的描述、嵌套引用和互斥约束，运行 `submit --dry-run`，处理错误与未覆盖校验的 warnings。需要费用信息时按[咨询](references/consultation.md)核对。**完成：预检通过且每项要求均已核对；用户只要求预览则交付摘要并结束。**
3. **提交留据。** 用户要求实际生成时移除 `--dry-run`，提交一次。提交会重新读取实时 schema。**完成：保留 request.json 与请求 ID；提交状态不明按任务文档恢复，避免重复收费。**
4. **等待与交付。** 对原请求使用 `wait`，返回 pending 时继续等待；按任务文档取回、逐项解码验收并交付。**完成：每项预期产物都有已保存结果或明确失败／待处理状态。**

## 已有任务

用户提供 request.json，按[任务](references/jobs.md)选择 status、wait、result、download 或 cancel。补下载复用原始结果，不再生成。取消仅在用户要求取消该任务时执行。

## 能力边界

支持公开 OpenAPI 描述的标准 JSON 队列端点；实时会话、WebSocket、特殊流式协议需要专用实现。schema 缺失或入口歧义时说明限制。脚本做常见 schema 约束预检，复杂约束的 warnings 仍需核对；实际文件品质由解码与内容检查确认。
