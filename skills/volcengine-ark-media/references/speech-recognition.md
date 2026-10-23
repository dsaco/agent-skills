# 豆包录音文件识别 2.0

本分支是豆包语音服务，接口域名为 `openspeech.bytedance.com`。与 Seedream／Seedance 的方舟接口分开鉴权，不自动复用 `ARK_API_KEY`。

## 凭据与输入

- 新版语音控制台：配置 `VOLCENGINE_SPEECH_API_KEY`，发送为 `X-Api-Key`。
- 旧版语音控制台：配置 `VOLCENGINE_SPEECH_APP_ID` 与 `VOLCENGINE_SPEECH_ACCESS_TOKEN`。两者齐全才使用；新版 Key 优先。
- 脚本只读进程环境变量，不自动加载 `.env`，不接受命令行密钥。凭据存在不代表已开通服务；只在实际授权转写时调用。
- 输入为服务可访问的 HTTP(S) 音频 URL；支持 mp3、wav、ogg、raw，扩展名无法判断时传 `--format`。`raw` 应为符合官方要求的 PCM，默认 16kHz／16bit／单声道。
- 本地文件需先在已获授权的存储上托管，再传 URL；本脚本不自动上传。视频先提取音轨。需要上传时沿用用户授权的上传工具和目标，不擅自选公开托管。
- `--language` 可指定官方语言码；不指定时使用服务默认识别。`--speakers` 开启说话人分离，详细信息保留在 JSON；SRT 不添加推测的角色名。

## 执行与恢复

从用户任务 cwd 调用，所有路径相对该 cwd；`--out-dir` 必须是不存在的新目录。

```sh
node "<技能目录>/scripts/ark-media.js" audio-transcribe --audio-url "https://example.com/audio.mp3" --out-dir output/transcription-01 --dry-run
node "<技能目录>/scripts/ark-media.js" audio-transcribe --audio-url "https://example.com/audio.mp3" --out-dir output/transcription-01
node "<技能目录>/scripts/ark-media.js" audio-query --job output/transcription-01/job.json
```

1. 预检确认音频来源、格式、输出位置和用户转写授权。`--dry-run` 不需要 Key、不联网、不写文件，不证明音频可访问或可识别。
2. 正式提交一次。脚本在请求前保存 `job.json` 的 UUID，再保存 `submit.json`；提交超时或结果不明时保留 UUID，转入查询，不重复提交。已有输出目录会拒绝新提交。
3. 查询一次返回 `queued`／`processing`／`succeeded` 或错误。仅查进度时到此结束；要求取回成品时，可每隔 10 秒查一次，最多等待 10 分钟，超出后交付任务记录和待处理状态。鉴权、额度、静音音频及其他终态错误应停止，读取保存的 `query.json` 排查。
4. 成功保存 `result.json`、`transcript.txt`；存在有效分句时间戳时还生成 `transcript.srt`。缺少分句时明确报告无字幕文件；时间戳非法则保留 JSON 并报错。对照音频抽查文本和字幕同步，未抽查须明确说明，不能把导出成功当成识别准确。

文本后处理启用标点与数字规范化，关闭删除语气词的语义顺滑；字幕按接口分句导出，不额外自动压缩、重排或分行。

已有成功 `result.json` 可离线重新导出，无需 Key、无需再转写：

```sh
node "<技能目录>/scripts/ark-media.js" audio-export --result output/transcription-01/result.json --out-dir output/transcription-export-01
```

查询保留最近查询响应，成功结果单独保留；TXT／SRT 已存在且内容不同则拒绝覆盖，改用新目录导出。任务文件不记录 Key 或原始音频 URL，但转写内容本身仍是用户数据。

## 官方依据与验证范围

- [录音文件识别标准版 HTTP](https://www.volcengine.com/docs/6561/1354868)：模型资源 `volc.seedasr.auc`、submit／query、鉴权、参数和结果结构。
- [语音 API Key 控制台](https://console.volcengine.com/speech/new/setting/apikeys?projectName=default)。
- [官方计费](https://www.volcengine.com/docs/6561/1359370)：2026-10-23 查阅，2.0 按量价 0.8 元／音频小时；费用以账户当前计费为准。

实现范围为标准版异步录音识别，不包含实时流式录音、极速同步接口或自动上传。离线测试使用假凭据和网络替身，不代表真实账户权限、识别效果或 Ark Key 通用性验证。
