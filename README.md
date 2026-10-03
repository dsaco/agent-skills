# agent-skills

可独立分发的 Agent Skills，由 dsaco 维护。仓库地址：[dsaco/agent-skills](https://github.com/dsaco/agent-skills)。不是 fal.ai、DeepSeek 或 Pi 官方项目。

本仓库按 GitHub 源码目录分发 Skill，不要求单独的 Skill 版本号、Release 或 ZIP。ai-pi 与 Dong 的 GitHub 下载接入正在本地开发；客户端发布状态与本仓库源码分发是两件事。

## 当前 Skill

| Skill | 能力 | 要求 |
| --- | --- | --- |
| [fal-ai](skills/fal-ai/SKILL.md) | 文生图、参考图编辑、去背景、深度图、人体姿态图；任务状态、取回、补下载、取消；公开模型咨询 | Node.js 22+；实际 API 操作需要环境变量 `FAL_KEY`；无 npm 依赖 |

共 16 个端点定义，详见 [Skill 使用说明](skills/fal-ai/README.md)。本版采用 ai-pi 的独立图片脚本，**不包含视频生成**；全局旧版的视频脚本未迁入。参数定义来自原有实现，本轮未重新验收所有上游模型或进行付费生成。

## 获取与安装

可在 GitHub 下载源码 ZIP 或克隆：

```sh
git clone https://github.com/dsaco/agent-skills.git
```

一次安装一个完整 Skill 目录，保留 `SKILL.md`、`scripts/`、`references/` 和 `LICENSE`。不要只复制 SKILL.md，不要把整个仓库外层目录当作一个 Skill。

### DeepSeek Harness Desktop

默认配置下，将 `skills/fal-ai/` 复制到用户的 `~/.agents/skills/fal-ai/`，或当前项目的 `.agents/skills/fal-ai/`。Windows 用户根对应 `%USERPROFILE%\.agents\skills\fal-ai\`。

最终结构应为：

```text
.agents/skills/fal-ai/SKILL.md
.agents/skills/fal-ai/scripts/fal.mjs
```

在聊天输入框使用 `/fal-ai`，或描述符合 Skill 的任务。DSH 环境／预设可能改变扫描目录；运行脚本仍需宿主提供 Node 和获准的命令权限。**DSH 原生凭据记录中的 Key 不等于子进程一定有同名环境变量**；实际运行前应在不输出值的前提下确认 `FAL_KEY` 可用，不通过放宽沙箱解决环境问题。

### ai-pi

使用现有 **设置 → 技能 → 个人 → 导入目录**，选中本仓库的 `skills/fal-ai/`。密钥通过 **设置 → 密钥**配置 `FAL_KEY`，不要在聊天中粘贴明文 Key。

也可自行放入 `~/.agents/skills/fal-ai/`，再明确开启 ai-pi 的「使用系统技能」。同名来源优先级可能使旧副本胜出，按应用显示的实际来源核对，不自动覆盖用户目录。

这两条是已有的本地安装方式；应用内“官方技能”仍指向旧来源，本轮未接入 GitHub 目录或自动更新。

## 运行与验证

无需 `npm install`。在仓库根目录执行离线检查：

```sh
npm test
node skills/fal-ai/scripts/fal.mjs --help
node skills/fal-ai/scripts/fal.mjs text-to-image --prompt "陶瓷茶壶" --dry-run
```

`--dry-run` 不读取 Key、不联网、不写生成文件。真实任务从用户的工作目录运行，使用脚本绝对路径，以免把私人素材或任务记录写入源码仓库。默认输出为该工作目录的 `output/<任务>-<随机标识>/`。

脚本只读取环境变量 `FAL_KEY`，不自动加载 `.env`。若凭据在项目根 `.env` 中，可由本地启动流程仅注入所需变量；不要让模型读取、打印或上传文件内容。实际模型调用和素材上传可能产生费用，安装 Skill 不等于授权调用。

## 维护与发布边界

- 能力入口：[SKILL.md](skills/fal-ai/SKILL.md)；模型参数按需查阅该文件链接的 references。
- 来源对比与验证：[docs/fal-ai.md](docs/fal-ai.md)；当前状态：[docs/status.md](docs/status.md)。
- GitHub 下载约定见 [分发契约](docs/distribution.md)：刷新解析 main，安装绑定精确 commit，按技能目录内容判断更新；不另建独立签名或 ZIP 发布目录。
- 仓库与独立 Skill 均提供 MIT LICENSE；许可不授予 fal 账户、API 配额或第三方素材权利。
- 不提交凭据、任务记录、生成素材或依赖目录；发布前再次检查精确文件白名单。
