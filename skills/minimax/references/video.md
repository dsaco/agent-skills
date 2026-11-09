# H3 视频

API：`POST /v2/video_generation`，查询：`GET /v2/query/video_generation/{task_id}`。

| model | resolution | 整数时长 |
| --- | --- | --- |
| MiniMax-H3 | 768P、2K | 4～15秒 |
| MiniMax-H3-Highspeed | 768P | 4～15秒 |
| MiniMax-H3-Lite | 480P、768P | 4～15秒 |
| MiniMax-H3-Max | 480P、768P | 5～15秒 |

不自动将本地量化H3、FastH3和云端型号等同。分辨率档位与输出实际宽高分别记录；接口未暴露的fps、采样器和采样步数不添加到请求。

## 请求示例

在用户任务目录保存`videoInput.json`。漫画角色图＋参考声音：

```json
{
  "model": "MiniMax-H3",
  "resolution": "768P",
  "duration": 5,
  "ratio": "16:9",
  "content": [
    {"type": "text", "text": "人物外貌参考图片1，声音音色参考音频1。人物抬头，焦急地喊：官家坠井了！快救驾！保留漫画画风。"},
    {"type": "image_url", "image_url": {"url": "@./character.png"}, "role": "reference_image"},
    {"type": "audio_url", "audio_url": {"url": "@./voice.wav"}, "role": "reference_audio"}
  ]
}
```

`@`是本脚本的本地文件标记，提交前转为data URI；相对路径以当前cwd为准。还支持HTTPS URL、平台`mm_file://ID`和data URI。不默认把素材传给其他存储平台。

文生视频只保留text项；固定首帧改用`role: first_frame`并设置`ratio: adaptive`，同时移除全部reference项；尾帧使用`last_frame`。

```sh
node "<技能目录>/scripts/minimax.mts" videoCreate --input videoInput.json --out outputs/shot01 --dryRun
node "<技能目录>/scripts/minimax.mts" videoCreate --input videoInput.json --out outputs/shot01
node "<技能目录>/scripts/minimax.mts" videoQuery --job outputs/shot01/request.json --wait 1800
```

## 素材与模式

- 固定首／尾帧与多模态参考互斥。参考语音搭配参考图或参考视频，不能同时锁定首帧。
- 参考语音可以用于音色参考；不保证原录音逐字、停顿、情绪或波形复现。视频提示词写清台词及声音与角色的对应关系；不是把TTS的voice_id直接塞进视频接口。
- 图片最多9张，每张≤30MB，宽高256～5760，宽高比0.4～2.5。
- 视频最多3段，每段2～15秒，总视频时长≤15秒；每个≤50MB，MP4/MOV，H.264/H.265，23.976～60fps；音轨AAC/MP3。
- 音频最多3段，每段2～15秒，总音频时长≤15秒；每个≤15MB，WAV/MP3。
- 混合参考合计≤12个；JSON体≤64MB，Base64会增加约三分之一大小。
- 文生视频明确ratio；固定首尾帧用adaptive；参考模式可指定16:9等。Lite参考模式不支持adaptive。
- 本地文件自动FFprobe检查。远程URL、平台文件ID、直接data URI需要由调用者核实技术规格；预检输出会标为未核实，最终仍由服务端校验。

## 提示词与费用

按顺序说明参考图／音频用于哪个人物；写清一个镜头的主体动作、起始状态、结束状态、镜头和声音。多镜头才增加连续的时间段，不给简单镜头强加复杂模板。用户已有完整分镜时保留原文，改动只针对冲突或明确授权的优化。

计费按实际生成素材量估算，包含成功生成但弃用的版本；不直接用最终剪辑长度作为生成量。单价从[官方定价](https://platform.minimaxi.com/docs/pricing/overview)核实，提交前明确model、resolution、duration和数量。任务失败是否收费以服务商账单规则为准。

来源：[视频生成](https://platform.minimaxi.com/docs/guides/video-generation)、[创建请求与限制](https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create)、[查询](https://platform.minimaxi.com/docs/api-reference/video-generation-v2-query)。
