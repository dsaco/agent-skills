# qiniu

将本地文件上传到七牛云对象存储并拼接访问 URL。没有内置 Bucket、域名或账户，不针对任何应用定制。

## 四个环境变量

| 变量 | 含义 | 真实上传 | dry-run |
| --- | --- | --- | --- |
| `QINIU_ACCESS_KEY` | 七牛 Access Key | 必填 | 不读取 |
| `QINIU_SECRET_KEY` | 七牛 Secret Key | 必填 | 不读取 |
| `QINIU_BUCKET` | 目标存储空间名称 | 必填 | 必填 |
| `QINIU_DOMAIN` | 该空间绑定的 HTTPS 访问域名，如 `https://cdn.example.com` | 必填 | 必填 |

四项均无默认值，缺失或空白时上传在联网前失败。脚本不加载 `.env`；由用户本地启动环境注入四项，不把密钥发送到聊天或命令参数。详细校验与凭据规则见[配置与运行](references/upload.md)。

## 安装与命令

完整安装本目录，需要 Node.js 22+。真实上传依赖官方 `qiniu@7.15.2`（MIT）；SDK 不随 Skill 分发。用户确认后，在 **Skill 目录**自行执行：

```sh
npm install --omit=dev --ignore-scripts
```

根仓库的 `npm test` 不会安装依赖。此 Skill 的 help、dry-run 和离线测试不加载 SDK；实际执行缺依赖时报告错误，不自动安装。

从用户任务工作目录运行：

```sh
node "<技能目录>/scripts/upload.js" --help
node "<技能目录>/scripts/upload.js" --file "input/image.png" --dry-run
node "<技能目录>/scripts/upload.js" --file "input/image.png"
```

预检需本地已注入 `QINIU_BUCKET` 和 `QINIU_DOMAIN`。文件命名、失败处理与 SDK 行为见[配置与运行](references/upload.md)。

## 离线测试与许可

在本 Skill 目录执行 `npm test`，仅使用 SDK 替身与临时文件。真实上传、CDN 访问、账户权限和跨平台行为需另验收。

原创整理文档与脚本采用 [MIT](LICENSE)；第三方 SDK 使用其自身许可证。本技能不授予七牛账户、存储／流量配额或上传素材权利。
