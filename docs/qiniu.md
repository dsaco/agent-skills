# qiniu 来源与验证

## 来源与许可

从本地已安装 qiniu 的 SKILL.md、scripts/upload.js 和 package.json 整理，保留名称与命名行为。三份源文件摘要见[源码摘要](qiniu-source.json)，不代表发布签名。未复制 node_modules、原依赖锁文件、任务记录或真实配置，未修改原副本。

源目录未附独立 LICENSE；原创整理内容及脚本按仓库规则补充 MIT。上传依赖官方 [qiniu/nodejs-sdk](https://github.com/qiniu/nodejs-sdk/tree/v7.15.2)，[npm 7.15.2 元数据](https://registry.npmjs.org/qiniu/7.15.2)声明 MIT；仅声明依赖，不复制 SDK 源码。固定直接依赖版本，但未提交传递依赖锁定，安装解析结果可能随上游依赖更新；未执行依赖安全审计或真实安装验收。

## 配置与行为调整

- 四个环境变量全部参与真实上传：QINIU_ACCESS_KEY、QINIU_SECRET_KEY、QINIU_BUCKET、QINIU_DOMAIN。移除源文件内的固定 Bucket 和域名，无回退值。
- 预检只读取 Bucket／Domain；缺 Key 不妨碍预检，真实上传缺任一项均在 SDK 加载／网络前失败。错误只列缺失变量名。
- Node.js 22+，局部 package.json 固定 CommonJS，避免父仓库 ESM 配置影响 `.js` 入口。SDK 延迟加载，help／dry-run／离线测试无需安装。
- HTTPS 上传固定启用；交付域名须为 HTTPS origin。保留 --https 兼容选项、显式 --accelerate。
- 保留默认 ai/本地日期/UUID.ext，--name 优先于 --keep-name，--dir 仅用户要求时使用。拒绝路径穿越／控制字符／符号链接文件，URL 分段编码。
- 上传 token 限定 bucket:key、有效期 600 秒、insertOnly=1。已核对官方 [PutPolicy](https://github.com/qiniu/nodejs-sdk/blob/v7.15.2/qiniu/storage/rs.js) 和[上传策略](https://developer.qiniu.com/kodo/1206/put-policy)。覆盖旧文件不是当前能力。
- 已核对官方 [Config](https://github.com/qiniu/nodejs-sdk/blob/v7.15.2/qiniu/conf.js) 和 [FormUploader](https://github.com/qiniu/nodejs-sdk/blob/v7.15.2/qiniu/storage/form.js)：SDK 自动查区域，putFile 可能在域名／区域间重试。文档明确区分 SDK 内部重试与脚本重新上传，不作“仅一次网络请求”保证。
- 成功输出过滤为 bucket/key/hash/URL 等指定字段；SDK 错误不原样打印，避免错误对象中的 token 泄漏。上传前输出非凭据计划，结果未知用该 key 核查，禁止换 UUID 自动重传。
- URL 仅拼接，未探测 CDN、不改变 ACL、不生成私有下载签名；上传成功不保证公开可访问。

## 验证

macOS / Node.js 24.14.0：仓库 `npm test` **45 项通过**，含新增 7 项七牛测试、1 项仓库结构检查。测试使用假环境变量、临时目录和 SDK 替身。

覆盖四变量逐项缺失／空白、预检不读取密钥、非法域名、Bucket、文件名／前缀／URL 编码、默认日期、仅新增策略、HTTPS／加速配置、SDK 错误脱敏、异常结果、中文空格独立目录及无 SDK 提示。

未安装 SDK、未调用七牛真实上传／区域 API、未读取真实密钥或 .env。替身测试不证明实际 SDK 网络重试、CDN 访问、存储计费、内容完整性、权限、Node.js 22 或 Windows 已验收。源文件摘要核对可确认本地原副本未修改。
