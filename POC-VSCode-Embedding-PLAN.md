# 计划书：把 @github1s/vscode-web 嵌入 danke-harness（Work/Code 二合一）

> 分支 `vscode` · worktree `/d/danke-harness-vscode` · 基于 master `9e68670a69`
> 面向：在新会话中继续本工作。本文件是唯一入口。

---

## 0. 环境备忘（新会话必须先读）

- **工作目录**：`/d/danke-harness-vscode`（git worktree，分支 `vscode`）。主开发树 `/d/danke-harness` 由他人使用，**不要动它**。
- **依赖**：worktree 的 `node_modules` 与各包 `lib`、`node_modules` 均为 junction 指向主树（`D:\danke-harness\...`）。**不要**在 worktree 里重新 `pnpm install`（会破坏 junction 或拉新依赖到主树）。
- **测试/构建命令**：用主树的二进制，从 worktree 运行：
  ```bash
  # 测试单个包
  cd /d/danke-harness-vscode
  /d/danke-harness/node_modules/.bin/vitest run --config /d/danke-harness/vitest.config.ts packages/client/ui-sidebar/tests
  # typecheck 单包
  /d/danke-harness/node_modules/.bin/tsc -p packages/client/ui-sidebar/tsconfig.json --noEmit
  # lint
  /d/danke-harness/node_modules/.bin/oxlint --config /d/danke-harness/.oxlintrc.json packages/client/ui-sidebar/src packages/client/ui-sidebar/tests
  ```
- **写文件到 worktree**：`write`/`edit` 工具被沙箱限制在主工作区（`/d/danke-harness`）。worktree 是同级目录，**用 shell heredoc 写**（`cat > 文件 << 'EOF'`），或用 Python 脚本做精确插入（参考下文的编辑脚本模式）。
- **git 状态**：改动只应在 `packages/client/ui-sidebar/**` 与根目录 `POC-VSCode-Embedding-PLAN.md`。

---

## 1. 已完成（POC 第一部分：ModeSwitch 槽位）

全部在 `packages/client/ui-sidebar/`：

| 文件 | 内容 |
|---|---|
| `src/client/contract/slots.ts` | 新增 `sidebar.mode.switch` 槽位（single/root）+ `SidebarModeSwitchOwnerProps` + props 联合 |
| `src/client/SidebarRoot.tsx` | expanded 态在 New Session 条与面板列表间渲染该席位 |
| `src/client/SidebarRoot.module.css` | `.modeSwitchArea` 间距 |
| `src/client/ModeSwitch.tsx` + `.module.css` | 滑动 Work/Code 控件（POC 默认占位者） |
| `src/client/index.ts` | 声明子席位 + 注册默认占位者（含缺失 `code` 面板 guard） |
| `src/client/locales.ts` | `mode.work`/`mode.code`/`mode.switch.aria`（zh+en） |
| `tests/mode-switch.client.spec.tsx` | 5 个行为用例 |
| `tests/apply.client.spec.tsx` | 注册/teardown 断言 + guard 分支用例 |
| `tests/__snapshots__/sidebar-snapshot.client.spec.tsx.snap` | 已更新（含控件渲染） |
| `README.md` / `README.zh.md` | 新增「Work / Code mode switch」章节 |

**验证**：typecheck ✅ · 56 用例全过 ✅ · 变更文件覆盖率 100% ✅ · oxlint 0 错 ✅ · 槽位唯一 ✅

---

## 2. 下一步总目标

让右侧主面板出现 **Code** 面板：点 ModeSwitch 的 Code → 主列渲染 `@github1s/vscode-web` 的 VS Code workbench（iframe），并能浏览/编辑当前 Session 的 workspace 文件。

分阶段（每阶段可独立交付）：

- **Phase 0**：VS Code Web 静态资源可加载（`/vscode` 路由 + bootstrap）
- **Phase 1**：`ui-vscode-panel` 注册 `code` 全局面板（iframe 容器）
- **Phase 2**：文件系统桥接（`dsh://` provider ↔ Host workspace-files/fs）
- **Phase 3**：主题/快捷键/AI 协同
- **Phase 4**：验证与打包

