# Changelog

## sidebar 分支 - 内置 better-sidebar 核心能力

### Added
- `dsh-api-workspace-files` 新增受保护的完整文件写入、创建目录、删除、重命名、搜索、Git 状态/差异、Git 暂存/取消暂存/提交能力。
- `ui-sidebar-documentpreview` 文本预览支持编辑模式，基于 `workspaceFiles.write` 保存，并处理过期版本。
- `ui-sidebar-files` 文件树支持删除、新建文件夹、重命名、搜索和 Git 状态徽标。
- `ui-sidebar-files` 新增 Git 变更标签页，支持差异预览、暂存、取消暂存和提交。
- `ui-subagent` 新增 `tasks` 侧栏标签页，展示子代理血缘关系。
- `session-controller` 与 `ui-subagent` 新增侧栏对话线程创建入口。
- `ui-sidebar-terminal` 新增底部工作台切换按钮和固定底部终端面板。
- `ui-sidebar-right` 标签定义新增 `hidden` 与 `single` 字段。

### Changed
- 内置功能继续通过 `ctx.sidebarRightTabs` 注册，保持与扩展注册模型一致。
- Git 变更相关 UI 与 host `workspaceFiles` 资源模型保持一致。
- 重新生成 typert 客户端产物以支持新增 host 方法。

### Verified
- `packages/api/workspace-files`: 12 files / 211 tests
- `packages/api/session-controller`: 43 files / 989 tests
- `packages/client/ui-sidebar-right`: 15 files / 260 tests
- `packages/client/ui-sidebar-files`: 8 files / 82 tests
- `packages/client/ui-subagent`: 3 files / 70 tests
- `packages/client/ui-sidebar-terminal`: 7 files / 65 tests (1 skipped)
- host 与 client TypeScript 构建通过

### Commits
- `ee96d4aa97` feat(session-controller,ui-subagent): add minimal side chat thread creation
- `675564915c` feat(workspace-files,ui-sidebar-files): add Git stage, unstage, and commit
- `d4d9b53660` feat(ui-sidebar-terminal): add minimal bottom workbench toggle and terminal panel
- `2ad9c2895b` feat(ui-sidebar-right): add hidden and single fields to tab definitions
