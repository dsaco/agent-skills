# 受保护字符串分发

这是安全架构建议，不是 exe.dev 自带业务功能或已验收实现。先确认接收者类型、必须交付的内容和保密目标；无需交付原文时，优先代调用或上游支持的短期限权凭据。采用 peer 时读取[跨 VM 集成](integrations.md)。

```text
管理员 → 私有 A：保存字符串、管理业务授权
客户端 → 公开 B：固定路由、限流、转发
                  → peer → 私有 A：独立校验业务凭证后返回授权内容
```

## 数据与授权

- 业务 token 与平台 token 分开。建议 CSPRNG 生成 32 字节随机数，仅签发时交付原文；A 保存 SHA-256 摘要，绑定记录范围、到期、撤销状态及必要的用户／次数约束。
- 摘要用于高熵 token 校验；认证比较来访 token 的摘要，而非接受数据库摘要作为 bearer secret。低熵密码使用密码哈希方案，字符串内容的哈希也不能替代凭证。
- A 每次独立校验记录范围和业务身份，一次性／次数限制用原子事务；B 仅能调用所需读取端点，管理接口独立授权。
- 需要取回的原文采用认证加密，数据、备份与解密密钥分别保护；运行中的 A 被控制后，静态加密无法保护正在处理的明文。

## 能力边界

B 被攻破仍能截获经过它的 token 和返回内容并在有效期内重放；双 VM 只缩小暴露面，也不隔离平台账号失陷。明文交付后，接收者可以保存或转发；撤销 token 只能阻止以后读取，已泄露上游密钥需到上游轮换。

## 暴露面与验收

| 对象 | 设计与可检查条件 |
| --- | --- |
| 代理 | B 固定上游、方法和路径；任意 URL／Host 输入不能转成通用代理，B 无管理或全库访问权 |
| 凭证 | 请求头传递，日志／APM／埋点脱敏；URL 不含凭证 |
| 响应 | 敏感响应 `Cache-Control: no-store` 且代理／CDN 不缓存；这是缓存约束，不妨碍接收者保存 |
| 浏览器 | 按 JSON／纯文本展示；会话 Cookie 用 HttpOnly、Secure、适当 SameSite 并防 CSRF；长期 bearer 避免存入 localStorage，CORS 不作为认证 |
| 身份与限流 | 管理员强认证，必要时 MFA；高价值内容可绑定登录／二次确认；限流和授权在 A 也有效 |
| 业务拒绝 | 无效／过期／撤销 token、跨记录／租户请求、一凭证并发重复兑换分别被拒绝 |
| 平台隔离 | 未附着 VM、伪造来源头及管理端点拒绝结果按集成参考检查 |
| 恢复 | 独立加密备份、恢复演练和告警有结果，单靠持久磁盘不能承诺 RPO／RTO |

按[主流程](../SKILL.md#workflow)逐项报告设计依据或实测结果，测试数据与执行授权遵守[安全边界](../SKILL.md#boundaries)。

安全依据：[OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)、[OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)。
