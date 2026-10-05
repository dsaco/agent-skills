# 分享、邀请与团队权限

2026-10-05 核对下列官方资料。命令均为 exe.dev 控制入口模板；从本地调用时前置 `ssh exe.dev`，通用约束按[授权与凭据边界](../SKILL.md#boundaries)。

## VM 分享

| 需求 | 命令 | 权限与边界 |
| --- | --- | --- |
| 查询 | `share show <vm> --json` | 逐 VM 查询当前分享 |
| 私有网站访问 | `share add <vm> <email>` | Web 权限，不含 shell；未注册邮箱可收到邀请 |
| SSH／Terminal／Shelley | `share add <vm> <email> --root` | Root 含 Web，要求已有账号，VM 所有权不变 |
| Root 降为 Web | `share remove <vm> <email> --root` | 保留 Web |
| 撤销个人分享 | `share remove <vm> <email>` | 包含 Root；另查是否仍通过团队获得访问 |
| 生成分享链接 | `share add-link <vm>` | 接受后仅授予 Web |
| 撤销分享链接 | `share remove-link <vm> <token>` | 阻止新人接受；已接受者需单独撤销 |

只需一台 VM 权限时选邮箱级分享；接收者可看到分享者邮箱。Root 可读写／删除 VM 内全部内容，授予前由用户确认敏感凭据是否已隔离，检查限于风险和就绪状态。更窄的程序访问可评估 [VM token](proxy-auth.md#程序访问-token)。

分享验收核对每个“VM × 接收者 × 权限级别”，撤销时同时检查独立个人、团队及已接受链接的授权路径；未验证的访问路径明确列出。

来源：[Sharing](https://exe.dev/docs/sharing.md)、[share 命令](https://exe.dev/docs/cli-share.md)。

## 团队权限

- 管理员可查看、SSH、删除、重命名或复制成员 VM；billing owner 的可见性与具体操作权限分别核对。仅隔离一台 VM 时，团队成员身份不是邮箱级分享的替代。
- `team vm ls` 查看团队 VM；`share add <vm> team [--root]` 随团队成员变化授予访问。离开团队后，独立个人分享仍可能有效。
- `share remove <vm> team --root` 撤销团队 Root，独立配置的 Web 分享可能仍在；需要时用 `share remove <vm> team` 撤销 Web。
- Web-only 不授权复制；`team settings vm-sharing admins-only` 限制普通成员对外分享／公开，不影响团队内部分享。用 `team settings` 查询当前策略。

来源：[Team VMs](https://exe.dev/docs/teams/vms.md)、[Sharing controls](https://exe.dev/docs/teams/sharing-controls.md)。

## 邀请与奖励

| 机制 | 入口 | 用途 |
| --- | --- | --- |
| Trial invites | `invite manage`、`invite request` | 单次注册试用邀请，申请更多取决于套餐 |
| Invite rewards | `invite rewards`、`invite set-reward <reward>`、`invite show` | 可复用链接，被邀请者升级付费后双方获奖 |
| 团队邀请 | 当前 `help team` 与团队后台 | 团队成员关系，而非单 VM 分享 |

奖励选择变更后链接保持稳定，新注册者采用新奖励，已注册者保留原绑定。种类和数额查当前 `invite rewards`；进度与已获奖励分别查 `invite activity`、`billing rewards`。邀请申请、选择奖励和发邀请属于变更，不混入这些查询。

官方邀请页写明 30 天试用；扣费日期、取消截止、退款及团队邀请有效期按当前条款核实。咨询交付时将这些未确认项列为未知。

来源：[Invites](https://exe.dev/docs/invites.md)、[invite 命令](https://exe.dev/docs/cli-invite.md)。
