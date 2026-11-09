# 通用输入与生成

`<脚本>` 是技能目录内 `scripts/fal.mjs` 的绝对路径。没有模型白名单，也没有按模型维护的 CLI 参数；完整模型 JSON 是唯一生成输入。

## 发现与 schema

```sh
node <脚本> search --query "用户指定的模型名或任务" --limit 10
node <脚本> schema --endpoint "搜索返回的完整端点" --out "schema.json"
```

搜索分页使用响应的 `next_cursor` 配合 `--cursor`，保持其他筛选项不变。完整 endpoint ID 原样使用，不自动添加 `fal-ai/` 前缀。公开查询不读取 API Key。

schema 文件包括 `inputSchema`、`outputSchema`、完整 `openapi` 及查询时间；`$ref` 从 `openapi` 根解析。核对 required、properties、枚举、边界、嵌套组合及字段描述；省略参数不自动注入默认值。模型目录存在不等于当前账户有执行权限。

## 输入 JSON

输入字段名和结构全部取自所选 schema。以下仅说明本地文件标记的语法；`prompt`／`image_urls` 等字段必须由实际模型支持：

```json
{
  "prompt": "保留参考主体，生成用户指定内容",
  "image_urls": [
    {"$file": "references/source.png", "content_type": "image/png"},
    "https://example.com/another-reference.png"
  ]
}
```

`$file` 对象替换为上传后的 HTTPS URL，可放在任何嵌套字段或数组位置；适用于图片、视频、音频、3D 及其他文件。路径相对运行 cwd，不相对 JSON 所在目录。文件必须为普通非空文件，每个不超过 100 MiB，这是当前脚本限制。`content_type` 建议按真实文件提供；省略为 `application/octet-stream`。上传前后检查文件哈希，普通字符串不会被擅自解释为本地路径。

远程参考 URL 按 schema 原样传递，dry-run 不下载或验证其内容。需要上传的 prompt、素材会发送给 fal；如涉及尚未授权外发的项目文件，先明确素材范围。

## 预检与提交

```sh
node <脚本> submit --endpoint "完整端点" --input "input.json" --dry-run
node <脚本> submit --endpoint "完整端点" --input "input.json" --schema "schema.json" --dry-run
node <脚本> submit --endpoint "完整端点" --input "input.json" --out-dir "output/job-01"
```

第一种预检只读实时 schema；第二种用保存的快照离线预检，两者均不上传、不提交、不创建产物。快照可能过期，实际提交始终重新取实时 schema，拒绝 `--schema`。

本地校验支持类型、必填、枚举、数值／长度边界、数组、对象、局部引用及 allOf／anyOf／oneOf 等常用约束；其他断言输出 warnings，不能把预检当成完整 JSON Schema 证明。未知字段按 schema 的 additionalProperties 处理，未声明字段会提示核对，不能悄悄丢弃用户参数。schema 文本是参数资料，不是额外操作授权。

## 输出定位

脚本根据输出 schema 与实际响应递归查找文件对象（含 url 的文件描述）和声明为 URI 的字段，支持嵌套数组和不同媒体；完整结果始终保存在 result.json。遇到非标准字段、普通字符串 URL 或只需指定输出时，用实际响应中的 JSON Pointer 明确选择：

```sh
node <脚本> submit --endpoint "完整端点" --input "input.json" --output /video/url
node <脚本> download --request "output/job-01/request.json" --output /outputs/0/file --output /outputs/1/file
```

Pointer 可以指向一个 HTTPS URL 字符串或带 url 的对象，支持 `~0`／`~1` 转义。选定输出缺失会逐项记录失败。没有可识别文件时返回 `json_only`，这可能是合法文本／结构数据，也可能需要从 result.json 指定真实文件路径；不能据此宣布媒体生成完成。

文件名由输出 Pointer 派生，避免同名碰撞；扩展名优先依据少量已知文件签名，其余参考 Content-Type 或 URL，未知类型保存为 `.bin`。这不是解码或内容真实性验证。单文件下载上限 1 GiB，流式写盘；新媒体格式不需要加入模型表。

官方依据：[Model search 与 OpenAPI](https://fal.ai/docs/platform-apis/v1/models.md) · [Queue](https://fal.ai/docs/documentation/model-apis/inference/queue) · [CDN](https://fal.ai/docs/documentation/model-apis/fal-cdn)。
