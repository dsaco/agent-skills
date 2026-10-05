# 计费与 LLM 接入

## 套餐与费用

**2026-10-05 文档快照**。报价先识别实际套餐与个人／团队归属，按[当前价格](https://exe.dev/pricing)核对：

| 套餐 | 文档要点 |
| --- | --- |
| [Personal](https://exe.dev/docs/billing/personal.md) | 起步 $15/月，2 vCPU／4 GB、100 GB 磁盘、200 GB 出站流量，最多 50 台 VM；资源由账户共享，无每月 Shelley credits |
| [Work](https://exe.dev/docs/billing/work.md) | 团队最低 $150/月，含 4 vCPU／8 GB；额外容量每 2 vCPU 每小时 $0.105；非按人数收费，磁盘／流量超额另计 |
| [legacy Individual](https://exe.dev/docs/billing/individual.md)／[Team](https://exe.dev/docs/billing/team.md) | 先确认账户适用性，再查对应额度与收费规则 |

费用清单分别列基础容量、standalone VM、超额磁盘／流量，以及任务涉及的备份和外部服务。平台团队成员与应用最终用户是不同概念，应用登录／RBAC 由业务实现。

## 额度查询

exe.dev 控制入口的查询模板：

```text
billing credits
billing credits usage --group=box
billing credits transactions
billing rewards
```

[billing 命令页](https://exe.dev/docs/cli-billing.md)说明 usage 可按 model／day／box 分组，支持 `--month`、`--detail`。`billing credits buy`、`billing capacity` 分别涉及购买／容量变更；自动购买等未列于该页的操作，先查当前 `help billing`。

## LLM 来源与附着

[LLM Integration](https://exe.dev/docs/integrations-llm.md)（同日核对）区分 managed、API Key、个人 OpenAI 的 ChatGPT subscription、自定义 HTTPS 端点及 Disabled 等来源。按实际 provider／账户确认可选项：managed 使用 exe.dev allocation，其他来源按对应服务的账单和订阅限制判断。

个人 integration 使用 `https://<name>.int.exe.xyz`，团队使用 `https://<name>.team.exe.xyz`，均从附着 VM 内访问。附着范围与平台托管机制见[跨 VM 集成](integrations.md)，凭据配置遵守[授权与凭据边界](../SKILL.md#boundaries)。

## 模型与协议

在获准查询的目标 VM 内读取模型清单，`llm` 替换为实际 integration 名：

```sh
curl -fsS https://llm.int.exe.xyz/v1/models
```

逐项核对模型 ID、来源、可用 API 与计费主体。当前官方示例用 `/v1/responses` 调用 OpenAI、`/v1/messages` 调用 Anthropic；通用 `/v1` 按模型路由，也支持 `/openai`、`/anthropic`、`/fireworks/inference` 等 provider 前缀。价格可参考[网关模型表](https://exe.dev/llm-gateway-models.json)，并核对账户费率。

模型清单是发现依据，不证明一次实际调用必定成功。可用性测试按变更流程取得调用与费用授权；空 `messages` 或非法请求也不能保证免费。外部网关需要受控隧道／代理时，按[代理排查](proxy-auth.md#信任边界与排查)验证访问路径。
