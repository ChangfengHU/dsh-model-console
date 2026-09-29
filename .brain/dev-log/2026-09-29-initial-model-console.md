# Initial Model Console

Implemented the first independent DSH model-management surface.

## Delivered

- Live provider and model inventory from the host `llm` service.
- Safe local Codex CLI version and login-status detection.
- Explicit `codex-local` registration and advertised-model visibility.
- Qwen ModelStudio configuration through `llm-pi-ai`, with write-only DSH credential storage and validation before mutation.
- A responsive Settings section that preserves the native Models page and collapses only the Settings navigation while this section is active on narrow screens.

## Verification

- `npm run check`: four tests passed and host/client builds completed.
- Live local DSH: six providers and 23 models were read from the actual runtime; `codex-local` and the machine-local ChatGPT login were detected.
- Browser: desktop and 390 × 844 checks passed with no page/console errors; the mobile content had no horizontal overflow after the narrow-screen fix.

## Deployment boundary

The local DSH web profile installs the generated `0.1.2` package and requires its tarball to remain available until the profile is migrated to a registry or immutable release source.
