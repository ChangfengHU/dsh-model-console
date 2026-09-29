# Project state

## Verified inventory

- GitHub repository: `ChangfengHU/dsh-model-console`.
- The plugin adds a separate `Model Console` section under DSH Settings; it does not replace the native Models section.
- `dsh-codex-claude-cli` remains the owner of the `codex-local` transport and Codex App Server lifecycle.
- The console reads the live DSH provider/model catalog, reports the machine-local Codex CLI login status without reading token files, and can add a Qwen ModelStudio route through the official `llm-pi-ai` settings and credentials APIs.
- Version `0.2.2` is installed in the local DSH web profile. Desktop and 390 px browser checks confirm the live catalog and local Codex authentication render without console errors or horizontal overflow.
- Qwen availability is derived from the live model catalog instead of one preferred route id. The existing `deepseek-official` route is therefore reported as a connected compatibility route when it advertises Qwen models; a dedicated `qwen-bailian` route remains optional.
- Codex and Qwen cards can execute an isolated provider-neutral inference test. It creates no Session and writes no conversation history; the UI reports the tested route, first-token latency, total duration, Beijing timestamp, or normalized failure.
- The console reads and writes DSH's native process-wide `agent-default-model` selection for future Sessions. The current effective selection is read from the settings layer rather than inferred from the composition base; existing Sessions are unchanged.

## Constraints

- Provider, MCP, Tool, or business-task failure must not be conflated. Only model-provider startup, authentication, quota, transport, or service failure can justify model fallback.
- Never read, return, log, or persist the machine-local Codex OAuth material.
- Existing provider routes and sessions remain intact unless a user explicitly migrates them.

## Next action

Configure and validate the optional `qwen-bailian` route only when an operator supplies or selects its credential; the plugin must not silently migrate existing Qwen-compatible routes. Keep model tests provider-neutral because `codex-local` rejects generic temperature, max-token, and stop overrides.