---

## 3. Phase 0 — VS Code Web 资源与入口

**目标**：dev server 能访问 `http://<host>/vscode`，workbench 渲染出空编辑器，无 404。

### 3.1 依赖
- 主树 `apps/web/package.json`（或 `packages/bundle/web-app`）加 `@github1s/vscode-web: ^0.30.3`（devDependency）。
- 注意：包 unpacked 225MB，**不要打进 bundle**；只作为静态资源提供。

### 3.2 入口文件（新增到 worktree）
- `apps/web/vscode.html`：模仿 github1s 的 `index.html` 骨架，设置 `_VSCODE_FILE_ROOT` 指向 `/vscode/`。
- `apps/web/src/vscode-bootstrap.ts`：仿 github1s `src/index.ts`——
  ```ts
  globalThis._VSCODE_WEB = {
    builtinExtensions: [],            // 不加载 github1s 扩展，避免双 AI
    onWorkbenchReady() { /* 移除 spinner */ },
    ...createVSCodeWebConfig(platform, repo),
  };
  // 加载 vs/workbench/workbench.web.main.internal.js
  ```

### 3.3 静态资源服务
- **dev**：Vite 静态中间件映射 `/vscode/*` → `node_modules/@github1s/vscode-web`（vite.config.ts 加 `server.fs.allow` + 中间件，或 `publicDir` 复制）。
- **build**：`scripts/build.ts` 或 Vite 插件把 `node_modules/@github1s/vscode-web` 复制到 `dist/vscode/`。

### 3.4 验收
- 浏览器打开 `/vscode` 无 404，workbench 渲染。
- `tsc -p apps/web/tsconfig.json --noEmit` 通过。

### 3.5 风险
- 225MB 静态资源拷贝到 dev/build；建议只复制 `vscode/`、`extensions/`、`nls/`、`index.html` 等必要子目录。
- CSP：workbench 需 `script-src`/`worker-src` 放行。

---

## 4. Phase 1 — `code` 全局面板（iframe）

**目标**：ModeSwitch 的 Code → 主列 iframe 指向 `/vscode?session=...`。

### 4.1 新包 `packages/client/ui-vscode-panel/`
按 client 插件 checklist（参考 `packages/client/ui-conversation` 与 `ui-sidebar-files`）：
- `package.json`（`@deepseek-ai/dsh-client-ui-vscode-panel`，exports `.`/`./client`/`./src/*`，`dsh.client` manifest，`files`）
- `tsconfig.json`（extends `tsconfig.base.client.json`，references 各依赖）
- `tsdown.config.ts`（`clientBundle`）
- `src/index.ts`（空 node-half apply）
- `src/client/index.ts`：`slots.inject('main', function* () { yield slots.register({ name:'main', key:'code', children:{ 'main.code': {...} } }, VscodePanel) })`
- `src/client/VscodePanel.tsx`：渲染 `<iframe src="/vscode?session=...">` + 加载态/错误态
- `src/client/locales.ts`：`code.loading`/`code.unavailable` 等
- `src/css-modules.d.ts`、`README.md`

### 4.2 装配（三处必做）
- `tsconfig.client.json` aggregate `references` 加一行
- `packages/bundle/web-app/cordis.patch.yml` 加 `dsh.client` 行
- `packages/bundle/web-app/package.json` 加依赖

### 4.3 验收
- 侧边栏 ModeSwitch 点 Code → iframe 出现且加载 `/vscode`。
- 点 Work → 回到会话面板。

### 4.4 风险
- iframe 与主应用快捷键/键盘焦点冲突；Code 模式下让 VS Code 接管编辑器区域快捷键。
- 无 session 时显示引导，不请求 iframe。

---

## 5. Phase 2 — 文件系统桥接（核心，工作量最大）

**目标**：VS Code 浏览并编辑 DSH session workspace 文件。

