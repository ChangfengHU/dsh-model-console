# Qwen Runtime Detection

Corrected the Qwen status model after the first console version treated only a configured `qwen-bailian` route as connected.

## Change

- Detect Qwen availability from live model ids across every registered provider.
- Prefer a live dedicated route when present; otherwise identify the actual compatibility provider.
- Show the active provider and Qwen model count in the collapsed card.
- Keep dedicated-route creation as an optional operation, without changing the existing provider or sessions.

## Verification

- Seven tests passed, including compatible, dedicated, and empty-catalog cases.
- The live browser rendered `已连接（兼容路由）`, `deepseek-official · 2 个 Qwen 模型`, `qwen-plus-latest`, and `qwen-flash`.
- No page or console errors were observed, and the old Qwen `待配置` status was absent.
