---
kind: upgrade-guide
description: "Web 与桌面界面不再内置 DeepSeek API Key 渠道，默认模型选择改为账户渠道。"
---

# 自行添加需要的 DeepSeek 提供商

[English](guide.md) | 中文

## 变更

Web 与桌面界面使用的 `dsh-web-app` 组合关闭了内置的 `deepseek-official` API Key 渠道，默认模型选择改为 `deepseek-account` 与 `deepseek-flash`。全新配置的模型页因此不再出现 DeepSeek API Key 卡片，该组合也不再解析 `provider: deepseek-official`。`dsh-base`、headless、`dsh-acp-app` 与 SDK 组合保留该渠道，`DEEPSEEK_API_KEY` 在这些界面照旧生效。

## 迁移

1. 打开 设置 → 模型 → **添加模型提供商**，选择 **第三方模型提供商**，再选 `llm-pi-ai` 自带的 DeepSeek 档案。该档案提供 `https://api.deepseek.com` 与 `DEEPSEEK_API_KEY` 引用，但不含模型列表，需要自行声明调用的模型 ID。
2. 在输入框选择该提供商及其中的一个模型。账户渠道仍是出厂默认，需要已登录的 DeepSeek 账户。
3. 把 profile、overlay 与 SDK `initialize` 调用中的 `provider: deepseek-official` 换成你添加的提供商 ID（目录档案为 `deepseek`）。已保存的密钥仍留在凭据库中对应引用下，只有引用不可达时才需要重新填写。
