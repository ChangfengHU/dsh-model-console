# dsh-model-console

`dsh-model-console` is a management surface for the model providers that DeepSeek Harness is actually running.

It does not implement another model transport. `dsh-codex-claude-cli` continues to own `codex-local` and the Codex App Server process; the official `llm-pi-ai` adapter continues to own API providers such as Qwen. This plugin joins those facts into one Settings page.

## Current capabilities

- Lists live DSH providers and the models each adapter currently advertises.
- Runs `codex login status` and `codex --version` without reading or returning local authentication files.
- Shows whether `codex-local` is really registered by `dsh-codex-claude-cli`.
- Sends an isolated minimal inference to test a selected Codex or Qwen route without creating a Session or writing conversation history.
- Reads and updates DSH's native `agent-default-model` selection for future Sessions; existing Sessions retain their own model.
- Adds a verified `qwen-bailian` profile through DSH's official `llm-pi-ai` settings namespace.
- Stores a Qwen API key through DSH Credentials; the key is write-only and never returned to the browser after saving.
- Keeps an existing compatibility route intact, so existing sessions are not silently migrated.

The existing DSH Models page remains available for generic provider editing and per-session model selection. This plugin deliberately does not claim a global default-model feature that the current Host does not expose.

## Development

```bash
npm install
npm test
npm run build
```

Install the package into a DSH profile and merge `cordis.patch.yml`. A restart is required because a new Host and client plugin must enter the composition.
