# 渲染与排错

## 渲染脚本做什么

`render_strudel_wav.js` 用 Playwright 驱动无头 Chrome 打开 Strudel REPL（默认 `https://strudel.cc/`）：

1. 等编辑器与默认声音表就绪，点击编辑器解锁音频（REPL 在首次点击前不会完成求值）。
2. 不播放地求值源码，查询 `[start, end)` 的全部起音事件；带 `--loop` 时再查询下一遍逐事件比较，并对照声音表与 orbit 设置生成预检报告。
3. 预检失败或 `--check-only` 时到此结束；否则按标签填写 Export 面板（文件名、起止 cycle、采样率、最大复音），关闭 Multi Channel Orbits，点击 Export to WAV 并保存下载。

浏览器实时播放的录音不能代替这条离线导出。2026-10 实测：64 秒、7 层作品全程约 45 秒，4 小节短循环约 12 秒。含 room 与采样的测试曲两次渲染 RMS 差小于 0.01 dB，但样本不逐位相同（最大差约 1.2% 满幅）；无混响的纯合成器测试曲逐位一致。交付以本次渲染的校验结果为准。

## 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--source` | 必填 | `.strudel.js` 源码 |
| `--start-cycle` / `--end-cycle` | 必填 | 渲染区间，1 cycle = 1 小节 |
| `--output` | 渲染时必填 | 须以 `.wav` 结尾；已存在时拒绝写入 |
| `--check-only` | 关 | 只预检，不导出 |
| `--loop` | 关 | 核对 `[end, 2×end−start)` 与 `[start, end)` 逐事件一致 |
| `--overwrite` | 关 | 允许覆盖已存在的输出 |
| `--sample-rate` | 48000 | 导出采样率 |
| `--polyphony` | 256 | 最大复音；丢音时提高（REPL 自身默认 1024） |
| `--timeout-seconds` | 600 | 等待下载的上限 |
| `--list-sounds <正则>` | — | 只列出匹配的声音名，不需要源码 |
| `--repl-url` | `https://strudel.cc/` | 其他 Strudel 部署 |
| `--chrome` / `CHROME_PATH` | 自动查找 | Chrome、Chromium 或 Edge 可执行文件 |
| `--playwright` / `PLAYWRIGHT_MODULE` | 自动查找 | playwright 或 playwright-core 模块路径；依次查任务目录与全局安装 |

退出码：0 成功；1 预检失败或运行错误；64 参数错误。stdout 只有一个 JSON，进度写 stderr。

## 预检报告

| 字段 | 含义 |
| --- | --- |
| `ok` / `failures` | 求值错误、区间内无事件、未知声音名、`--loop` 不一致时为失败 |
| `durationSeconds`、`cps` | 区间实际秒数与速度，与规格对照 |
| `sounds` | 每个声音（含 bank）的事件数和出现小节，如 `"1-4,9-12"` |
| `unknownSounds` | 声音表里没有的名字，渲染时这些事件静音 |
| `orbitConflicts` | 同一 orbit 内 roomsize、delaytime 等共享参数取值不同 |
| `emptyBars` | 没有任何新起音的小节 |
| `loop.mismatchBars` | 下一遍与第一遍不一致的小节 |
| `warnings` | 不阻止渲染的提示 |

渲染结果另含 `output`、`bytes` 与 `exportConsoleIssues`（导出期间的加载错误等控制台信息）。

## 排错

| 现象 | 处理 |
| --- | --- |
| `Strudel evaluation failed` | 按报错修语法、未定义函数或 mini-notation 括号 |
| `unknownSounds` | `--list-sounds` 查替代名；鼓机缺音时换 bank 或去掉 bank |
| `loop.mismatchBars` | 补齐层长度、核对 arrange 段长合计、去掉按时间取值的随机 |
| `durationSeconds` 不符 | 核对 `setcpm(BPM / 拍数)` 与 `--end-cycle` |
| `orbitConflicts` | 空间设置不同的层改用不同 orbit |
| `export panel changed` | Strudel 界面改版；报告报错中的字段列表，或用 `--repl-url` 指向可用部署 |
| 找不到 Playwright 或 Chrome | 按报错安装或传路径，报告缺失项，不声称已生成音频 |
| 下载超时 | 先报告；确认需要后再提高 `--timeout-seconds`，或减少层数与复音 |
| 丢音、声音被截断 | 提高 `--polyphony` 后重渲染 |
| `exportConsoleIssues` 有采样加载失败 | 换内置合成器或其他库，再重渲染 |
| 输出已存在 | 换新文件名；只有本次任务生成、尚未交付的文件才用 `--overwrite` |

控制台里与导出无关的警告不影响成品；成品是否可用以 WAV 校验为准。

## 增强双循环

单循环渲染的开头听不到上一遍末尾的混响、延迟和长尾。需要时渲染两遍长度并截取第二遍：

```bash
node "<技能目录>/scripts/render_strudel_wav.js" --source strudel/<曲名>.strudel.js \
  --output renders/<曲名>-2x.wav --start-cycle 0 --end-cycle <2×小节数> --loop
bash "<技能目录>/scripts/extract_second_loop.sh" renders/<曲名>-2x.wav output/<曲名>.wav <循环秒数> [采样率]
```

前提是第二遍与第一遍内容相同，所以 `--loop` 必须通过。截取脚本保留输入的 PCM 位深，输出已存在时退出码 73；需要 bash、ffmpeg 与 ffprobe。实测 4 小节测试曲首尾样本跳变从 0.0099 降到 0.0002 满幅。

## WAV 校验

`validate_wav.py` 输出 JSON：`duration_seconds`、`sample_rate`、`sample_width_bits`、`channels`、`peak_dbfs`、`rms_dbfs`、`clipped_samples`、`clipped_runs`、`boundary_jump_full_scale`。

- 失败：文件缺失或无法解析、压缩格式、采样率不符、非 1／2 声道、静音（RMS < −80 dBFS）、时长偏差超过一帧（可用 `--duration-tolerance` 调整），以及连续满幅样本（`clipped_runs` > 0）。
- 提示：峰值余量不足 1 dB；首尾样本跳变超过 0.1 满幅（只是接缝提示，不等于听感判断）。

## 采样与许可

渲染依赖第三方站点 strudel.cc 及其默认采样库（VCSL、tidal-drum-machines、Dirt-Samples、GM 音色库、钢琴等，`--list-sounds` 的 `library` 字段标明来源）。各库许可不同，本技能未核对；商用或公开发布前按实际用到的库查看许可证。只用合成器（sine、sawtooth、square、triangle、噪声等）的作品不含第三方采样。站点不可用或改版时脚本会失败，可用 `--repl-url` 指向其他 Strudel 部署（未验证）。
