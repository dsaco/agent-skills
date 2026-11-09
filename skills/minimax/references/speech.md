# 语音与音色

## 选用能力

| 动作 | 用途 | API |
| --- | --- | --- |
| voices | 获取系统／已激活自定义音色列表 | POST /v1/get_voice |
| speech | 用指定voice_id朗读台词 | POST /v1/t2a_v2 |
| voiceDesign | 从文字描述生成新声音及试听 | POST /v1/voice_design |
| upload | 上传克隆源／示例音频，获取file_id | POST /v1/files/upload |
| voiceClone | 从上传的源音频克隆声音，返回可选试听 | POST /v1/voice_clone |

`speech`的情绪、语速、pitch是已有音色的表现控制；不把这些参数当作任意年龄／声线设计。要按性别、年龄和声音质感造新声音，用voiceDesign；要复用用户确认的样音，用voiceClone。每个候选保留自己的请求、源音频说明和试听，不自动标为正式采用。

## 配音

`speechInput.json`示例（voice_id只是官方示例，实际应使用用户选定音色）：

```json
{
  "model": "speech-2.8-hd",
  "text": "官家坠井了！快救驾！",
  "stream": false,
  "output_format": "hex",
  "voice_setting": {"voice_id": "male-qn-qingse", "speed": 1, "vol": 1, "pitch": 0},
  "audio_setting": {"sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1},
  "subtitle_enable": true
}
```

```sh
node "<技能目录>/scripts/minimax.mts" voices --out outputs/voiceList
node "<技能目录>/scripts/minimax.mts" speech --input speechInput.json --out outputs/line01 --dryRun
node "<技能目录>/scripts/minimax.mts" speech --input speechInput.json --out outputs/line01
```

voices默认查询all；指定类型时用`--input`传`{"voice_type":"system"}`等。音色列表保存在response.json；自定义音色未正式合成激活前可能尚不出现在列表中。

TTS文本小于10000字符，本工具仅非流式；长文本按语义分段，或另行接入官方异步／流式接口。可传`pronunciation_dict`、`language_boost`、`voice_modify`等官方参数；不把不支持的自然语言字段当作模型控制项。输出支持MP3/WAV/PCM/FLAC；PCM无容器头，交付前按实际采样率和声道封装，不能只改扩展名。字幕是官方JSON时间戳，本脚本保存原文件，不声称自动转成SRT。

## 文字设计声音

`designInput.json`：

```json
{
  "prompt": "男性，听感约六十岁。声音细而偏高，胸腔共鸣弱，带自然的老年干涩感。清楚克制地说话，不要青年播音腔。",
  "preview_text": "官家，外头风大，还是先回殿里歇息吧。臣还有一件事，要当面禀报。"
}
```

```sh
node "<技能目录>/scripts/minimax.mts" voiceDesign --input designInput.json --out outputs/voiceCandidate01 --dryRun
node "<技能目录>/scripts/minimax.mts" voiceDesign --input designInput.json --out outputs/voiceCandidate01
```

试听文本≤500字符；响应包含`voice_id`和hex试听音频。年龄／性别／性格属于目标描述，必须试听验证。比较候选用相同文本，先选基础音色，再探索情绪，避免音色与表演同时变化导致难以判断。语音设计和试听可能计费，费用以当前官方定价为准。

## 克隆

克隆源：MP3/M4A/WAV，10～300秒，≤20MB。使用用户授权且确认的清晰单人样音，避免背景音乐、混响和多人。基础克隆优先自然、稳定、覆盖多种发音的读法；情绪表演在后续台词合成中另测，不假定源音频越激动越好。

```sh
node "<技能目录>/scripts/minimax.mts" upload --file reference.wav --purpose voice_clone --out outputs/cloneSource --dryRun
node "<技能目录>/scripts/minimax.mts" upload --file reference.wav --purpose voice_clone --out outputs/cloneSource
```

取response.json中的file.file_id填入`cloneInput.json`，**文件ID用字符串保存，防止int64精度丢失**；脚本提交时转换成精确JSON整数。

```json
{
  "file_id": "123456789",
  "voice_id": "characterVoice01",
  "text": "官家，臣还有一件事，要当面禀报。",
  "model": "speech-2.8-hd",
  "need_noise_reduction": false,
  "need_volume_normalization": false
}
```

```sh
node "<技能目录>/scripts/minimax.mts" voiceClone --input cloneInput.json --out outputs/cloneCandidate01 --dryRun
node "<技能目录>/scripts/minimax.mts" voiceClone --input cloneInput.json --out outputs/cloneCandidate01
```

自定义voice_id为8～256字符，英文字母开头，允许字母数字、下划线和短横线，末尾字母或数字，不可与已有音色重复。提供text时model必填，试听≤1000字符。没有text也可克隆，届时不产生试听文件，不将无试听当作下载故障。

可选增强：上传一段短于8秒的示例音频，purpose为`prompt_audio`，再同时填写`clone_prompt.prompt_audio`（文件ID字符串）和`clone_prompt.prompt_text`（准确转写）。它与10～300秒的主克隆源用途不同。

克隆要求账户完成认证；官方注明克隆音色若7天内未正式调用会删除。试听不等于正式激活；正式合成及音色首次使用的费用需核实。保留源样音、ID与候选状态，不为激活而擅自额外合成。

来源：[TTS](https://platform.minimaxi.com/docs/api-reference/speech-t2a-http)、[音色设计](https://platform.minimaxi.com/docs/api-reference/voice-design-design)、[克隆](https://platform.minimaxi.com/docs/api-reference/voice-cloning-clone)、[上传主样音](https://platform.minimaxi.com/docs/api-reference/voice-cloning-uploadcloneaudio)、[上传示例](https://platform.minimaxi.com/docs/api-reference/voice-cloning-uploadprompt)、[音色列表](https://platform.minimaxi.com/docs/api-reference/voice-management-get)、[定价](https://platform.minimaxi.com/docs/pricing/overview)。
