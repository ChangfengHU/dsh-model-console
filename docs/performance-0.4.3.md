# Browser payload regression

The shared wire contract needs only strict string codecs for serialized JSON. Importing full Zod also bundled unused locale and validation code into the browser.

Version 0.4.3 uses the public zod/mini string constructor and minifies the client. It keeps the same invocation IDs, strict string inputs/results, native authentication checks and settings protections.

Verified on 2026-11-10:

- 34 automated tests passed, including every parameter and result codec accepting strings and rejecting objects/null.
- Browser payload: 827406 bytes before, 47387 bytes after (including loader wrapper).
- Compressed public transfer from Linux 114: 148965 bytes before, 15827 bytes after.
- Build fails if generated client body exceeds 120000 bytes.
- Real Model Console catalog and Sources views loaded; existing Codex and Claude sign-ins were detected. No credentials or defaults changed.

Payload size is not a browser timing score. Other DSH plugins and public-network latency remain outside this package's measured improvement.
