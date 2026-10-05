# 端口、代理与登录认证

2026-10-05 核对[HTTP Proxies](https://exe.dev/docs/proxy.md)、[Login with exe](https://exe.dev/docs/login-with-exe.md)、[VM HTTPS tokens](https://exe.dev/docs/https-tokens-for-vms.md)。

## 端口与公开范围

- `https://<vm>.exe.xyz/` 由 exe.dev 处理 TLS，平台属于信任边界。默认代理端口参考 Dockerfile EXPOSE，优先 80；实施时从当前项目监听与分享配置确定实际端口。
- 额外端口 3000–9999 可经代理访问，但仅主代理端口可设为 public，额外端口仍要求 VM 访问权限。
- `X-Forwarded-Proto`、`X-Forwarded-Host`、`X-Forwarded-For` 还原外部请求信息；XFF 会保留此前值并附加平台代理看到的 IP，应用需按可信代理链解析。

```sh
# 本地 → 控制入口：查询当前配置
ssh -o BatchMode=yes exe.dev share show <vm>
```

`share port`、`share set-public`、`share set-private` 改变配置，按[变更流程](../SKILL.md#workflow)处理。

## 程序访问 token

VM token 的 namespace 限定到目标 VM；应用另行实现路径、方法和记录级授权。创建命令为 `ssh exe.dev ssh-key generate-api-key --vm=<vm> --label=<用途>`，有效期等参数以当前帮助为准，输出处理遵守[凭据边界](../SKILL.md#boundaries)。

| 认证方式／字段 | 平台语义与应用责任 |
| --- | --- |
| `X-Exedev-Authorization: Bearer <token>` | 推荐平台认证头，代理消费并移除 |
| `Authorization: Bearer` | 用作平台 token 已弃用；该头仍可保留给应用业务凭证 |
| Basic auth | VM 代理忽略用户名，以密码为 token；适用范围是 VM 代理 |
| `X-ExeDev-UserID`、`X-ExeDev-Email` | 平台验证后注入 exe.dev 账号身份，应用映射业务权限 |
| `X-ExeDev-Token-Ctx` | token 有 ctx 时注入签名来源的数据，应用校验其业务含义 |

双层认证分别使用平台专用头与业务 Authorization，并实测转发结果。

## Public 与 Private 登录

Private 入口先检查平台访问权限；Public 允许匿名，未登录时没有用户身份头，登录后可以有。应用按以下入口引导登录／退出，并校验重定向和会话：

- 登录：`https://<vm>.exe.xyz/__exe.dev/login?redirect=<path>`。
- 退出：POST `https://<vm>.exe.xyz/__exe.dev/logout`。

## 信任边界与排查

依次定位：应用监听与健康 → 代理端口／公开性 → DNS／TLS → 平台认证 → 业务授权。

- 身份头只有在可信且不可绕过的入口才可作为依据；同时检查其他监听端口、VM 内请求和隧道路径。
- 本地隧道 `ssh -N -L 8788:localhost:<port> <vm>.exe.xyz` 会开监听并连接 VM，应纳入授权动作；它绕过平台 HTTP 代理、不注入身份头，只能协助验证应用连通性。
- 本地伪造头只能覆盖应用逻辑。实际平台代理验收需分别检查获准用户、匿名请求和未授权身份的结果；权限不足或无隔离测试条件时列为未验证。
