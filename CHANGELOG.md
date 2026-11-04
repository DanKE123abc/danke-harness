# Changelog

All notable changes to deepseek-harness will be documented in this file.

The format is based on [keep-a-changelog](https://keep-a-changelog.com/),
and this project adheres to [semantic versioning](https://semver.org/).

## [Unreleased]

### DeepSeek Harness Plugin Removal

This session removed three DeepSeek-official features in the `remove` worktree (branch `remove`), to be merged later:

#### 1. Login & Feedback Removal (`ui-settings-account`)
- Deleted `SignInDialog.tsx`, `SignInDialog.module.css`, `browser-login.ts`, `authorize-url.ts`, `contact-url.ts`, `AccountOnboarding.tsx`
- `contact-config.ts` → `bonus-config.ts`: removed contact/config (`contactFormUrl`, `contactSource`, `CONTACT_CONFIG_GLOBAL`), kept bonus notice config (`BonusNoticeConfig`, `BONUS_NOTICE_CONFIG_GLOBAL`)
- Removed orphan slot `settings.models.sign-in` from `slot-contract.ts` + regenerated slot-catalog
- Removed orphan locale key `balanceSignedOut` from `locales.ts`
- Updated `AccountSection.tsx`/`AccountMenu.tsx` to remove login/contact UI
- Updated `README.md`/`.zh.md`: removed login/feedback descriptions, kept account-framework content
- Updated `apply.client.spec.ts`/`config.client.spec.ts`/`account.client.spec.tsx`: removed login/contact test assertions
- Tests pass: 322/322 (ui-settings-account)

#### 2. deepseek-official 平级 (`ui-settings-models`)
- Removed special-casing: `deepseek-official` no longer ranked #1 in `joinProviderDirectory`
- Removed `onboardingReadiness` + `OnboardingReadiness` type
- Removed `DeepSeekOnboardingDialog` import/consumer, `credentialOnboarding` config
- `toHaveLength(2)` → `toHaveLength(1)` in `apply.client.spec.ts`
- Tests pass: 368/368

#### 3. Session Log Upload 移除
- Deleted `packages/session/session-log-deepseek/` + `packages/client/ui-settings-session-log/`
- Removed `dsh_session_log` wire extension + `enableSessionLog` option
- **PRESERVED** `session-log-deepseek/delivery-accepted` event type (released format) in `known-event-types.ts` L56 + `persistence-catalog.md`
- Regenerated: `gen-config-catalog`, `gen-module-graph`, `gen-client-catalog`, `gen-dependency-catalog`
- Tests pass: core/session 557 + llm-deepseek/translator/format-catalog 708

#### 4. 文档更新
- `docs/config-catalog.md`/`.zh.md`: 移除联系字段
- `docs/module-graph.md`/`.zh.md`: 更新模块图
- `docs/deepseek-llm-api-wire-extensions.md`/`.zh.md`: 移除 `## dsh_session_log` 章节
- `docs/subsystems/feedback.md`/`.zh.md`：更新反馈相关描述

#### 5. Typecheck
- `pnpm run typecheck`: **5/5 gates pass** (host compiler, host aggregate, host typert, client compiler, client aggregate)

### 其他
- 临时脚本已移入 `scripts/tmp-tools/`（worktree）后删除
- 主树 `/d/danke-harness` 无源码改动（所有源码编辑均在 worktree 完成）
- `pnpm-lock.yaml`: 合理移除 `dsh-session-log-deepseek` 条目
