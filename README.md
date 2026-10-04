# dsh-model-console

Model Console is the primary model management entry in DeepSeek Harness:
**Settings → Model Console**.

Model transports remain owned by their provider plugins. Codex and Claude Code use their native local login; direct APIs and AG Account Pool use DSH Credentials.

## Interface

- **模型目录**: core, favorites, search, and all models. AG Pool Gemini effort variants appear as one model with an effort selector; exact submitted IDs remain unchanged. Older and unknown aliases remain accessible.
- **接入来源**: local CLI login, direct API, and account-pool API. Each source shows registration, installation/login or credential status, directory state, endpoint when available, and the last explicit inference test.
- **默认设置**: separates the saved selection from the draft. Save includes provider, exact model ID, reasoning effort, and expected settings revision; the host confirms persisted readback. Refresh preserves pending edits. Existing sessions keep their own selection.
- The conversation model selector uses the same catalog projection and favorites, through the official shared ModelDirectory controller and session model-selection API.
- Narrow content panels wrap controls using container queries. Styles follow the host theme without hiding or restyling external settings navigation.

## Codex and Claude Code

Codex capabilities are directly editable in **Model Console → 接入来源 → Codex**: image generation, Web Search takeover, search model, and result count. The technical Codex App Server plugin card remains available and uses the exact same `llm-codex-app-server` settings namespace.

Claude Code has a separate source card with executable, work directory, timeout, model cache, retries, and native permission mode. Editable settings require a provider companion exposing `claude-code-runtime`; when absent the UI reports that settings are unavailable. The companion reads saved settings on the next call, invalidates model caches when relevant settings change, and preserves the accepted turn's settings.

Native login status is projected without returning authentication files or tokens. A fallback directory containing default/opus/sonnet/haiku does **not** prove installation, login, quota, or successful inference.

## API connections

Existing Pi AI and official DeepSeek connections can be edited using their native settings namespaces. Endpoint changes preserve other profile fields. A new key gets a separate DSH credential reference before the profile is updated with a revision check; stored keys never appear in the form. Generic provider creation remains available in the native Models settings.

AG Pool local and remote instances are independent sources. The management link opens the appropriate pool; OAuth accounts, quotas, networking and fallback strategies remain managed there. A models directory is not a quota API. This version does not claim actual-route account/header metadata or session-wide affinity that the installed Pi adapter does not expose.

Codex core models follow the first four visible entries in the native catalog order; the remaining entries stay under All Models. Its runtime supports an explicit current native CLI and an HTTP / Mixed network proxy configured in the shared Codex settings.

Explicit tests use a configurable 90-second deadline and distinguish TEST_TIMEOUT from upstream quota errors. They send a minimal inference through the selected source and effort and do not create a chat Session. Results include target, time and latency; saved connection changes invalidate prior test results.

## Development

```bash
npm install
npm test
npm run build
```

Install into a DSH profile and merge `cordis.patch.yml`. Restart after adding host services. The shipped web model-selection service supplies the official composer controller.

See [the UX design](docs/MODEL_CONSOLE_UX_PLAN.zh.md) and [local verification](docs/VERIFICATION.zh.md).
