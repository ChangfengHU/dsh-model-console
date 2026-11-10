# Remote Models Acceptance

Version: 0.4.1. User-facing date: 2026-11-09 (America/New_York).

## Root Cause And Ownership

The stock Models surface expects a settings mirror backed by loopback-only
settings RPCs. A public trusted-host browser cannot use that mirror; the native
page reports unavailable settings and the old source editor receives HTTP 403.

The plugin now owns one Models entry through its bundle composition. Only the
stock Models UI entry is disabled; official DSH files and global RPC admission
are unchanged. A dedicated adapter-addressed profile channel serves the page.

## Verification

- 32 automated tests passed with DSH_INSTALL_ROOT pointing to the installed DSH.
- Source/key reads do not return stored key values; legacy URL userinfo/query
  secrets are removed from public projections.
- Revision conflicts, invalid endpoints, unknown fields, CLI-address attempts,
  concurrent saves, failed writes and lost write responses are covered.
- Dormant API profiles can be activated without assuming nested settings exist.
- Public /model-profiles/sources returned HTTP 200 with real API metadata.
- Public /api/settings.describe remained HTTP 403.
- A foreign Origin request to the profile channel returned HTTP 403.
- Browser navigation contains one Models entry, not duplicated stock/custom rows.
- Models displayed the real Qwen endpoint, managed credential presence and ref.
- The separately supplied DeepSeek key was stored through DSH Credentials and
  activated the existing runtime DeepSeek provider without changing Qwen's key.
- Qwen's in-page ordinary test prompt returned real output in 3307 ms.
- DeepSeek's in-page test returned QUOTA / HTTP 402 / Insufficient Balance in
  1096 ms. The key is configured; inference is blocked by source balance.
- Model Console's catalog/source tabs contain local Codex and Claude only.
- Both local authentication checks showed installed and logged in. The Codex
  check used the companion package's bundled executable, not a missing PATH alias.
- Default Settings offered Qwen, Codex, Claude and DeepSeek. The saved default was
  not changed during acceptance.

## Boundaries

This fixes remote model management. It does not prove that every CLI catalog
entry is callable by the account. Codex's execution/catalog-version mismatch
and the translation plugin's previously saved invalid provider/model pairing
are not represented as fixed by this release. No historical failed run is erased.

No new database, daemon, container or worktree was created. Dependency tooling
was reused from the existing DSH installation. No local Git remote operation was
performed; source development, build and release operations ran on Linux 114.
