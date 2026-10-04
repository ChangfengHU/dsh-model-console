/** Shared Typert descriptors for the model-console host service. */

import { z } from 'zod'

export const PKG = 'dsh-model-console'
export const METHODS = [
  ['snapshot', 0],
  ['testModel', 1],
  ['saveDefault', 1],
] as const

function jsonParam(name: string) {
  return Object.freeze({
    name,
    wire: name,
    source: 'json',
    codec: Object.freeze({ mode: 'strict', typeSymbol: `${PKG}/types#Json`, schema: z.string() }),
  })
}

const JSON_RESULT = Object.freeze({
  mode: 'strict',
  typeSymbol: `${PKG}/types#Json`,
  schema: z.string(),
})

export const CONSOLE_INVOCATIONS = Object.freeze(
  METHODS.map(([method, argc]) =>
    Object.freeze({
      id: `${PKG}#modelConsole/${method}`,
      service: 'modelConsole',
      namespace: 'modelConsole',
      method,
      invocation: Object.freeze({ kind: 'direct' }),
      parameters: Object.freeze(argc === 1 ? [jsonParam('payload')] : []),
      result: JSON_RESULT,
      sourceLocation: Object.freeze({ file: 'src/wire.ts', line: 1, column: 1 }),
    }),
  ),
)

export interface ModelRow {
  id: string
  name: string
  description?: string
  reasoning?: { efforts: Array<{ id: string; name: string }>; defaultEffort?: string }
}

export interface ProviderRow {
  id: string
  name: string
  models: ModelRow[]
  catalogError?: string
}

export interface QwenRuntimeProjection {
  connected: boolean
  mode: 'dedicated' | 'compatible' | 'none'
  providerId: string | null
  models: ModelRow[]
}

/** Detect Qwen by the live model catalog, not by one preferred route name. */
export function projectQwenRuntime(
  providers: ProviderRow[],
  dedicatedRoute = 'qwen-bailian',
): QwenRuntimeProjection {
  const candidates = providers
    .map((provider) => ({
      provider,
      models: provider.models.filter((model) => /^qwen(?:[-_.]|$)/i.test(model.id)),
    }))
    .filter((candidate) => candidate.models.length > 0)
  const selected =
    candidates.find((candidate) => candidate.provider.id === dedicatedRoute) ?? candidates[0]
  if (!selected) return { connected: false, mode: 'none', providerId: null, models: [] }
  return {
    connected: true,
    mode: selected.provider.id === dedicatedRoute ? 'dedicated' : 'compatible',
    providerId: selected.provider.id,
    models: selected.models,
  }
}

export interface ModelConsoleSnapshot {
  checkedAt: number
  codex: {
    installed: boolean
    executable: string
    version: string | null
    auth: import('./auth.ts').CodexAuthProjection
    providerActive: boolean
    diagnostic?: string
  }
  claude: {
    installed: boolean
    executable: string
    version: string | null
    authenticated: boolean | null
    label: string
    providerActive: boolean
  }
  defaultState: { revision: number; writable: boolean }
  preferences: { favoriteModels: string[]; revision: number; writable: boolean }
  defaultModel: {
    provider: string
    model: string
    reasoningEffort?: string
  }
  providers: ProviderRow[]
}

export interface ModelTestResult {
  ok: boolean
  provider: string
  model: string
  testedAt: number
  durationMs: number
  firstTokenMs?: number
  code?: string
  message?: string
  reasoningEffort?: string
}
