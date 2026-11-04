---
kind: upgrade-guide
description: "The Web and Desktop interface ships no built-in DeepSeek API-key provider, and its default model selection moves to the account route."
---

# Add the DeepSeek provider you use

English | [中文](guide.zh.md)

## Change

The `dsh-web-app` composition behind the Web and Desktop interface disables the built-in `deepseek-official` API-key provider and starts from `deepseek-account` with model `deepseek-flash`. A fresh profile therefore lists no DeepSeek API-key card on the models page, and `provider: deepseek-official` no longer resolves there. The `dsh-base`, headless, `dsh-acp-app`, and SDK compositions keep the API-key route, so `DEEPSEEK_API_KEY` continues to serve them unchanged.

## Migration

1. Open Settings → Models → **Add model provider**, choose **Third-party model provider**, and select the DeepSeek profile that `llm-pi-ai` ships. It supplies `https://api.deepseek.com` and the `DEEPSEEK_API_KEY` reference but no model list, so declare the model ids you call.
2. Select that provider and one of its models in the composer. The account route stays the shipped default and requires a signed-in DeepSeek account.
3. Replace `provider: deepseek-official` in profiles, overlays, and SDK `initialize` calls with the provider id you added (`deepseek` for the catalog profile). Stored keys stay in the credential store under their reference; re-enter a key only when its reference is unreachable.
