/** Shared Typert descriptors for the model-console host service. */

import { z } from 'zod'

export const PKG = 'dsh-model-console'
export const METHODS = ['snapshot'] as const

const JSON_RESULT = Object.freeze({
  mode: 'strict',
  typeSymbol: `${PKG}/types#Json`,
  schema: z.string(),
})

export const CONSOLE_INVOCATIONS = Object.freeze(METHODS.map(method => Object.freeze({
  id: `${PKG}#modelConsole/${method}`,
  service: 'modelConsole',
  namespace: 'modelConsole',
  method,
  invocation: Object.freeze({ kind: 'direct' }),
  parameters: Object.freeze([]),
  result: JSON_RESULT,
  sourceLocation: Object.freeze({ file: 'src/wire.ts', line: 1, column: 1 }),
})))

export interface ModelRow {
  id: string
  name: string
  description?: string
}

export interface ProviderRow {
  id: string
  name: string
  models: ModelRow[]
  catalogError?: string
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
  providers: ProviderRow[]
}
