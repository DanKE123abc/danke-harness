---
description: "Windows Git Bash 执行器：在解析出的 Git for Windows bash 上挂载官方 bash 工具，在 compat 下非受限运行并上报 compat 执行事实。"
kind: "package-reference"
---

# @deepseek-ai/dsh-gitbash-sandbox

[English](README.md) | 中文

## 摘要

在 Windows 上使用 `dsh-gitbash-sandbox`，让模型拥有真正的 bash，而不改变 harness 的进程模型。Git for Windows（MSYS2）无法在 DSH 的 Windows 受限令牌沙箱内启动（已知 Win32 错误 5 / 0xC0000142），因此该执行器通过解析出的 Git for Windows `bash.exe` **非受限**运行每条命令（在 `compat: auto` 下），并在结果上标注 compat 说明。它是 `dsh-bash-sandbox` 的 Windows 孪生，也是 win32 上的默认 `ctx.shell`；`dsh-pwsh-sandbox` 保持挂载但禁用，以便配置可重新启用。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当模型应通过 Git Bash 运行 `bash` 工具时，在 Windows 上挂载此执行器以替代 `dsh-bash-sandbox`。它注册为 `ctx.shell`，发现可用的 Git for Windows bash，并通过继承的子进程路径运行每条 `['<bash>', '-c', command]`。在非 Windows 主机上它不会被挂载（base 补丁将其禁用）。

### 仅限 Windows

Git Bash 解析仅适用于 `win32`。在 Windows 之外，解析器返回 `no Git for Windows bash found` 原因，此执行器不被挂载；受限的 POSIX `dsh-bash-sandbox` 路径服务 `ctx.shell`。

### compat（非受限）选择

由于 Git Bash 无法在受限环境下存活，`compat` 字段使非受限成本显式化，而不是静默削弱承诺：

| `compat` | `danger-full-access` | `workspace-write` | `read-only` |
|---|---|---|---|
| `auto`（默认） | 正常运行 | **非受限**运行，标注 `[compat: ...]` | 拒绝（`SANDBOX_UNAVAILABLE`） |
| `strict` | 正常运行 | 拒绝（`SANDBOX_UNAVAILABLE`） | 拒绝（`SANDBOX_UNAVAILABLE`） |

被拒绝的模式抛出 `SANDBOX_UNAVAILABLE`；工具会暴露它，模型可升级到 `danger-full-access`。非受限运行绝不静默：结果携带 `sandbox: { mode, denied: false, unconfined: true }`，模型面向的工具会追加 compat 说明。

### 最小配置

```yaml
- id: gitbash-sandbox
  name: '@deepseek-ai/dsh-gitbash-sandbox'
  config:
    timeoutMs: 60000
    compat: auto # auto | strict
    # bashPath: C:\\Program Files\\Git\\bin\\bash.exe # optional explicit Git Bash
```

### Git Bash 发现

解析器依次尝试：显式 `bashPath`、标准 Git for Windows 安装根、`PATH` 上的 `bash.exe`、以及 Git for Windows 注册表 `InstallPath`。它拒绝 WSL（`System32`、`Sysnative`、`WindowsApps`、`\\wsl$`），因此不会静默使用 WSL bash。终端表面（`dsh-terminal-bash`、`dsh-api-terminal-controller`）共享同一解析器，因此侧边栏与持久终端会打开模型工具所运行的同一个 Git Bash。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

本节解释执行器的设计并指向实现它的代码；可观察行为在[使用本包](#use-this-package)中完整覆盖。

### 设计概念

执行器扩展 `dsh-bash-sandbox` 的 `SandboxBashExecutor`，并覆写 `execute()` 在任何 spawn 前决定路由。纯函数 `gitBashRoute()` 将解析后的模式、`compat` 选择与平台映射为 `delegate`（非 Windows 回退到受限路径）、`run`（正常受限路径）、`unconfined`（非受限运行并标注结果）或 `refuse`。Bash 发现位于 `bash-path.ts`，带有可注入的 `BashPathIO`，使整条链可单元测试。

### 源码映射

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`GitBashSandboxExecutor`、路由决策、compat 事实 |
| [`src/bash-path.ts`](src/bash-path.ts) | Git Bash 发现：配置 → 默认根 → PATH → 注册表 |
| [`src/compat.ts`](src/compat.ts) | `gitBashRoute` 路由矩阵与 `compatNote` 标记 |
| `tests/` | 路由矩阵、发现链、执行器行为 |

### 不变量

- **绝不静默非受限运行** — `auto` 标注每个非受限结果；`strict` 拒绝 `danger-full-access` 以下的任何模式。
- **失败关闭** — 执行器无法满足的模式以 `SANDBOX_UNAVAILABLE` 拒绝；没有不带标注的回退非受限运行。
- **仅限 Windows** — 执行器仅在 `win32` 上挂载；在 Windows 之外，路由委托给受限的 POSIX 路径。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当执行器契约不够时，请阅读以下页面。

- [shell seam](../shell/README.zh.md) — 本提供方实现的执行器约定，包括请求/spec 拆分。
- [bash-sandbox](../bash-sandbox/README.zh.md) — 本执行器扩展的受限 POSIX 孪生。
- [tool-bash](../tool-bash/README.zh.md) — 面向模型的 `bash` 工具及其升权面。
- [terminal-bash](../../terminal/terminal-bash/README.zh.md) — 打开 Git Bash 的持久终端。
- [沙箱参考](../../sandbox/sandbox/README.zh.md) — 沙箱设计、升权与切换约定。

-----

<a id="model-experience"></a>
## 模型体验

### Bash 工具结果（间接）

#### 模型看到什么

非受限的 Git Bash 运行会在普通输出与退出标记之后追加 `[compat: bash runs outside the DSH file sandbox (session mode <mode>)]`。被拒绝的模式从沙箱接缝传播 `SANDBOX_UNAVAILABLE` 错误。

#### 令牌影响

普通运行除常规输出外零额外令牌。仅当发生非受限运行时，compat 标签才添加引用的条件标记。

#### KV 缓存影响

仅追加；新可见内容遵循可复用请求前缀，不使现有 KV 缓存条目失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制定义了此执行器何时不是通用安全边界。

- **在 `compat: auto` 下非受限** — Git Bash 无法在 DSH 的 Windows 受限令牌沙箱内运行，因此 `auto` 故意以 harness 的完整文件权限运行它。`strict` 模式与 `danger-full-access` 是替代；`read-only` 始终拒绝。
- **仅限 Windows** — Git Bash 解析与 compat 路径仅适用于 `win32`；其他平台使用受限的 `dsh-bash-sandbox` 执行器。
- **发现依赖安装布局** — 非标准 Git for Windows 安装需要显式 `bashPath`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
