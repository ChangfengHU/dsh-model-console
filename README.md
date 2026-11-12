# DSH Model Console

A small model-management plugin for DeepSeek Harness Web.

## 0.4.4: One Configured Model Directory

The session picker, Models API settings and Model Console now share the same
live runtime directory and configured source labels. API sources and local
Codex/Claude adapters are combined without a fixed source/model list. Legacy
transport IDs remain unchanged, including Qwen configured on a historically
DeepSeek-named route. Custom display names take precedence.

Opening or refreshing the picker reloads this lightweight directory and saved
favorites without executing CLI login checks or model test requests. API source,
runtime and favorites saves notify the picker to refresh. The existing session
selection service still validates and applies the exact provider/model IDs;
global defaults and other sessions are not overwritten. Configured but inactive
sources and failed catalogs remain explicitly unavailable.

- **Settings > Models** manages configurable API sources such as Qwen and DeepSeek.
- **Settings > Model Console** shows local Codex and Claude directories, executable paths and login state.
- **Model Console > Default Settings** selects from every currently registered source, including API models.

Model transports remain owned by provider plugins. This package never copies Claude/Codex authentication files.

## Models

The Models page reads the adapter-owned configurable-provider directory, not a hardcoded list of four model names.
It shows configured endpoints, credential presence and references, and registered models. Stored API key values are never returned to the browser.

A source can be edited and tested on the same page. Test content is editable, results show actual output, duration and a specific error code. Tests do not create a business conversation. A saved key is not proof of available credit: authentication, quota and network errors remain distinct.

New API credentials receive independent DSH-managed references. Endpoint writes preserve unrelated profile fields and require the revision that the browser read. Failed saves only clean credentials created by that attempt after confirming they are unused; existing keys are not deleted.

Base URL left empty retains an existing address or uses the provider adapter's default. Adding a source requires a configurable provider that the installed runtime actually supports.

## Remote Access

The stock Models surface depends on loopback-only settings RPCs. This plugin's bundle explicitly disables only that stock UI entry and provides one replacement Models page. Removing the plugin restores normal composition. No official DSH installation files are edited.

The replacement uses the dedicated `/model-profiles` channel:
- `sources`: API source metadata and key-presence flags, never key values.
- `save`: writes endpoint/key fields only at the selected adapter-owned profile address.
- `test`: tests a registered API model using a short prompt.

There is no generic settings mutation, arbitrary credential access, or filesystem API on this channel. Native global settings RPC restrictions remain unchanged.

The channel follows DSH's trusted-host admission and same-origin rules. Trusted-host admission is not user authentication; internet-facing deployments still need appropriate ingress authentication and authorization.

## Native CLI Models

The English-language picker uses compact labels such as `Claude · Default`.
Hovering shows the exact source, model and effort; the expanded picker retains
the complete catalog. Closed labels do not change the real model selection.

The local catalog and source tabs show Codex/Claude only. The native source check uses the companion package's exported Codex executable resolver when available, then the user's local CLI fallback. Explicit executable configuration is respected.

Installed, logged in, catalog loaded and inference tested are separate facts. A model appearing in a local cache does not prove that the account can invoke it. Claude's JSON auth status is parsed from stdout without combining diagnostic stderr into the JSON.

Capability/permission changes remain owned by the provider plugins. The model console does not widen tool permissions or change login credentials.

## Defaults And Favorites

Default selection includes provider, exact model ID, optional reasoning effort and expected revision. The Host confirms persisted readback. Existing sessions retain their own selections.

Favorites and default refresh use narrow model-console operations, not unrestricted browser settings RPCs. The chat model selector continues to use the runtime's ModelDirectory and session-selection API.

## Development

Client builds use Zod Mini for the string-only RPC codecs and enforce a 120 KB
uncompressed bundle budget. This avoids bundling the full multilingual validator
runtime into the initial browser plugin graph.

Build and test in the remote Linux source checkout. Reuse the installed DSH dependency runtime when appropriate; do not create extra databases, services or worktrees.

```sh
npm test
npm run build
npm pack
```

Set `DSH_INSTALL_ROOT` to an existing DSH installation to run the installed-source compatibility test; otherwise that test is skipped.

MIT. [Source repository](https://github.com/ChangfengHU/dsh-model-console)