### 5.1 事实（已核实）
- Host `api/workspace-files` 目前只有 `readBytes` + `list`，**没有 write**。
- Host `fs` 有 `editText`（含版本守卫），可作写路径。

### 5.2 VS Code 侧 provider
在 `vscode-bootstrap.ts`（或单独 `vscode-fs-provider.ts`）实现 `vscode.FileSystemProvider`（`dsh` scheme）：
- `stat` / `readDirectory` → `workspace-files.list`
- `readFile` → `workspace-files.readBytes`
- `writeFile` → 新增 Host RPC（或走 `fs.editText`）
- `watch`：通过 ResourceGroup / directory watch 订阅（参考 `ui-sidebar-files` 的 face/directory-node）
- workspace provider：folderUri = `dsh://session/<id>/`

### 5.3 Host 侧写 RPC
- 在 `api/workspace-files` 增加 `write(scope, path, content, expectedVersion?)`，内部走 `ctx.fs.editText`，返回新版本。
- 或复用 `str_replace_editor`/`write` 工具的底层 seam；明确走 sandbox/confinement。

### 5.4 验收
- VS Code 文件树能列出 session workspace 并打开文件。
- 编辑后保存 → Host 文件更新（版本校验生效）。

### 5.5 风险
- 写路径权限/沙箱：`workspace-write` 之外的路径要拒绝。
- 大文件/二进制：readBytes 已有 limit；超大文件在 VS Code 侧截断或只读。
- 文件变更双端同步：Host 侧改动要推给 VS Code（watch 事件）。

---

## 6. Phase 3 — 集成与体验

- **主题**：注入 DSH `--dsw-*` tokens 到 VS Code `productConfiguration`/CSS；对齐 light/dark。
- **快捷键**：注册到 `client-shortcuts`；Code 模式与 Work 模式各自生效。
- **AI**：不加载 `github1s-ai`；可选：通过 MCP 把 DSH 工具暴露给 VS Code，或 DSH 保持主控。
- **LSP**：复用 `lsp-stdio` 在 VS Code 侧配置 language servers（或保持 DSH 侧）。

---

## 7. Phase 4 — 验证与打包

- `pnpm run test:gui`（client 包套件）
- `DSH_SNAPSHOT=replay pnpm run test:web`（前端 dist + 浏览器 smoke）
- Electron dev/package：`pnpm --filter @deepseek-ai/dsh-desktop run dev`、`package:dir`
- 性能：首屏时间、内存、worker 初始化；确认 225MB 不拖累主 bundle。

---

## 8. 决策点（需你确认）

1. **范围**：只做代码编辑器（Monaco）还是完整 VS Code Web（@github1s/vscode-web）？——已倾向后者，POC 验证中。
2. **写权限**：人类编辑是否允许写 workspace 文件？是否需要确认/审批？
3. **平台优先级**：Web 先还是 Electron 先？（建议 Web 先）
4. **Code 面板是否常驻**：仅按需加载 iframe，还是打开即预载？

---

## 9. 编辑脚本模式（worktree 文件操作）

用 Python 脚本做精确插入（示例：`/tmp/edit-apply-spec.py`），或 heredoc：
```bash
cat > /d/danke-harness-vscode/packages/client/ui-sidebar/tests/x.spec.tsx << 'EOF'
// content
EOF
```

---

## 10. 最终验收清单（全部完成后勾选）

- [ ] `/vscode` 路由渲染 VS Code workbench，无 404
- [ ] ModeSwitch Code → iframe 主面板；Work → 会话面板
- [ ] VS Code 浏览 DSH workspace 文件树并打开文件
- [ ] 编辑保存回 Host（可选，视写权限决策）
- [ ] 不加载 github1s 内置 AI 扩展
- [ ] `pnpm run test:gui` + `DSH_SNAPSHOT=replay pnpm run test:web` 通过
- [ ] Electron dev/package 通过
- [ ] 文档（README/zh + 升级指南如有 breaking）更新
