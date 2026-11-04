---
description: "Web Code panel: the embedded VS Code workbench iframe that the sidebar Work/Code mode switch selects as the central main panel."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-vscode-panel

English | [中文](README.zh.md)

## Summary

This package provides the browser surface of the embedded Code editor. The sidebar's Work/Code mode switch (from [`ui-sidebar`](../ui-sidebar/README.md)) selects this plugin's `code` main panel, which renders an iframe hosting the VS Code Web workbench served by the `dsh web` host at the `/vscode` route. The workbench opens the current main-view Session's workspace over the `dsh://` file scheme (Phase 2) or its empty temporary workspace when no Session is retained. The `/vscode` payload and the vscode-static prefix route live in [`web-app`](../../bundle/web-app/README.md), so mount the two packages together.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin in the Web composition beside [`web-app`](../../bundle/web-app/README.md); the pair composes the embedded Code editor in two cordis.yml rows and this row takes no config. Registering the plugin publishes the `code` entry on the root-scoped `main` slot, which is the same panel the Work/Code switch selects; without this row the switch stays on Work because the guard declines an unregistered panel id. The panel occupies the central region the Conversation would, and the Conversation returns when the switch selects Work (which clears the selected panel).

### What to expect

The panel renders a full-height iframe that fills the central main region. Its `src` is `/vscode` plus an encoded `?session=` when the main view retains a Session, so the workbench loads that Session's workspace; without one it loads the empty temporary workspace. The iframe title is the localized `frame.title` copy so assistive tech names the editor. The panel itself has no buttons or chrome; all interaction happens inside the workbench.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The client half ([`src/client/index.ts`](src/client/index.ts)) registers the `main` keyed slot with `key: 'code'` and no child slots, matching the panel registration pattern of other main occupants such as [`ui-plugin-manager`](../ui-plugin-manager/README.md). The occupant component [`VscodePanel.tsx`](src/client/VscodePanel.tsx) reads the retained main-view Session through the standard `useSessions` hook (the Session controller's `retainedBy.mainView` count) and derives the iframe `src` via `vscodeFrameUrl`. `selectMainViewSession` is a pure selector exported for tests and reuse. The plugin registers its `vscode-panel` dictionaries as one effect; all copy goes through `t` so the copy gate stays satisfied. The node half [`src/index.ts`](src/index.ts) is an inert loader seat, exactly as the other surface plugins.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [web-app](../../bundle/web-app/README.md) — the `/vscode` prefix route and the VS Code Web payload behind this panel.
- [ui-sidebar](../ui-sidebar/README.md) — the Work/Code mode switch that selects this panel.
- [Web client architecture](../../../docs/subsystems/web-client.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the embedded editor is browser chrome; nothing here reaches a model request.

## Known Limitations and Deferred Work

The workbench assets and the `/vscode` route must be present for the panel to render an editor; without them the iframe shows the host's error page. The `dsh://` workspace scheme and its FileSystemProvider extension (`vscode-extension`) are the Phase 2 follow-up; until then the workbench opens its empty temporary workspace. Editing, terminal, AI, and language-server integration follow in later phases.

<a id="known-limitations-and-deferred-work"></a>

- **The panel depends on the host payload.** A `dsh web` build without the `vscodeAssets()` Vite plugin or without a cached VS Code Web tarball serves a missing `/vscode`; the iframe then fails to load. Rebuild with the cache in place.
- **Session binding is read-only for now.** The workbench gets the Session id in its URL, but the `dsh://` provider that maps it to the Session workspace is not yet registered (Phase 2).
