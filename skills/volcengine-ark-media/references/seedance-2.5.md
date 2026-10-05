# Seedance 2.5

官方依据：[Seedance 2.5 教程](https://www.volcengine.com/docs/82379/2607688)、[创建视频任务 API](https://www.volcengine.com/docs/82379/1520757)。本页模型 ID、参数差异与素材限制从官方教程正文核对；与旧活动页或第三方摘要冲突时以该接口教程为依据。文档核对不等于账户权限或付费实测。

## 选择模型

- 完整 ID：`doubao-seedance-2-5-260628`。
- 本地别名：`seedance-2.5`、`seedance-2-5`、`doubao-seedance-2-5`，均映射到上述 ID。
- 用 `video-create --model seedance-2.5` 显式选择；省略 model 仍为原来的 Seedance 2.0。
- 创建／查询接口与 2.0 相同；运行、凭据、轮询和恢复先读[任务规则](jobs.md)。

## 参数与差异

| 项目 | Seedance 2.5 |
| --- | --- |
| duration | 整数 4–30 或 -1；服务默认 -1 |
| resolution | 480p、720p、1080p；服务默认 720p；1080p 为 10bit H.265/HEVC，播放器兼容性需检查 |
| ratio | 16:9、4:3、1:1、3:4、9:16、21:9、adaptive；服务默认 adaptive |
| 参考素材 | 图片最多 30，视频最多 10，音频最多 10，总计最多 50；新增支持纯音频参考 |
| output_format | mp4（服务默认）或 mov；CLI `--output-format` |
| omni_reference_task_type | auto、reference、edit、extend；CLI `--omni-reference-task-type` |

脚本省略未指定的可选字段，采用上游默认，不把推荐值暗中填进请求。通用 CLI 参数与字段对应：

- `--prompt` / `--prompt-file` → `content[].text`；纯参考素材可不传 prompt。
- `--image` + `--image-role` → image_url；多模态图显式使用 reference_image。
- `--video` → video_url，固定 reference_video；`--audio` → audio_url，固定 reference_audio。
- `--generate-audio` / `--no-generate-audio` → generate_audio；`--return-last-frame` → return_last_frame。
- `--web-search` → tools 中的 web_search；`--watermark` → watermark=true。
- `--seed` → seed（-1 至 4294967295）；`--priority` → priority（0–9）；`--execution-expires-after` → execution_expires_after（3600–259200）；`--callback-url` → callback_url；`--safety-identifier` → safety_identifier（最多 64 字符）。这些参数沿用既有接口校验，上游仍裁决具体支持范围。

### 任务约束

| 任务 | 素材与参数 |
| --- | --- |
| 文生视频 | 仅文本，不传 omni_reference_task_type |
| 首帧／首尾帧 | 1 个 first_frame，可加 1 个 last_frame；ratio 省略或 adaptive；与 reference 素材互斥 |
| 参考生视频 | reference_image/video/audio 至少一项；可显式 reference |
| 自动识别任务 | 至少一项参考素材，显式 auto 或不指定；模型可能识别为编辑／延长，仍须满足相应限制 |
| 编辑 | 至少一个 reference_video；ratio 省略或 adaptive，duration 省略或 -1；待编辑视频 4–30 秒 |
| 延长 | 至少一个 reference_video；ratio 省略或 adaptive；duration 为 4–30 或 -1 |

单张无 role 图片按首帧处理；多图或混合素材需明确 role，避免歧义。脚本校验参数组合，不按关键词改写用户 prompt；编辑／延长意图与素材时长仍需 Agent 核对，服务端可能异步报错。

## 示例（预检）

```sh
node "<技能目录>/scripts/ark-media.js" video-create --model seedance-2.5 \
  --prompt "镜头缓缓穿过雨后森林" --duration 30 --resolution 1080p --dry-run

node "<技能目录>/scripts/ark-media.js" video-create --model seedance-2.5 \
  --audio "input/music.mp3" --omni-reference-task-type reference --duration 20 --dry-run

node "<技能目录>/scripts/ark-media.js" video-create --model seedance-2.5 \
  --prompt "编辑视频1，将背景改成黄昏，保持人物动作" \
  --video "https://example.com/source.mov" --omni-reference-task-type edit \
  --ratio adaptive --duration -1 --output-format mov --dry-run
```

查询成功后的 MOV 扩展名根据响应 output_format 或 video_url 路径识别；URL 无后缀且响应无格式字段时显式用 `video-query --output-format mov`。它只选择保存格式标签，不转码；不要把 MOV 写为 MP4。预检未联网时无法获知真实输出格式。

## 素材限制

- 图片：jpeg/png/webp/bmp/tiff/gif/heic/heif；宽高比 0.4–2.5，边长 300–6000 px，单张小于 30 MB。
- 视频：mp4/mov，URL 或 asset ID；单段 2–30 秒，编辑任务 4–30 秒；最多 10 段、总时长不超过 30 秒、单段不超过 200 MB；FPS 24–60。宽高比 0.4–2.5、边长 300–6000 px、总像素 407696–8295044。
- 音频：wav/mp3，可用 URL、data URI 或 asset ID；单段 2–30 秒，最多 10 段、总时长不超过 30 秒、单段不超过 15 MB。
- 请求体不超过 64 MB，大素材用 URL／asset ID。本地预检只校验数量、扩展名和参数组合，未测量媒体时长、尺寸、帧率或全部字节限制。
- 官方教程声明不支持直接上传含真人人脸的参考图／视频；涉及肖像素材按官方[肖像创作指引](https://ark.volcengine.com/region:cn-beijing/docs/ark/seedance-portrait-asset-guide)及用户授权处理，不绕过平台限制。

## 能力边界

- Draft 样片及以 draft_task 生成成片的工作流暂未接入，脚本拒绝对应未知选项。
- 2.5 未配置本地价格，price JSON 的单价和估价为 null；不套用 2.0 费率，当前报价按官方价格页核实。
- 未知模型／Endpoint ID 仍原样传递，但采用旧版保守校验，不能据此启用 2.5 专属参数；需要 2.5 时使用上述明确 ID／别名。
- 仅用户要求优化视频 prompt 时读取[提示词参考](prompt-guide.md)和官方[2.5 指南](https://docs.volcengine.com/docs/ark/doubao-seedance-2-5-prompt-guide?lang=zh)；不将 2.0 的经验建议当作 2.5 硬性规则。
