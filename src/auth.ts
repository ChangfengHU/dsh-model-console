/** Safe projection of `codex login status`; credential material never leaves the CLI. */

export type CodexAuthKind = 'chatgpt' | 'api-key' | 'logged-out' | 'unknown'

export interface CodexAuthProjection {
  kind: CodexAuthKind
  label: string
  authenticated: boolean
}

/** Convert the human CLI result into a stable, secret-free status. */
export function parseCodexLoginStatus(output: string): CodexAuthProjection {
  const normalized = output.trim().toLowerCase()
  if (/logged in using chatgpt/u.test(normalized)) {
    return { kind: 'chatgpt', label: 'ChatGPT account', authenticated: true }
  }
  if (/logged in using (an )?api key|api key login/u.test(normalized)) {
    return { kind: 'api-key', label: 'API key', authenticated: true }
  }
  if (/not logged in|logged out|login required/u.test(normalized)) {
    return { kind: 'logged-out', label: 'Not logged in', authenticated: false }
  }
  return { kind: 'unknown', label: 'Unable to confirm', authenticated: false }
}

/** Keep only the version token rather than returning arbitrary CLI output. */
export function parseCodexVersion(output: string): string | null {
  const match = output.match(/(?:codex(?:-cli)?\s+)?(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)/u)
  return match?.[1] ?? null
}
