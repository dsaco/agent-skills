# 图片与音乐

## 图片

`image` → `POST /v1/image_generation`，模型`image-01`／`image-01-live`。提示词最多1500字符，n为1～9。主体参考使用`subject_reference`，当前仅人物character，JPEG/PNG、小于10MB；本地路径可用`@./reference.png`。

```json
{
  "model": "image-01",
  "prompt": "水墨漫画风格的宋代宫殿庭院，清晨，横屏构图。",
  "aspect_ratio": "16:9",
  "response_format": "url",
  "n": 1,
  "prompt_optimizer": false
}
```

```sh
node "<技能目录>/scripts/minimax.mts" image --input imageInput.json --out outputs/image01 --dryRun
node "<技能目录>/scripts/minimax.mts" image --input imageInput.json --out outputs/image01
```

image-01可自定义width/height，二者同时传入、512～2048且为8的倍数；与aspect_ratio同时传时以aspect_ratio优先。image-01-live的style按官方字段填写。脚本对已知关键参数预检，其他官方字段保留并由服务端校验。

URL通常24小时有效，响应先落盘，再下载全部图片。实际数量小于n会保存已有图片并报告部分成功，不自动补生成。下载后识别JPEG/PNG/WebP扩展名；仍需解码／视觉检查。

来源：[文生图](https://platform.minimaxi.com/docs/api-reference/image-generation-t2i)、[人物参考图](https://platform.minimaxi.com/docs/api-reference/image-generation-i2i)。

## 音乐

**账户限制：**2026-10-24核对的官方文档注明，自2026-08-20起音乐付费API不再面向新用户，历史付费用户可继续使用；free接口已停止。先核实账户资格，不能把脚本入口视为新账户可用承诺，也不自动改用网页或本地模型。

`music` → `POST /v1/music_generation`。当前封装`music-3.0`和`music-2.6`非流式生成，不含翻唱。

```json
{
  "model": "music-3.0",
  "prompt": "克制的古风器乐，低沉弦乐与轻打击乐，营造朝堂对峙的紧张气氛。",
  "is_instrumental": true,
  "stream": false,
  "output_format": "hex",
  "audio_setting": {"sample_rate": 44100, "bitrate": 256000, "format": "mp3"}
}
```

```sh
node "<技能目录>/scripts/minimax.mts" music --input musicInput.json --out outputs/music01 --dryRun
```

确认用户已授权生成且账户符合条件后，去掉dryRun才提交。带人声歌曲提供lyrics（≤3500字符）；纯音乐需prompt（≤2000字符）。lyrics_optimizer=true且歌词为空时会让服务生成歌词，只有符合用户意图时启用。生成时长以响应／实际音频为准，不虚构未暴露的时长参数。

来源：[音乐API及服务范围公告](https://platform.minimaxi.com/docs/api-reference/music-generation)。
