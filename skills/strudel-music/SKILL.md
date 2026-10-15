---
name: strudel-music
description: Strudel 编曲与 WAV 渲染：用户要纯音乐、BGM、游戏或循环配乐，或给出 BPM、拍号、时长、风格等制作要求时使用，无需提到 Strudel；也用于修改、换速、重渲染已有 .strudel.js。人声演唱与单个音效不适用。
compatibility: Node.js 22+；Playwright（playwright 或 playwright-core）与本机 Chrome／Chromium／Edge；Python 3；需联网访问 strudel.cc；双循环截取另需 bash 与 ffmpeg。
---

# Strudel 音乐制作

把需求写成确定性的 Strudel 源码，用 strudel.cc 自带的 Export to WAV 离线渲染并校验，交付的是音频文件而非示例代码。脚本以 `<技能目录>/scripts/...` 的绝对路径调用，输入输出相对用户任务 cwd：源码 `strudel/`、成品 `output/`、中间文件 `renders/`，项目已有结构时沿用。

## 选择分支

| 需求 | 路径 |
| --- | --- |
| 新作品 | 1–6 |
| 修改、变体、换 BPM 或时长 | 先读原源码与头部规格，另存新版本文件名，再走 1–6 |
| 只要源码 | 1–3，交付时写明“尚未生成音频” |
| 已有 WAV 只做校验 | 5 |

## 流程

1. **定规格。** 从原话提取 BPM、拍号（默认 4/4）、时长（精确或大约）、是否循环、风格／情绪／场景、主奏乐器与禁用元素、输出格式（默认 WAV · 48 kHz · 立体声）。1 cycle = 1 小节；运行 `python3 "<技能目录>/scripts/calculate_timing.py" --bpm <BPM> --beats-per-bar <拍数> --seconds <秒>` 取得 setcpm 值和整小节方案。“大约 N 秒”保持 BPM 与拍号，取最接近且乐句合理的整数小节；“精确 N 秒”而小节数非整数时，按用户已表达的优先级改 BPM 或保留不完整末小节，并说明取舍。只在参数冲突且优先级不明、风格自相矛盾、或需要用户未提供的采样时提问。**完成：一行可同时成立的规格，例如 `90 BPM · 4/4 · 24 小节 · 64 秒 · 无缝循环`。**

2. **写源码。** 读[编曲参考](references/composition.md)和[音色参考](references/sounds.md)，写 `strudel/<曲名>.strudel.js`：头部注释写规格、配器和段落计划（每层出现在哪些小节），`setcpm(BPM / 每小节拍数)`，每层单独成组，总线 `stack(...).compressor(...).postgain(...)`。修改已有作品时另起版本文件名（如 `-v2`），已有源码与音频保持原样。**完成：源码已保存，段落计划写在注释里，每层长度等于总小节数或其约数。**

3. **预检。** `--loop` 核对下一遍与第一遍逐事件一致，非循环作品去掉它：

   ```bash
   node "<技能目录>/scripts/render_strudel_wav.js" --source strudel/<曲名>.strudel.js \
     --start-cycle 0 --end-cycle <小节数> --check-only --loop
   ```

   按 `failures` 修复后重跑；逐个对照 `sounds[*].bars` 与段落计划；按 `warnings` 处理 orbit 冲突和空小节。字段含义与排错见[渲染与排错](references/rendering.md)。**完成：`ok` 为 true，`durationSeconds` 等于规格秒数，每个声音的小节分布与段落计划一致。**

4. **渲染。** 先告知渲染秒数与 cycles、输出路径、普通单循环还是增强双循环，再用与预检相同的参数执行（渲染前会自动重跑预检）：

   ```bash
   node "<技能目录>/scripts/render_strudel_wav.js" --source strudel/<曲名>.strudel.js \
     --output output/<曲名>.wav --start-cycle 0 --end-cycle <小节数> --loop
   ```

   默认单循环。只有用户要求效果尾音跨接缝连续，或试听确认接缝有问题时，才用增强双循环（耗时约翻倍，开始前说明）：渲染 `0 → 2×小节数` 到 `renders/`，再执行 `bash "<技能目录>/scripts/extract_second_loop.sh" renders/<双循环>.wav output/<曲名>.wav <循环秒数>`。已存在的输出默认拒绝写入；只有覆盖本次任务生成、尚未交付的文件时才加 `--overwrite`。**完成：退出码 0，输出 JSON 含 `output` 与 `bytes`；失败或超时先报告原因，再决定是否重试。**

5. **校验 WAV。**

   ```bash
   python3 "<技能目录>/scripts/validate_wav.py" output/<曲名>.wav --expected-seconds <秒> --expected-rate 48000
   ```

   **完成：`ok` 为 true（可解析、时长在一帧内、采样率正确、非静音、无连续满幅削波）；每条 warning 已处理或写进交付说明。削波时降低 postgain 或失真量，回到第 4 步加 `--overwrite` 重渲染。**

6. **交付。**

   ```text
   已生成：<输出路径>
   规格：<BPM> BPM · <拍号> · <小节数> 小节 · <实际秒数> 秒
   音频：WAV · <采样率> · <位深> · <声道> · 峰值 <peak> dBFS · RMS <rms> dBFS
   源码：<源码路径>
   校验：预检（含循环一致）与 WAV 校验结论；未试听的听感写明未验证
   ```

   用户提到商用或公开发布时，提示采样库许可需另行核对（见[渲染与排错](references/rendering.md#采样与许可)）。**完成：每个交付文件都有路径和校验结论；只有源码时写明“尚未生成音频”。**
