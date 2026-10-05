# exe-dev

exe.dev 开发、架构评估与运维知识技能。覆盖 SSH、远程开发与部署、分享权限、代理登录、跨 VM 集成、LLM／计费咨询，以及敏感数据分发的风险分析。

这是个人维护的操作指引，**不是 exe.dev 官方 Skill，也不是自动运维工具**。没有随附执行脚本或 npm 依赖，不要求安装 Node.js；Agent 依据任务选择参考资料，使用用户已有且获授权的工具。

## 安装

使用本地完整目录（在目标项目目录执行）：

```sh
npx skills add "<本地仓库路径>/skills/exe-dev"
```

从包含该 Skill 的已推送版本安装：

```sh
npx skills add dsaco/agent-skills --skill exe-dev
```

默认项目级，用户级安装可加 `-g`；核对目标目录，避免覆盖正在维护的源码。`npx skills` 是第三方安装器，需要其自身要求的 Node.js／npm，这不等于 Skill 运行依赖。

也可手动复制整个目录，保留 `SKILL.md`、`references/`、`README.md` 和 `LICENSE`。具体加载路径与刷新方式以宿主为准。源码工作区已经被宿主加载时，不用再通过安装器重装同名 Skill。

## 环境与使用

咨询需要公开网页读取能力；实际操作需要 exe.dev 账户、SSH 客户端及用户已有认证，没有固定名称的环境变量要求。传输工具和跨平台终端差异见[操作检查](references/operations.md)。

从 [SKILL.md](SKILL.md) 选择咨询、只读排障或变更，按主题加载参考。执行与凭据约束统一见[授权与凭据边界](SKILL.md#boundaries)；安装技能本身不授予操作权限。

离线结构检查不等于真实平台、宿主或 Windows 验收。

## 许可

本仓库自维护整理内容采用 [MIT](LICENSE)。文中仅摘要并链接官方资料，不分发平台文档全文或第三方程序；第三方商标、服务、账户、素材与 API 权利仍归各自权利人，MIT 不授予平台配额或操作权限。
