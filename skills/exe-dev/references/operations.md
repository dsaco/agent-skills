# 操作检查

本文件提供 SSH／部署特有检查项，执行顺序与停止点统一按[工作流程](../SKILL.md#workflow)。

## 查证与执行位置

命令标明执行位置：**本地**运行 SSH／传输工具；**exe.dev 控制入口**接受 `billing`、`share` 等平台命令；**目标 VM**运行项目及 Linux 命令。

- 公开资料从[文档索引](https://exe.dev/docs.md)、[页面清单](https://exe.dev/llms.txt)选取 `docs/<slug>.md` 正文。控制台页面需要登录，登录跳转不是 API 故障依据。
- 获准远程查询后，用当前帮助核对命令；资料冲突时记录差异，按适用于当前账户／版本的证据判断。

```sh
# 本地 → exe.dev 控制入口
ssh -o BatchMode=yes exe.dev help share
ssh -o BatchMode=yes exe.dev doc sharing

# 本地 → 目标 Linux VM
ssh -o BatchMode=yes <ssh-target> 'hostname; whoami; pwd'

# 本地：核对已有配置；输出可能包含个人路径与用户名
ssh -G <ssh-target>
```

## SSH 与跨平台终端

- 依次定位 DNS、网络、主机密钥、认证、远端命令；`ssh -v` 只截取必要的脱敏诊断。
- 先检查本机 `ssh`、`scp` 可用性；Windows 的 `rsync`／WSL 是可选环境，缺少时报告依赖或使用现有替代工具。
- PowerShell 的 `curl` 可能是别名，核对实际程序后选择 `curl.exe` 或匹配的 PowerShell 参数。POSIX 引号／续行按实际 shell 改写。
- `getent`、`systemctl` 等在具备工具的目标 Linux VM 内使用；路径含空格时逐参数引用，复杂命令优先使用经审阅的脚本而非多层插值。

## 传输与部署检查项

| 检查对象 | 需要核对的内容 |
| --- | --- |
| 工作区 | 本地／远端未提交改动；本次版本、源码目录、运行目录与持久数据目录 |
| 传输 | 源到目标的方向、尾部斜杠语义；明确排除凭据、任务数据和跨平台依赖 |
| 服务 | 从当前项目配置取得服务名、实际监听端口及 systemd／Docker 等管理方式；重启范围只含受影响服务 |
| 恢复 | 可恢复的原版本／配置；数据迁移有独立确认和恢复依据 |
| 应用验收 | 项目测试、VM 内健康端点、用户实际访问路径逐项记录；内外结果分开判断 |

已有 rsync 时的本地预演模板：

```sh
rsync -av --dry-run ./ <ssh-target>:<remote-path>/
```

`--dry-run` 仍连接远端，且不自动添加排除规则；先准备过滤清单再决定正式传输。删除目标文件必须作为单独批准的变更；需要过滤时选支持过滤的工具，不能用整目录复制代替。

## 访问问题定位

VM 内检查 `http://127.0.0.1:<port>`，本地检查实际公网 URL、DNS、TLS 与授权结果。两者分别证明应用健康和访问链路的不同部分。代理、隧道与身份头的验证边界见[代理排查](proxy-auth.md#信任边界与排查)。
