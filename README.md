# agent-skills

dsaco 个人维护的 [Agent Skills 集合](https://github.com/dsaco/agent-skills)。自维护源码位于 `skills/<name>/`，可独立安装，也可在本地直接开发使用；不绑定特定 Agent 客户端，非服务商官方项目。

## 自维护 Skill

| Skill | 能力 | 要求 |
| --- | --- | --- |
| [fal-ai](skills/fal-ai/SKILL.md) | 动态模型发现与 schema、通用媒体生成／编辑及任务取回（无 MCP） | Node.js 22+，无 npm 依赖 |
| [volcengine-ark-media](skills/volcengine-ark-media/SKILL.md) | Seedream 图片、Seedance 2.0／2.5 视频及补下载、豆包录音转写与字幕导出 | Node.js 22+，无 npm 依赖 |
| [dashscope-tts](skills/dashscope-tts/SKILL.md) | 百炼非流式语音合成与补下载 | Node.js 22+，无 npm 依赖 |
| [qiniu](skills/qiniu/SKILL.md) | 本地文件上传七牛并返回访问 URL | Node.js 22+，真实上传需官方 qiniu SDK |
| [exe-dev](skills/exe-dev/SKILL.md) | exe.dev 部署排障、权限、集成与计费咨询 | 文档型；实际操作需账户、SSH 与授权 |
| [strudel-music](skills/strudel-music/SKILL.md) | Strudel 编曲、离线渲染 WAV，预检与音频校验 | Node.js 22+、Playwright 与本机 Chrome、Python 3；需访问 strudel.cc |

参数、依赖和能力边界见各技能的 `SKILL.md` 与 `README.md`。

## 获取与安装

安装器需要 Node.js／npm。以下从 GitHub 已推送版本安装，默认项目级；加 `-g` 为用户级，按提示选择 Agent，先检查同名副本以免覆盖本地修改。

```sh
npx skills add dsaco/agent-skills --list
npx skills add dsaco/agent-skills --skill fal-ai
npx skills add dsaco/agent-skills --skill volcengine-ark-media
npx skills add dsaco/agent-skills --skill dashscope-tts
npx skills add dsaco/agent-skills --skill qiniu
npx skills add dsaco/agent-skills --skill exe-dev
npx skills add dsaco/agent-skills --skill strudel-music
```

本地安装可用 `npx skills add "<本地仓库路径>/skills/<name>"`。也可克隆／下载源码，将完整技能目录放入宿主支持的位置，保留 `SKILL.md`、references、脚本及依赖声明（若有）、LICENSE。安装器的本地路径模式会产生安装副本，不是持续链接开发源码。

## 第三方 Skill

直接从上游安装，安装副本不纳入 Git。本仓库的 `skills/` 采用自维护目录白名单，以下第三方技能都保持忽略。下面是用户级命令；项目级去掉 `-g`。**`-g` 写入实际用户级技能目录，不是当前工作目录。** 安装后核对实际目录，同一宿主只保留一份加载中的副本；清理旧副本前先比较内容和依赖。

新增或调整第三方技能时，在本节登记技能名称、用途、上游来源、安装／更新入口和认证方式；需要环境变量的，同时维护下方配置清单与 `.env.example`。登记不将第三方源码或登录状态加入本仓库。

```sh
npx skills add tencentcloudbase/cloudbase-skills --skill cloudbase -g
npx skills add vercel-labs/skills --skill find-skills -g
npx skills add elevenlabs/skills --skill music -g
npx skills add microsoft/playwright-cli --skill playwright-cli -g
npx skills add anthropics/skills --skill skill-creator -g
npx skills add elevenlabs/skills --skill sound-effects -g
npx skills add elevenlabs/skills --skill text-to-speech -g
npx skills add mattpocock/skills --skill writing-for-agents -g
```

`writing-great-skills` 当前上游名为 [`writing-for-agents`](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-for-agents)，旧副本不会自动更名。各电脑分别安装；依赖、许可和权限以上游为准，包括 CloudBase 账户／环境、Playwright CLI／浏览器及 ElevenLabs SDK。

[BrowserSkill](https://github.com/Tencent/BrowserSkill)：通过 `bsk` CLI 和 Chrome／Edge 扩展复用浏览器登录，支持 macOS／Windows／Linux；安装见[官方指南](https://github.com/Tencent/BrowserSkill/blob/main/AGENT_INSTALL.md)。

### 小云雀

以下三个第三方技能随 [`@pippit-dev/cli`](https://www.npmjs.com/package/@pippit-dev/cli) 分发，上游仓库为 [Pippit-dev/cli](https://github.com/Pippit-dev/cli)。需要 Node.js 16+；具体命令和能力以安装版本的帮助及各技能 `SKILL.md` 为准。

| Skill | 用途 | 认证 |
| --- | --- | --- |
| `xyq-skill` | 图片／视频生成与编辑、超分、擦字幕、Canvas 画布及结果查询 | 共用 CLI 登录态 |
| `xyq-short-drama-skill` | 剧本创作与解析、角色／场景、故事版、短剧生成及会话续接 | 共用 CLI 登录态 |
| `xyq-marketing-skill` | 商品图文生成剧情广告、品牌大片或达人带货视频，查询与下载营销成片 | 共用 CLI 登录态 |

```sh
# 首次安装：默认同时安装 CLI 与全局 Skills
npm install -g @pippit-dev/cli@latest
# 更新 CLI 和随附 Skills
pippit-tool-cli update
# 浏览器授权与本机登录状态检查
pippit-tool-cli login
pippit-tool-cli status
```

已有可用版本时直接复用；安装／更新会写入全局技能目录，可能覆盖本地修改，执行前先核对现有副本。三个技能共用登录授权，普通使用无需手填 Key；自动化环境可选 `XYQ_ACCESS_KEY`，它优先于网页登录，无效时不会自动回退。个人／团队空间沿用用户指定或已保存的选择，登录成功不代表所选空间有会员、积分或模型权限。

## 环境变量

按 [.env.example](.env.example) 在本地 `.env` 或启动环境中配置实际使用的服务；已有 `.env` 时仅补充所需条目。`.env` **只在本机保存，被 Git 忽略，不随仓库同步**。变量清单：

| 服务 | 配置项 |
| --- | --- |
| fal.ai | `FAL_KEY` |
| 火山方舟 | `ARK_API_KEY` |
| 豆包语音识别 | `VOLCENGINE_SPEECH_API_KEY`，或旧版 `VOLCENGINE_SPEECH_APP_ID` + `VOLCENGINE_SPEECH_ACCESS_TOKEN` |
| 百炼 | `DASHSCOPE_API_KEY` |
| 七牛 | `QINIU_ACCESS_KEY`、`QINIU_SECRET_KEY`、`QINIU_BUCKET`、`QINIU_DOMAIN`，上传时四项齐全；域名须为 HTTPS |
| ElevenLabs（第三方三个音频技能） | `ELEVENLABS_API_KEY` |
| 小云雀（第三方三个创作技能） | 默认使用 CLI 浏览器登录；自动化环境可选 `XYQ_ACCESS_KEY`，优先于网页登录 |

exe-dev 使用已有 SSH 认证，无固定环境变量。其余第三方技能的认证按上游说明，不预设通用 Key。

**自维护脚本不自动加载 `.env`**，运行时需由本地启动流程注入所需变量。Windows 用户环境变量更新后，重新启动终端或 Agent 以读取新值。密钥只在本地填写，不发到聊天、不提交；安装或配置不等于授权付费调用。

## 开发与验证

- 自维护 Skill 通过 Git 同步，新增目录需加入 `.gitignore` 白名单；第三方副本、凭据、依赖和产物保持忽略。不要让安装器更新覆盖自维护源码。
- 直接在 macOS／Windows 用户目录下的 `.agents` 工作区维护源码；宿主加载和刷新方式分别确认。依赖各机安装，不复制 `node_modules`。操作与授权边界见 [AGENTS.md](AGENTS.md)。
- 真实任务从用户任务目录运行，以技能脚本绝对路径调用；源素材和任务产物不放技能目录。支持预检的命令用 `--dry-run`，七牛预检仍需 Bucket 和域名。
- 本地提交不会更新远端；推送后，其他电脑或安装副本仍需主动拉取／更新。

仓库离线测试无需安装依赖：

```sh
npm test
```

[资料索引](docs/README.md)收录小程序运维、HubKKK、素材生产参考和项目上下文草稿，不作为 Skill 安装。验证范围见 [docs/status.md](docs/status.md)，分发约定见 [docs/distribution.md](docs/distribution.md)。Mac／离线测试不代表 Windows、宿主或真实服务已验收。自维护内容采用 [MIT](LICENSE)，各独立 Skill 保留 LICENSE。
