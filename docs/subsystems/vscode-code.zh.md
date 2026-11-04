# 内嵌 VS Code（Code 模式）

[English](vscode-code.md) | 中文

内嵌 VS Code 功能为 Web GUI 侧边栏增加了 **Code** 模式。选中它时，中央主面板从会话切换为运行在 iframe 中的 VS Code Web 工作台，用户无需离开 harness 即可浏览和编辑当前会话的工作区。该功能完全由 Cordis 插件组成；没有任何 harness 代码路径为它特判，移除任一插件即可禁用 Code 模式。

来源：[`packages/client/ui-vscode-panel`](../../packages/client/ui-vscode-panel/README.zh.md)、[`packages/bundle/web-app/src/vscode-static.ts`](../../packages/bundle/web-app/src/vscode-static.ts)、[`apps/web/vscode.html`](../../apps/web/vscode.html)

## 插件组成

功能拆分为独立插件，使每层都能独立演进和禁用：

| 插件（cordis 行） | 职责 |
|---|---|
| `ui-vscode-panel`（`@deepseek-ai/dsh-client-ui-vscode-panel`） | 在根作用域 `main` 槽位注册 `code` 条目；渲染指向 `/vscode?session=…` 的工作台 iframe。 |
| `ui-sidebar`（`@deepseek-ai/dsh-client-ui-sidebar`） | 拥有 Work/Code `ModeSwitch`；仅当 `code` 面板已注册时才切到 Code。 |
| `vscode-static`（位于 `web-app` 内） | 在 `/vscode` 前缀路由提供 VS Code Web 载荷，位于索引认证之后，处理路径穿越与 MIME。 |
| `vscode-extension`（`dsh-workspace`，第二阶段） | VS Code 扩展，注册 `dsh://` FileSystemProvider，使工作台读写会话工作区。 |
| Host 写 RPC（第二阶段） | `workspace-files.write`（或 `fs.editText`）以版本守卫支持编辑器保存。 |

移除任一插件都会优雅降级：没有 `ui-vscode-panel` 时 ModeSwitch 留在 Work；没有 `vscode-static` 时 iframe 显示宿主错误页；没有扩展时工作台打开空临时工作区。

## 数据存储

内嵌 VS Code 产生的全部数据——用户设置、快捷键、扩展、全局状态以及空临时工作区——都存储在 **`$DSH_HOME/codemode/`** 下，而非浏览器默认的 IndexedDB/localStorage 或系统 VS Code 用户数据目录。`$DSH_HOME` 通过 [`dsh-home-paths`](../../packages/util/home-paths/src/index.ts) 解析（显式覆盖 → `$DSH_HOME` → `~/.danke-harness`）。

后果：

- harness 全部用户数据共用一个根；备份、迁移和清理像对待 `attachments/`、`cache/` 等 `$DSH_HOME` 子目录一样对待 `codemode/`。
- 不依赖浏览器存储配额或按源隔离的 IndexedDB；数据在浏览器配置重置后仍然保留，并可在相同 `$DSH_HOME` 的机器间迁移。
- 宿主通过 FileSystemProvider 将 `vscode-userdata`（或等价）协议回溯到 `codemode/` 树，取代工作台默认的 IndexedDB 后端；工作台收到该提供器而非默认提供器。
- 秘密与凭据从不存入 `codemode/`，继续经由凭据 seam 流动。

## 工作台引导

`apps/web/vscode.html` 以 `_VSCODE_FILE_ROOT = /vscode/vscode/` 与 `_VSCODE_WEB.builtinExtensions = []` 引导工作台，排除 github1s 自带 AI 扩展，避免加载第二个 AI 界面。它从 `?session=` 查询推导工作区：会话 id 变为 `dsh://<sessionId>/`，否则为 `tmp:/default.code-workspace` 空工作区。页面向父窗口发送 `{channel:'dsh-code', type:'ready'|'boot', sessionId}`，以便宿主观察就绪状态。

## 为什么用插件而非特判

Code 功能涉及侧边栏、主面板槽位、HTTP 载体、会话工作区，以及（第二阶段）文件系统 seam。以插件实现使每个关注点留在其归属包中，框架的常规生命周期——注册、卸载时的清理、覆盖率门禁、i18n 门禁与 cordis 组合——全部自动适用。`ModeSwitch` 占位守卫（未注册 `code` 面板时 `selectPanel('code')` 被拒绝）是唯一集成点，因此没有 `ui-vscode-panel` 的宿主无法进入 Code 模式。

## 验收

- Code 模式将中央面板切到 iframe，Work 模式切回会话。
- 工作台从 `/vscode` 加载，无 404，渲染空编辑器。
- 用户数据写入 `$DSH_HOME/codemode/`，从不写入浏览器存储或系统 VS Code 目录。
- 移除 `ui-vscode-panel` 或 `vscode-static` 后 harness 其余功能正常。
