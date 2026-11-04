---
description: "Web 代码面板：侧边栏 Work/Code 模式开关选中的中央主面板，内嵌 VS Code Web 工作台 iframe。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-vscode-panel

[English](README.md) | 中文

## Summary

本包提供内嵌代码编辑器的浏览器界面。侧边栏的 Work/Code 模式开关（来自 [`ui-sidebar`](../ui-sidebar/README.zh.md)）选中本插件的 `code` 主面板，该面板渲染一个 iframe，承载 `dsh web` 宿主机在 `/vscode` 路由提供的 VS Code Web 工作台。工作台通过 `dsh://` 文件协议打开当前主视图会话的工作区（第二阶段），无保留会话时打开其空临时工作区。`/vscode` 载荷与 vscode-static 前缀路由位于 [`web-app`](../../bundle/web-app/README.zh.md)，因此两个包需一同挂载。

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

在 Web 组合中与 [`web-app`](../../bundle/web-app/README.zh.md) 一同挂载本插件；两个 cordis.yml 行即可组合出内嵌代码编辑器，本行无需配置。注册插件会在根作用域 `main` 槽位发布 `code` 条目，这正是 Work/Code 开关选中的面板；缺少本行时开关停留在 Work，因为守卫会拒绝未注册的面板 id。面板占据会话本应占用的中央区域，开关切回 Work（清除所选面板）时会话恢复显示。

### What to expect

面板渲染一个占满中央主区域的全高 iframe。其 `src` 在主导视图保留会话时为 `/vscode` 加编码的 `?session=`，工作台随之加载该会话的工作区；无会话时加载空临时工作区。iframe 的 title 使用本地化的 `frame.title` 文案，辅助技术得以命名该编辑器。面板本身无按钮或外框，所有交互都在工作台内进行。

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

客户端半部（[`src/client/index.ts`](src/client/index.ts)）以 `key: 'code'` 注册 `main` 键控槽位且无子槽位，与其他主占用面板（如 [`ui-plugin-manager`](../ui-plugin-manager/README.zh.md)）的注册模式一致。占用组件 [`VscodePanel.tsx`](src/client/VscodePanel.tsx) 通过标准 `useSessions` 钩子读取保留的主视图会话（会话控制器的 `retainedBy.mainView` 计数），并由 `vscodeFrameUrl` 推导 iframe 的 `src`。`selectMainViewSession` 是供测试与复用的纯选择器。插件以一次 effect 注册其 `vscode-panel` 字典；所有文案经 `t` 传递，满足文案门禁。节点半部 [`src/index.ts`](src/index.ts) 为惰性装载席位，与其他界面插件一致。

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [web-app](../../bundle/web-app/README.zh.md) — 本面板背后的 `/vscode` 前缀路由与 VS Code Web 载荷。
- [ui-sidebar](../ui-sidebar/README.zh.md) — 选中本面板的 Work/Code 模式开关。
- [Web client architecture](../../../docs/subsystems/web-client.zh.md) — 浏览器插件行的加载与槽位注册方式。

-----

<a id="model-experience"></a>
## Model Experience

无，内嵌编辑器属于浏览器界面；此处无任何内容到达模型请求。

## Known Limitations and Deferred Work

工作台资源与 `/vscode` 路由必须存在，面板才能渲染编辑器；缺失时 iframe 显示宿主错误页。`dsh://` 工作区协议及其 FileSystemProvider 扩展（`vscode-extension`）是第二阶段后续项；在那之前工作台打开其空临时工作区。编辑、终端、AI 与语言服务器集成在后续阶段进行。

<a id="known-limitations-and-deferred-work"></a>

- **面板依赖宿主载荷。** 未包含 `vscodeAssets()` Vite 插件或未缓存 VS Code Web tarball 的 `dsh web` 构建会缺失 `/vscode`；iframe 随即加载失败。请在缓存就绪后重新构建。
- **会话绑定目前只读。** 工作台在其 URL 中拿到会话 id，但将其映射到会话工作区的 `dsh://` 提供器尚未注册（第二阶段）。
