# Model Test and Default Selection

Added the two missing model operations to the existing Settings surface.

## Delivered

- A real minimal-inference test for Codex and Qwen that bypasses Session creation and history persistence.
- Result presentation with provider/model identity, first-token latency, total duration, Beijing timestamp, and normalized failures.
- A grouped selector backed by the live provider/model catalog.
- Persistence through DSH's native `agentDefaultModel.saveSelection()` service, affecting only future Sessions.

## Verification

- Seven unit tests and both bundles passed.
- Qwen completed a real `qwen-plus-latest` request; Codex completed a real `gpt-5.6-sol` request.
- The first Codex test exposed an unsupported generic `maxTokens` override. The test request was corrected to remain provider-neutral and then passed.
- The effective default was temporarily changed to `deepseek-official/qwen-flash`, re-read from the settings layer, and restored to its original `codex-studio-director/gpt-6-astra` value.
- The public page listed 23 current runtime models, rendered both test buttons, retained the restored default after reload, and produced no browser console errors.
- The 390 px layout retained both test controls and the default selector without horizontal overflow.
