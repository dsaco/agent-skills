# 当前状态

## 定位与范围

- dsaco 个人 Skill 集合，持续按实际需求收录；每个 Skill 独立分发，不针对某个应用定制。
- 本仓库维护技能内容、脚本、文档与测试；宿主加载、安装器和客户端发布由各工具自行负责，不作为本项目交付项。

## 技能与验证

- fal-ai 首版已提交／推送到 `dsaco/agent-skills`，提交 `0fed740080ba4bce7970020ce2fe0131369283bf`；没有创建 Git 标签或 Release。
- 当前本地维护三个独立 Skill：`fal-ai` 图片版、`volcengine-ark-media` 图片／视频版和 `dashscope-tts` 百炼语音版；均提供 MIT、Node.js 22+、无 npm 依赖。
- volcengine-ark-media 已从本地已安装副本整理到 `skills/volcengine-ark-media/`，保留名称与模型定义，补充模块边界、安全恢复、独立说明和离线测试，见 [来源与验证](volcengine-ark-media.md)。未修改原副本，本次纳入本地提交，尚未推送或同步消费者。
- dashscope-tts 已整理为通用非流式合成与补下载技能，官方参数核对、来源和范围见[来源与验证](dashscope-tts.md)；未修改原副本，本次纳入本地提交，尚未推送。ElevenLabs 的 music、sound-effects、text-to-speech 不迁入，README 仅给官方安装示例。
- 本轮仓库 `npm test` 共 **33 项通过**；仅离线／假服务验证，未真实调用付费 API 或验收生成质量；本轮核对百炼公开接口文档，未逐模型实测或核验全部实时价格。
- 按 writing-great-skills 优化两技能：Ark 分支与完成条件重整、任务规则集中、提示词参考精简，新增无 Key 的图片补下载；fal 轻量去重并明确仅预览结束条件。见[流程静态走查](skill-process-review.md)，未宣称模型行为实测。
- 通过 GitHub 完整 Skill 目录分发，支持第三方 Skills CLI 和手动安装；安装工具自行负责版本解析与校验，见[目录分发说明](distribution.md)。
- 后续若需要发布新增 Skill、更新已安装副本或验证真实 API，须另获相应授权。
