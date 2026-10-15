# 音色参考

## 声音表

2026-10-15 在 strudel.cc 实测，默认声音表共 1655 个名字：鼓机 1329（tidal-drum-machines，130 余个 bank 名，含别名）、VCSL 原声采样 128、GM 音色 125（`gm_*`）、合成器 25、基础鼓组 16、mridangam 13、Dirt-Samples 10、wavetable 7、钢琴与音频输入各 1。站点更新会改变这张表，**以预检和 `--list-sounds` 为准**：

```bash
node "<技能目录>/scripts/render_strudel_wav.js" --list-sounds '^gm_(flute|violin|string)'
```

每项给出 `name`、`type`；`variants` 是可用 `n` 选择的样本数，`pitched` 表示多音高采样（可直接 `note()` 演奏），`library` 是来源库。名字大小写不敏感；写错或缺失的名字渲染时静音，预检会报 `unknownSounds`。

## 按角色选音色

数值为起点，按风格调整：

| 角色 | 写法 | 增益 |
| --- | --- | --- |
| 主脉冲 | `bd` 加 bank；`.lpf(1100–1800).shape(.08–.14)`；强弱 `.gain(".85 .6 .72 .55")` | .7–.9 |
| 合成撞击 | `note("g1").s("sine").decay(.2).sustain(0).penv(26).pdecay(.1)` 加 `.distort("1.8:.55")` | .4–.6 |
| 嗵鼓、手鼓 | `lt mt ht` 加 bank，`.crush(11–12).lpf(2300–2600)`；或 VCSL 打击乐 `.clip(.45–.65)` | .35–.6 |
| 木质、金属点缀 | `rim cb`，`.hpf(420–760).lpf(3600–5000).crush(7–9)`，配 `.pan(".2 .8 .35 .7")` | .15–.35 |
| 高频纹理 | `pink`／`white` 极短包络 `.attack(.001).decay(.015–.035).sustain(0).release(.01–.02).hpf(2300–3900).lpf(7000–9000)`；或 hh、shaker、tambourine | .03–.15 |
| 合成低音 | `sawtooth`：`.decay(.14–.28).sustain(.08–.12).release(.06–.1).lpf(220–310).lpq(5–9).lpenv(2–2.5).lpd(.07–.14).distort("1.1:.5")`；同一 pattern 再叠一层 `sine` 作次低音 | .25–.4 |
| 采样低音 | `gm_acoustic_bass`、`gm_fretless_bass`、`gm_slap_bass_1`、`gm_synth_bass_2`，`.clip(.6–.8).lpf(1300–2400)` | .14–.19 |
| 主旋律 | `triangle`／`sine` 加 FM：`.fm(1.2–2.4).fmh(1.5–2).fmdecay(.08–.16).fmsustain(0)`，复古感再加 `.crush(9–12)`；或下方采样乐器 `.clip(.5–.7)` | .1–.27 |
| 和声 | `"[c4,e4,g4] ~ [a3,c4,e4] ~"` 配 `gm_epiano1` 等 `.clip(.8–.9)`；或 `folkharp`、`kalimba` 分解和弦 | .08–.12 |
| 铺底 | 和弦长音 `sawtooth` `.attack(.9).release(.6).lpf(700)`，或 `gm_pad_*` | .05–.1 |
| 句尾点缀 | 4 小节乐句末一两个高音：`glockenspiel`、`handbells`、`handchimes` | .03–.05 |
| 环境声 | 稀疏放置，`.speed(.4–.8)` 降调加深 | .06–.15 |

每层 `.orbit(n)` 单独编号；多个空间设置相同的环境声可 `stack(...)` 后共用一个 orbit。

## 鼓机

- 不带 bank 的 `bd sd hh oh cp rim cb lt mt ht cr rd sh tb misc brk` 来自基础鼓组。
- `.bank("RolandTR808")` 与音名组合成 `<bank>_<音>`；每台机器的音不全，缺的音静音：

| bank | 可用音（括号内为样本数） |
| --- | --- |
| `RolandTR808` | bd(25) sd(25) hh oh(5) cp(5) rim cb(2) lt(5) mt(5) ht(5) cr(25) perc(16) sh(2) |
| `RolandTR909` | bd(4) sd(16) hh(4) oh(5) cp(5) rim(3) lt(9) mt(9) ht(9) cr(5) rd(5)，无 cb |
| `RolandTR606` | bd sd hh oh lt ht cr，无 cp、rim、mt、cb |
| `RolandTR707` | bd(2) sd(2) hh oh cp rim cb lt mt ht cr tb |
| `linndrum` | bd sd(3) hh(3) oh cp rim(3) cb lt(2) mt ht(2) cr rd sh tb perc(6) |

其余机器（如 `AkaiLinn`、`EmuSP12`、`OberheimDMX`、`CasioRZ1`、`KorgMinipops`）用 `--list-sounds '^korgminipops_'` 查看。

## 合成器

`sine sawtooth square triangle`（别名 `sin saw sqr tri`）、`supersaw`、`pulse`；噪声 `white pink brown crackle`；另有 `z_*` 系列与 wavetable `wt_*`。

## 旋律采样

- GM 音色（全部可 `note()`）：键盘 `gm_piano gm_epiano1 gm_epiano2 gm_harpsichord gm_clavinet gm_celesta gm_music_box`；敲击 `gm_vibraphone gm_marimba gm_xylophone gm_glockenspiel gm_tubular_bells gm_steel_drums gm_kalimba gm_dulcimer`；弦乐 `gm_violin gm_viola gm_cello gm_string_ensemble_1 gm_pizzicato_strings gm_orchestral_harp`；管乐 `gm_flute gm_recorder gm_pan_flute gm_ocarina gm_clarinet gm_oboe gm_trumpet gm_french_horn gm_brass_section gm_alto_sax`；合成 `gm_lead_1_square`…`gm_lead_8_bass_lead`、`gm_pad_warm gm_pad_choir gm_pad_halo gm_pad_sweep`；人声音色 `gm_choir_aahs gm_voice_oohs`；民族 `gm_sitar gm_koto gm_shamisen gm_shakuhachi gm_banjo`。
- VCSL 多音高采样：`kalimba`（另有 `kalimba2`–`kalimba5`）`marimba vibraphone vibraphone_soft glockenspiel xylophone_medium_pp balafon tubularbells handchimes wineglass folkharp harp steinway piano1 organ_full pipeorgan_quiet recorder_alto_stacc recorder_alto_sus ocarina_small_stacc sax harmonica`；另有独立的 `piano`。

## 打击与环境采样

- VCSL 打击乐与单音采样（用 `n` 或 `名:序号` 选样本）：`framedrum slitdrum bongo conga cajon darbuka timpani tom_mallet tom_stick snare_modern woodblock clave cowbell agogo triangles tambourine shaker_small shaker_large cabasa guiro sleighbells marktrees gong sus_cymbal oceandrum handbells didgeridoo`。
- Dirt-Samples 只有 `casio crow east insect jazz metal num numbers space wind`。旧教程常见的 `birds`、`tabla2`、`voodoo` 不在默认表中；鸟鸣可用 `gm_bird_tweet`，雨声、海浪用 `gm_fx_rain`、`gm_seashore`。
- 自备采样必须能通过 URL 访问（服务器需允许跨域），用 `samples({...})` 或 `samples('github:<用户>/<仓库>')` 注册后再预检；本技能未验证这条路径。
