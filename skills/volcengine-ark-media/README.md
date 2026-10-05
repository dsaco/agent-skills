# volcengine-ark-media

火山方舟 Seedream 图片与 Seedance 视频技能，入口见 [SKILL.md](SKILL.md)。不是火山引擎官方项目。

## 安装与环境

需要 Node.js 22+，无需 `npm install`。完整复制本目录，保留 `package.json`（声明 CommonJS，避免宿主 ESM 配置改变脚本含义）、`scripts/`、`references/`、`SKILL.md` 和 `LICENSE`。

生成及视频查询需要环境变量 `ARK_API_KEY`；安装不包含付费调用授权。密钥注入、预检边界、输入输出路径和失败恢复统一见[任务规则](references/jobs.md)。

在用户任务目录用技能入口的绝对路径检查安装：

```sh
node "<技能目录>/scripts/ark-media.js" --help
node "<技能目录>/scripts/ark-media.js" models
```

## 使用入口

| 需求 | 动作与文档 |
| --- | --- |
| 图片生成、参考图编辑、组图 | `image`；[图片参数](references/seedream-image.md) |
| 视频创建 | `video-create`；[视频参数](references/seedance-2.0.md) |
| 已有视频进度、成品或补下载 | `video-query`；[视频取回](references/jobs.md#视频取回) |
| 已有图片响应补下载 | `image-download`；[图片恢复](references/jobs.md#图片恢复) |
| 离线图片模型清单 | `models`，不查询账户权限 |

各动作参数用 `<动作> --help` 查看。模型及价格是导入快照，未重新核实或进行真实 API 验收。

## 维护与许可

```sh
# 在本 Skill 目录执行：仅假凭据、内存 fetch 替身、临时目录
npm test
```

原创代码和整理内容采用 MIT，见 [LICENSE](LICENSE)。参考资料为带官方链接的接口整理与使用建议，不授予第三方文档、商标、模型、账户或素材权利；本地来源未附独立第三方 LICENSE，未复制 SDK 或外部依赖。
