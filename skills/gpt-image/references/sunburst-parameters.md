# Sunburst 参数实测

2026-11-27，当前 sub2api 网关，模型 `gpt-image-2.6-sunburst`。本轮发起 11 次同步 Images API 请求，全部返回 HTTP 200。另引用同一路线此前的 GIF、透明背景和精确尺寸样本。以下结论限此次路线、端点和所测取值。

| 参数 | 状态 | 观察 |
|---|---|---|
| `model`、`prompt`、`response_format=b64_json` | 保留 | 指定模型后成功获取可解码的成图。响应中的模型名仅作网关记录。 |
| `images[].image_url` | 保留 | 用本地图片编码的 data URL 完成单图编辑。双参考图的两个蓝圆和橙色三角均出现在结果中。 |
| `output_format=png`、`background=transparent` | 保留 | 此前编辑样本输出 RGBA PNG，约 53% 像素完全透明。提示词也要求透明。 |
| `n` | 保留单张 | 两次请求 2 张（含一次单独测试），均仅收到 1 张。 |
| `size` | 精确宽高不可靠 | 请求 1024×1024 得到 1536×1024。此前请求 2048×2048 得到 1254×1254，请求 2048×1152 得到 1672×941。交付按文件像素核对。 |
| `output_format=gif`、`frame_count`、`frame_duration_ms` | 原生 GIF 当前不支持 | 此前组合请求 HTTP 400，本轮按用户确认标记。帧数、帧时长没有可验证的动图输出。 |
| `output_format=jpeg/webp/svg` | 本轮未得到目标格式 | 三次请求全部返回 PNG，已按文件内容核对。JPEG 和 WebP 同时传了压缩值 42。 |
| `output_compression=42` | 已接受，压缩效果未验证 | JPEG、WebP 请求均返回 PNG，无法验证目标编码的压缩设置。 |
| `quality` | 只观察到 low | 分别传 low、medium、high，同次搭配同档 complexity，响应 quality 均为 low。未量化画质差异。 |
| `complexity` | 三档均被接受，效果未验证 | low、medium、high 均出图，响应没有回报复杂度。 |
| `mask` | 定位不可靠 | 输入为两个蓝圆，蒙版左圆处透明，其余不透明。结果右圆变绿，左圆未变。 |
| `markup` | 定位不可靠 | 标注图用红框圈右圆，结果左圆变橙，右圆未变。 |
| `input_fidelity=high` | 已接受，效果未验证 | 与蒙版一同提交可出图，无法单独归因。 |
| `style=vivid`、`moderation=auto` | 已接受，效果未验证 | 都能提交并出图。风格差异和审核档位效果未做独立验证。 |
