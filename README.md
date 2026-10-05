# agent-skills

dsaco 个人维护的 [Agent Skills 集合](https://github.com/dsaco/agent-skills)。自维护源码位于 `skills/<name>/`，可独立安装，也可在本地直接开发使用；不绑定特定 Agent 客户端，非服务商官方项目。

## 自维护 Skill

| Skill | 能力 | 要求 |
| --- | --- | --- |
| [fal-ai](skills/fal-ai/SKILL.md) | 图片生成、编辑、去背景、深度／姿态提取及任务恢复 | Node.js 22+，无 npm 依赖 |
| [volcengine-ark-media](skills/volcengine-ark-media/SKILL.md) | Seedream 图片、Seedance 2.0／2.5 视频及补下载 | Node.js 22+，无 npm 依赖 |
| [dashscope-tts](skills/dashscope-tts/SKILL.md) | 百炼非流式语音合成与补下载 | Node.js 22+，无 npm 依赖 |
| [qiniu](skills/qiniu/SKILL.md) | 本地文件上传七牛并返回访问 URL | Node.js 22+，真实上传需官方 qiniu SDK |
| [exe-dev](skills/exe-dev/SKILL.md) | exe.dev 部署排障、权限、集成与计费咨询 | 文档型；实际操作需账户、SSH 与授权 |

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
```

本地安装可用 `npx skills add "<本地仓库路径>/skills/<name>"`。也可克隆／下载源码，将完整技能目录放入宿主支持的位置，保留 `SKILL.md`、references、脚本及依赖声明（若有）、LICENSE。安装器的本地路径模式会产生安装副本，不是持续链接开发源码。

## 第三方 Skill

直接从上游安装，安装副本不纳入 Git。下面是用户级命令；项目级去掉 `-g`。**`-g` 写入实际用户级技能目录，不是当前工作目录。**

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

## 环境变量

在本地 `.env` 或启动环境中配置实际使用的服务；`.env` **只在本机保存，被 Git 忽略，不随仓库同步**。变量清单：

| 服务 | 配置项 |
| --- | --- |
| fal.ai | `FAL_KEY` |
| 火山方舟 | `ARK_API_KEY` |
| 百炼 | `DASHSCOPE_API_KEY` |
| 七牛 | `QINIU_ACCESS_KEY`、`QINIU_SECRET_KEY`、`QINIU_BUCKET`、`QINIU_DOMAIN`，上传时四项齐全；域名须为 HTTPS |
| ElevenLabs（第三方三个音频技能） | `ELEVENLABS_API_KEY` |

exe-dev 使用已有 SSH 认证，无固定环境变量。其余第三方技能的认证按上游说明，不预设通用 Key。

**自维护脚本不自动加载 `.env`**，运行时需由本地启动流程注入所需变量。密钥只在本地填写，不发到聊天、不提交；安装或配置不等于授权付费调用。

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
