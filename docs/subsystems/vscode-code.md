# Embedded VS Code (Code mode)

English | [中文](vscode-code.zh.md)

The embedded VS Code feature adds a **Code** mode to the Web GUI sidebar. Selecting it swaps the central main panel from the Conversation to a VS Code Web workbench running in an iframe, so the user can browse and edit the current Session's workspace with a full editor instead of leaving the harness. The feature is composed entirely of Cordis plugins; no harness code path is special-cased for it, and every plugin can be removed to disable Code mode.

Source: [`packages/client/ui-vscode-panel`](../../packages/client/ui-vscode-panel/README.md), [`packages/bundle/web-app/src/vscode-static.ts`](../../packages/bundle/web-app/src/vscode-static.ts), [`apps/web/vscode.html`](../../apps/web/vscode.html)

## Plugin composition

The feature is split into independent plugins so each layer can evolve and be disabled on its own:

| Plugin (cordis row) | Role |
|---|---|
| `ui-vscode-panel` (`@deepseek-ai/dsh-client-ui-vscode-panel`) | Registers the `code` entry on the root-scoped `main` slot; renders the workbench iframe pointing at `/vscode?session=…`. |
| `ui-sidebar` (`@deepseek-ai/dsh-client-ui-sidebar`) | Owns the Work/Code `ModeSwitch`; switches the central panel to `code` only when that panel is registered. |
| `vscode-static` (inside `web-app`) | Serves the VS Code Web payload at the `/vscode` prefix route behind index authentication, with path-traversal and MIME handling. |
| `vscode-extension` (`dsh-workspace`, Phase 2) | VS Code extension registering the `dsh://` FileSystemProvider so the workbench reads and writes the Session workspace. |
| Host write RPC (Phase 2) | `workspace-files.write` (or `fs.editText`) backs editor saves with version guards. |

Removing any one of these plugins degrades gracefully: without `ui-vscode-panel` the ModeSwitch stays on Work; without `vscode-static` the iframe shows the host error page; without the extension the workbench opens its empty temporary workspace.

## Data storage

All data produced by the embedded VS Code — user settings, keybindings, extensions, global state, and the temporary empty workspace — is stored under **`$DSH_HOME/codemode/`** instead of the browser's default IndexedDB/localStorage or a system VS Code user-data directory. `$DSH_HOME` resolves through [`dsh-home-paths`](../../packages/util/home-paths/src/index.ts) (explicit override → `$DSH_HOME` → `~/.danke-harness`).

Consequences:

- One user-data root for the whole harness; backup, migration, and cleanup treat `codemode/` like `attachments/`, `cache/`, and other `$DSH_HOME` children.
- No dependency on browser storage quotas or origin-scoped IndexedDB; data survives browser profile resets and is portable across machines with the same `$DSH_HOME`.
- The host backs the `vscode-userdata` (or equivalent) scheme with the `codemode/` tree through a FileSystemProvider, mirroring how the `dsh://` scheme backs Session workspaces. The workbench receives that provider in place of its default IndexedDB-backed one.
- Secrets and credentials never live in `codemode/`; they continue to flow through the credential seam.

## Workbench bootstrap

`apps/web/vscode.html` bootstraps the workbench with `_VSCODE_FILE_ROOT = /vscode/vscode/` and `_VSCODE_WEB.builtinExtensions = []`, excluding github1s' own AI extension so no second AI surface loads. It derives the workspace from the `?session=` query: a Session id becomes `dsh://<sessionId>/`, otherwise the empty `tmp:/default.code-workspace`. The page posts `{channel:'dsh-code', type:'ready'|'boot', sessionId}` to the parent window so the host can observe readiness.

## Why plugins, not a special case

The Code feature touches the sidebar, the main panel slot, the HTTP carrier, the Session workspace, and (in Phase 2) the filesystem seam. Implementing it as plugins keeps each concern in its owning package and lets the framework's normal lifecycle — registration, disposal on teardown, coverage gates, i18n gates, and cordis composition — apply unchanged. The `ModeSwitch` occupant guard (`selectPanel('code')` is declined when no `code` panel is registered) is the single integration point, so a host without `ui-vscode-panel` cannot enter Code mode.

## Acceptance

- Code mode swaps the central panel to the iframe and back to the Conversation on Work.
- The workbench loads from `/vscode` with no 404 and renders its empty editor.
- User data is written under `$DSH_HOME/codemode/`, never to browser storage or a system VS Code directory.
- Removing `ui-vscode-panel` or `vscode-static` leaves the rest of the harness functional.
