# strudel-music

用 Strudel 代码编曲，借 strudel.cc 自带的 Export to WAV 离线渲染，并校验时长、格式、削波与循环一致性。适用于纯音乐、BGM 和游戏循环配乐；不针对特定题材或项目，不是 Strudel 官方项目。

## 依赖

- Node.js 22+。
- Playwright：`playwright` 或 `playwright-core`，全局或任务项目内安装均可；脚本使用本机 Chrome／Chromium／Edge，不下载浏览器。
- Python 3：计时计算与 WAV 校验。
- 能访问 `https://strudel.cc/` 的网络。
- 增强双循环截取另需 bash、ffmpeg 与 ffprobe。

技能不自动安装依赖，缺失时脚本报错并说明缺什么。

## 安装

完整复制本目录，保留 SKILL.md、references、scripts、package.json 与 LICENSE；`package.json` 固定 CommonJS，避免上层 `"type": "module"` 影响 `.js` 脚本。

```sh
npx skills add dsaco/agent-skills --skill strudel-music
npx skills add "<本地仓库路径>/skills/strudel-music"
```

## 使用

从任务工作目录运行，`<技能目录>` 换成本目录的绝对路径：

```sh
python3 "<技能目录>/scripts/calculate_timing.py" --bpm 90 --seconds 64
node "<技能目录>/scripts/render_strudel_wav.js" --list-sounds '^gm_'
node "<技能目录>/scripts/render_strudel_wav.js" --source strudel/track.strudel.js --start-cycle 0 --end-cycle 24 --check-only --loop
node "<技能目录>/scripts/render_strudel_wav.js" --source strudel/track.strudel.js --output output/track.wav --start-cycle 0 --end-cycle 24 --loop
python3 "<技能目录>/scripts/validate_wav.py" output/track.wav --expected-seconds 64
```

制作流程见 [SKILL.md](SKILL.md)，参数、预检字段与排错见[渲染与排错](references/rendering.md)。

## 离线测试与许可

在本目录运行 `npm test`：使用临时目录和合成 WAV，不启动浏览器、不联网；Python、bash、ffmpeg 缺失时对应用例跳过。实际渲染依赖 strudel.cc 当前版本，仅在 macOS 上实测过。

原创文档与脚本采用 [MIT](LICENSE)，不覆盖 Strudel、strudel.cc 及其采样库；渲染成品中的采样许可见[采样与许可](references/rendering.md#采样与许可)。
