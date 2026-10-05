# agent-skills

dsaco 个人维护的 Agent Skills 集合。仓库地址：[dsaco/agent-skills](https://github.com/dsaco/agent-skills)。

每个 Skill 位于 `skills/<name>/`，可独立安装、使用和维护。按实际需求持续收录与完善技能，不针对特定应用定制，也不绑定某个 Agent 客户端。

支持 Agent Skills 的工具可按自身规则加载本仓库内容；实际运行仍需满足对应 Skill 的依赖、凭据和权限要求。本项目不是所涉及服务商或宿主应用的官方项目。

## 本仓库维护的 Skill

| Skill | 能力 | 要求 |
| --- | --- | --- |
| [dashscope-tts](skills/dashscope-tts/SKILL.md) | 阿里云百炼语音合成：CosyVoice／Qwen-Audio-TTS、Qwen-TTS 非流式合成与音频补下载 | Node.js 22+；合成需要 `DASHSCOPE_API_KEY`；无 npm 依赖 |
| [volcengine-ark-media](skills/volcengine-ark-media/SKILL.md) | Seedream 文生图、参考图编辑与组图；Seedance 视频创建、查询与下载；已有图片响应补下载 | Node.js 22+；生成及视频查询需要环境变量 `ARK_API_KEY`；无 npm 依赖 |
| [fal-ai](skills/fal-ai/SKILL.md) | 文生图、参考图编辑、去背景、深度图、人体姿态图；任务状态、取回、补下载、取消；公开模型咨询 | Node.js 22+；实际 API 操作需要环境变量 `FAL_KEY`；无 npm 依赖 |

各技能的能力边界、参数和使用说明见对应目录的 `SKILL.md` 与 `README.md`。当前三个技能均无 npm 运行依赖；这不是未来所有技能的统一要求。

本地开发与远程可安装版本可能不同，发布状态及验证范围见 [docs/status.md](docs/status.md)。

## 官方／原作者 Skill（外部维护）

本节只提供上游安装指引，**不复制、不修改或分发这些技能**；它们不属于上方的自维护清单，许可、依赖和更新以各自来源仓库为准。默认项目级安装，跨项目使用时添加 `-g`，按提示选择目标 Agent。

### Skill 编写与发现

| Skill | 来源 | 用途 |
| --- | --- | --- |
| `writing-for-agents`（原 `writing-great-skills`） | [Matt Pocock 原作者仓库](https://github.com/mattpocock/skills) | 编写 Skill、AGENTS.md 等供 Agent 使用的文档 |
| `skill-creator` | [Anthropic 官方仓库](https://github.com/anthropics/skills/tree/main/skills/skill-creator) | 创建、优化和评测 Skill |
| `find-skills` | [Vercel Labs 官方仓库](https://github.com/vercel-labs/skills/tree/main/skills/find-skills) | 搜索和安装已有 Skill |

```sh
# writing-great-skills 的当前上游名称为 writing-for-agents
npx skills add mattpocock/skills --skill writing-for-agents

# 创建和评测 Skill
npx skills add anthropics/skills --skill skill-creator

# 发现和安装 Skill
npx skills add vercel-labs/skills --skill find-skills
```

`writing-great-skills` 的旧文档路径已不可用，当前上游 [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL.md) 声明名称为 `writing-for-agents`；本地旧副本不会因本说明而自动更名或被替换。若上游再次调整名称，可先用 `npx skills add <来源仓库> --list` 查看。已核对来源与当前技能名称，未执行安装；评测等高级能力所需运行时、宿主工具和费用另按上游说明确认。

### 音乐、音效与配音

音乐、音效和 ElevenLabs 配音直接使用 [ElevenLabs 官方 Skill 仓库](https://github.com/elevenlabs/skills)。

以下命令从 `elevenlabs/skills` 安装，默认项目级；跨项目使用时添加 `-g`，按提示选择目标 Agent：

```sh
# 查看官方仓库技能清单
npx skills add elevenlabs/skills --list

# 音乐：配乐、歌曲、作曲计划
npx skills add elevenlabs/skills --skill music

# 音效：环境声、UI 提示音、循环音效
npx skills add elevenlabs/skills --skill sound-effects

# ElevenLabs 文本转语音、配音
npx skills add elevenlabs/skills --skill text-to-speech
```

官方 README 提供的整仓库安装入口为 `npx skills add elevenlabs/skills`，也可通过交互选择以上技能。实际生成需要用户本地配置环境变量 `ELEVENLABS_API_KEY`；不要在聊天中发送明文 Key。SDK／CLI 依赖按各官方 Skill 的安装说明准备；**本仓库的“无 npm 依赖”不适用于外部技能**。本轮已核对官方 README 与技能名称，未执行安装或付费生成。

## 获取与安装

### 使用 npx skills

需要本机已有 Node.js 和 npm。在希望使用技能的项目目录执行，按交互提示选择目标 Agent：

```sh
# 查看远程仓库可安装的技能，不安装
npx skills add dsaco/agent-skills --list

# 安装 fal-ai 到当前项目
npx skills add dsaco/agent-skills --skill fal-ai

# 安装 volcengine-ark-media 到当前项目（该技能推送后可用）
npx skills add dsaco/agent-skills --skill volcengine-ark-media

# 安装百炼语音技能（该技能推送后可用）
npx skills add dsaco/agent-skills --skill dashscope-tts

# 用户级安装，跨项目使用：添加 -g
npx skills add dsaco/agent-skills --skill fal-ai -g
```

也可在一次命令中选择多个技能：

```sh
npx skills add dsaco/agent-skills --skill fal-ai --skill volcengine-ark-media --skill dashscope-tts
```

**当前 Ark、百炼及本轮优化尚未推送**，远程命令只能取得 GitHub 上已有的内容；包含新增技能的远程命令需等推送后使用。安装尚未推送的本地版本时，在目标项目目录指定本仓库的本地路径：

```sh
npx skills add "<本地仓库路径>/skills/fal-ai"
npx skills add "<本地仓库路径>/skills/volcengine-ark-media"
npx skills add "<本地仓库路径>/skills/dashscope-tts"
```

将 `<本地仓库路径>` 替换为实际路径。默认安装范围是当前项目；`-g` 改为用户级，`--agent <名称>` 可指定 CLI 支持的 Agent，`--copy` 使用复制而非符号链接。默认保留交互确认，安装前核对目标目录及同名技能，避免覆盖已有副本。具体安装目录和加载方式由所选 Agent 决定；未被 CLI 支持的工具可按下方方式手动安装。

这里的 `skills` 是第三方 [Skills CLI](https://github.com/vercel-labs/skills#install-a-skill)，`npx` 可能下载并执行该工具；不是本仓库发布的 npm 包，也不是生成脚本的运行依赖。安装无需业务 API Key，不会授权付费生成。本节命令已核对上游文档，尚未执行真实安装验收；该 CLI 的更新与校验行为由其自身实现决定，本仓库的分发范围见[目录分发说明](docs/distribution.md)。

### 手动获取完整目录

可在 GitHub 下载源码 ZIP 或克隆：

```sh
git clone https://github.com/dsaco/agent-skills.git
```

一次安装一个完整 Skill 目录，保留 `SKILL.md`、`scripts/`、`references/`、`LICENSE` 以及目录内的 `package.json`（若有）。不要只复制 SKILL.md，不要把整个仓库外层目录当作一个 Skill。

将完整的 `skills/<name>/` 放入所用工具支持的技能目录，或使用该工具的目录导入功能。以 `fal-ai` 为例，安装后应保留：

```text
<技能安装目录>/fal-ai/SKILL.md
<技能安装目录>/fal-ai/scripts/
<技能安装目录>/fal-ai/references/
<技能安装目录>/fal-ai/LICENSE
```

项目级／用户级目录、启用方式及同名来源优先级由宿主决定，请核对实际加载路径。本仓库不提供应用专用安装器或设置界面适配；安装成功也不代表脚本执行权限与凭据已就绪。

## 运行与验证

当前仓库测试无需 `npm install`。在仓库根目录执行离线检查：

```sh
npm test
node skills/fal-ai/scripts/fal.mjs --help
node skills/fal-ai/scripts/fal.mjs text-to-image --prompt "陶瓷茶壶" --dry-run
node skills/volcengine-ark-media/scripts/ark-media.js --help
node skills/volcengine-ark-media/scripts/ark-media.js image --prompt "陶瓷茶壶" --dry-run
node skills/dashscope-tts/scripts/tts.mjs --help
node skills/dashscope-tts/scripts/tts.mjs models
```

`--dry-run` 不读取 Key、不联网、不写生成文件。真实任务从用户的工作目录运行，使用脚本绝对路径，以免把私人素材或任务记录写入源码仓库。fal-ai 默认输出为该工作目录的 `output/<任务>-<随机标识>/`；Ark 默认输出为 `output/seedream/<name>/` 或 `output/seedance/<name>/`，每次新生成应使用唯一名称。百炼使用必填的 `--out-dir` 指定一个尚不存在的任务目录。

fal-ai 读取 `FAL_KEY`，Ark 读取 `ARK_API_KEY`，百炼读取 `DASHSCOPE_API_KEY`；三个自维护技能均不自动加载 `.env`。若凭据在项目根 `.env` 中，可由本地启动流程仅注入所需变量；不要让模型读取、打印或上传文件内容。实际模型调用和素材上传可能产生费用，安装 Skill 不等于授权调用。

## 维护与发布边界

- 能力入口：[fal-ai](skills/fal-ai/SKILL.md)、[volcengine-ark-media](skills/volcengine-ark-media/SKILL.md)、[dashscope-tts](skills/dashscope-tts/SKILL.md)；模型参数按需查阅各入口链接的 references。
- 流程规范与静态走查：[Skill 流程审查](docs/skill-process-review.md)；不等同于模型行为实测。
- 来源对比与验证：[fal-ai](docs/fal-ai.md)、[volcengine-ark-media](docs/volcengine-ark-media.md)、[dashscope-tts](docs/dashscope-tts.md)；当前状态：[docs/status.md](docs/status.md)。
- 分发单位为完整 Skill 目录，通过 GitHub 源码和第三方安装工具获取；约定见[目录分发说明](docs/distribution.md)。不维护应用客户端、专用下载器或独立市场。
- 仓库与独立 Skill 均提供 MIT LICENSE；许可不授予第三方服务账户、API 配额或素材权利。
- 不提交凭据、任务记录、生成素材或依赖目录；发布前再次检查精确文件白名单。
