# 跨 VM 集成与凭据托管

2026-10-05 核对[跨 VM 网络](https://exe.dev/docs/faq/cross-vm-networking.md)、[VM-to-VM](https://exe.dev/docs/integrations-vm-to-vm.md)、[HTTP Proxy](https://exe.dev/docs/integrations-http-proxy.md)、[附着](https://exe.dev/docs/integrations-attach.md)及[Integrations](https://exe.dev/docs/integrations.md)。

## 通信与托管机制

同账号 VM 也默认隔离。HTTP 调用优先评估 peer；非 HTTP 协议按需评估受控 SSH 隧道或 VPN，分别确认依赖和授权。

peer 是带 `--peer` 的 HTTP Proxy integration：平台生成仅限目标 VM 的凭证，在网络边缘注入，目标代理消费；两端 VM／应用都不读取该凭证。普通 HTTP Proxy／LLM 也可托管上游凭据；这表示平台持有密钥，配置按[凭据边界](../SKILL.md#boundaries)处理。

## 配置与附着

目标必须是用户拥有或有访问权限的 VM；先核对 `help integrations`，按[变更流程](../SKILL.md#workflow)实施。以下示例中名称、端口和健康端点均需替换：

```sh
# 本地 → 控制入口：创建并附着 peer
ssh exe.dev integrations add http-proxy --name read-private-a --target https://private-a.exe.xyz:3000/ --peer --attach vm:public-b

# public-b VM 内：检查目标健康端点
curl -fsS http://read-private-a.int.exe.xyz/healthz
```

目标可保持 private。附着支持 `vm:<name>`、`tag:<tag>`、`auto:all`；敏感用途选明确 VM，tag／auto 还需评估未来新增 VM 的访问范围。生成 key 标记为 `peer-<integration name>`，删除 integration 同时删除它，需检查依赖调用方。

HTTP Proxy target URL 不接受业务路径；`--strip-prefix` 仅做静态路径改写，ACL 由业务端实现。

## 机器身份与最小权限

- 平台验证绑定目标 VM 的短期签名证明后设置 `X-Exedev-Source-Vm`，覆盖来源伪造值，并在其他平台代理入口剥离该头；绕过代理直达应用的路径不在此保证内。
- 该头标识来源 VM。VM 上任意代码都可使用已附着 integration，因此目标应用还需校验业务用户／token、路径、方法和记录级权限。
- 管理接口与机器读取接口分别授权；公开源 VM 仅持有所需读取能力，避免平台管理凭据、跨 VM 私钥或全库权限。读不到密钥仍可滥用可调用的服务，计费和共享范围要按实际 integration 核对。

验收按“来源 VM × 目标端点 × 允许／拒绝结果”逐项检查，包括未附着 VM、伪造来源头、业务越权和目标公开性。不能验证的项按主流程交付为未验证。
