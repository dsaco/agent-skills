# fal-ai

独立的 fal.ai 通用媒体生成 Skill，由 dsaco 维护，MIT，非 fal.ai 官方产品。入口为 [SKILL.md](SKILL.md)。直接调用官方 HTTP API，不需要 MCP、SDK 或 npm 依赖。

## 能力

动态搜索模型、读取实时 OpenAPI schema，根据实际参数生成图片、动图、视频、音频、音乐、3D 或其他标准队列模型输出。模型清单、参数和输出字段不写死；新增模型沿用同一通路。用户未指定的参数由服务端默认值决定。

包括嵌套本地素材上传、提交留据、等待、查询、取回、补下载和取消生成任务。资产库、账号切换、历史管理及专用实时／流式协议不在范围内。旧固定模型命令和 version=1 任务记录不兼容。

## 使用

需要 Node.js 22+，实际生成需要环境变量 `FAL_KEY`；脚本不自动读取 `.env`。模型搜索和 schema 查询无需 Key，dry-run 不产生付费调用。

```sh
node "<技能目录>/scripts/fal.mjs" --help
node "<技能目录>/scripts/fal.mjs" search --query "模型名称或任务"
node "<技能目录>/scripts/fal.mjs" schema --endpoint "搜索返回的完整端点" --out "schema.json"
node "<技能目录>/scripts/fal.mjs" submit --endpoint "完整端点" --input "input.json" --dry-run
node "<技能目录>/scripts/fal.mjs" submit --endpoint "完整端点" --input "input.json" --out-dir "output/job-01"
node "<技能目录>/scripts/fal.mjs" wait --request "output/job-01/request.json"
```

从用户任务目录执行，输入和输出相对 cwd，真实素材和结果不放在技能目录。输入构建、离线预检、输出定位见[通用生成](references/generation.md)；认证、恢复与验收见[任务](references/jobs.md)。

## 验证与边界

```sh
node --test "<技能目录>/tests/fal.test.mjs"
```

离线测试使用假凭据、内存网络替身与临时目录。它证明通用请求、schema 预检、任务恢复及文件行为，不证明付费服务、账户权限、画质／音质或所有模型协议。公共 schema 查询只验证公开接口，不提交生成。

schema 预检覆盖常用约束并报告未覆盖项；实际提交重新读取最新 schema。上传单文件最多 100 MiB，下载单文件最多 1 GiB。媒体下载成功不等于解码或内容验收。

## 许可

[MIT](LICENSE)，Copyright (c) 2026 dsaco。沿用本项目原创实现与许可，未复制第三方 SDK 或模型权重。动态目录、定价与 schema 不构成模型可用性或质量承诺。
