/** DSH model management surface; model transports stay in provider plugins. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { ModelConsoleService } from './service.ts'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

export const name = 'model-console'
export const inject = ['llm', 'agentDefaultModel']

export interface Config {
  codexExecutable?: string
  statusTimeoutMs?: number
  testTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  codexExecutable: z.string().default('codex'),
  statusTimeoutMs: z.number().step(1).min(1000).max(30000).default(5000),
  testTimeoutMs: z.number().step(1).min(1000).max(300000).default(90000),
})

export async function apply(ctx: Context, config: Config): Promise<void> {
  installSettingsSection(
    ctx,
    settingsNamespace('model-console'),
    z.object({ favoriteModels: z.array(z.string()).default([]) }),
    { favoriteModels: [] },
    { setSource: () => {}, onChange: () => {} },
  )
  const executable = config.codexExecutable?.trim() || 'codex'
  const timeoutMs = config.statusTimeoutMs ?? 5000
  await ctx.plugin(ModelConsoleService, { executable, timeoutMs, testTimeoutMs: config.testTimeoutMs ?? 90000 })
}

export { parseCodexLoginStatus, parseCodexVersion } from './auth.ts'
export { ModelConsoleService, resolveCodexExecutable } from './service.ts'
export { CONSOLE_INVOCATIONS, METHODS, PKG } from './wire.ts'
export type { ModelConsoleSnapshot, ModelRow, ModelTestResult, ProviderRow } from './wire.ts'
