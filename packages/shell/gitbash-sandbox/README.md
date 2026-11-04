---
description: "The Windows Git Bash executor: mounts the official bash tool on a resolved Git for Windows bash, running unconfined under compat and reporting the compat enforcement facts."
kind: "package-reference"
---

# @deepseek-ai/dsh-gitbash-sandbox

English | [中文](README.zh.md)

## Summary

Use `dsh-gitbash-sandbox` on Windows to give the model a real bash without replacing the harness's process model. Git for Windows (MSYS2) cannot be launched inside DSH's Windows restricted-token sandbox (documented Win32 error 5 / 0xC0000142), so this executor runs each command through a resolved Git for Windows `bash.exe` **unconfined** under `compat: auto`, and labels the result with the compat note. It is the Windows twin of `dsh-bash-sandbox` and the default `ctx.shell` on win32; `dsh-pwsh-sandbox` stays mounted but disabled so a profile can re-enable it.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this executor instead of `dsh-bash-sandbox` on Windows when the model should run the `bash` tool through Git Bash. It registers as `ctx.shell`, discovers a usable Git for Windows bash, and runs each `['<bash>', '-c', command]` through the inherited subprocess path. On non-Windows hosts it is never mounted (the base patch disables it).

### Windows-only

Git Bash resolution applies to `win32` only. Off Windows the resolver returns a `no Git for Windows bash found` reason and this executor is not mounted; the confined POSIX `dsh-bash-sandbox` path serves `ctx.shell`.

### The compat (unconfined) choice

Because Git Bash cannot survive confinement, the `compat` field makes the unconfined cost explicit instead of silently weakening a promise:

| `compat` | `danger-full-access` | `workspace-write` | `read-only` |
|---|---|---|---|
| `auto` (default) | runs normally | runs **unconfined**, labeled `[compat: ...]` | refuses (`SANDBOX_UNAVAILABLE`) |
| `strict` | runs normally | refuses (`SANDBOX_UNAVAILABLE`) | refuses (`SANDBOX_UNAVAILABLE`) |

A refused mode raises `SANDBOX_UNAVAILABLE`; the tool surfaces it and the model may escalate to `danger-full-access`. An unconfined run is never silent: the result carries `sandbox: { mode, denied: false, unconfined: true }` and the model-facing tool appends the compat note.

### Minimal configuration

```yaml
- id: gitbash-sandbox
  name: '@deepseek-ai/dsh-gitbash-sandbox'
  config:
    timeoutMs: 60000
    compat: auto # auto | strict
    # bashPath: C:\\Program Files\\Git\\bin\\bash.exe # optional explicit Git Bash
```

### Git Bash discovery

The resolver tries, in order: an explicit `bashPath`, the standard Git for Windows install roots, `bash.exe` on `PATH`, and the Git for Windows registry `InstallPath`. It rejects WSL (`System32`, `Sysnative`, `WindowsApps`, `\\wsl$`) so it never silently uses WSL bash. The terminal surfaces (`dsh-terminal-bash`, `dsh-api-terminal-controller`) share the same resolver, so the sidebar and persistent terminals open the same Git Bash the model tool runs.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design of the executor and points at the code that realizes it; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design concept

The executor extends `dsh-bash-sandbox`'s `SandboxBashExecutor` and overrides `execute()` to decide the route before any spawn. The pure `gitBashRoute()` function maps the resolved mode, the `compat` choice, and the platform to one of `delegate` (off-Windows fallback to the confined path), `run` (normal confined path), `unconfined` (run without confinement and label the result), or `refuse`. Bash discovery lives in `bash-path.ts` with an injectable `BashPathIO` so the chain is unit-testable.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `GitBashSandboxExecutor`, route decision, compat facts |
| [`src/bash-path.ts`](src/bash-path.ts) | Git Bash discovery: configured → default roots → PATH → registry |
| [`src/compat.ts`](src/compat.ts) | `gitBashRoute` routing matrix and the `compatNote` marker |
| `tests/` | Routing matrix, discovery chain, and executor behavior |

### Invariants

- **Never a silent unconfined run** — `auto` labels every unconfined result; `strict` refuses anything below `danger-full-access`.
- **Fail closed** — a mode the runner cannot satisfy refuses with `SANDBOX_UNAVAILABLE`; there is no fallback to an unconfined run without the label.
- **Windows-only** — the executor mounts on `win32`; off-Windows the route delegates to the confined POSIX path.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the executor contract is not enough.

- [shell seam](../shell/README.md) — the executor contract this provider implements, including the request/spec split.
- [bash-sandbox](../bash-sandbox/README.md) — the confined POSIX twin this executor extends.
- [tool-bash](../tool-bash/README.md) — the model-facing `bash` tool and its escalation surface.
- [terminal-bash](../../terminal/terminal-bash/README.md) — the persistent terminal that opens Git Bash.
- [Sandbox reference](../../sandbox/sandbox/README.md) — the sandbox design, escalation, and switching contract.

-----

<a id="model-experience"></a>
## Model Experience

### Bash tool result, indirectly

#### What the model sees

An unconfined Git Bash run appends exactly `[compat: bash runs outside the DSH file sandbox (session mode <mode>)]` after the ordinary output and exit marker. A refused mode propagates the `SANDBOX_UNAVAILABLE` error from the sandbox seam.

#### Token effect

Zero additional tokens on an unremarkable run beyond ordinary output. The compat label adds the quoted conditional marker only when an unconfined run happens.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this executor is not a general security boundary.

- **Unconfined under `compat: auto`** — Git Bash cannot run inside DSH's Windows restricted-token sandbox, so `auto` deliberately runs it with the harness's full file authority. The `strict` mode and `danger-full-access` are the alternatives; `read-only` always refuses.
- **Windows-only** — Git Bash resolution and the compat path apply to `win32`; other platforms use the confined `dsh-bash-sandbox` executor.
- **Discovery depends on the install layout** — non-standard Git for Windows installs need an explicit `bashPath`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
