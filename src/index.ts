/** DSH model management surface; model transports stay in provider plugins. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { ModelConsoleService } from './service.ts'

export const name = 'model-console'
export const inject = ['llm']

export interface Config {
  codexExecutable?: string
  statusTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  codexExecutable: z.string().default('codex'),
  statusTimeoutMs: z.number().step(1).min(1000).max(30000).default(5000),
})

export async function apply(ctx: Context, config: Config): Promise<void> {
  const executable = config.codexExecutable?.trim() || 'codex'
  const timeoutMs = config.statusTimeoutMs ?? 5000
  await ctx.plugin(ModelConsoleService, { executable, timeoutMs })
}

export { parseCodexLoginStatus, parseCodexVersion } from './auth.ts'
export { ModelConsoleService, resolveCodexExecutable } from './service.ts'
export { CONSOLE_INVOCATIONS, METHODS, PKG } from './wire.ts'
export type { ModelConsoleSnapshot, ModelRow, ProviderRow } from './wire.ts'
