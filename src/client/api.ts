import type { ModelConsoleSnapshot, ModelTestResult, RuntimeCatalog } from '../wire.ts'
import type { Selection } from '../catalog.ts'
export interface RpcResult<T> {
  result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }
}
export interface Namespace {
  ns: string
  value: Record<string, any>
  user?: unknown
  revision: number
}
export interface ModelConsoleApi {
  catalog(): Promise<RuntimeCatalog>
  snapshot(): Promise<ModelConsoleSnapshot>
  saveFavorites(favoriteModels: string[], expectedRevision: number): Promise<ModelConsoleSnapshot['preferences']>
  testModel(selection: Selection): Promise<ModelTestResult>
  saveDefault(
    selection: Selection,
    revision: number,
  ): Promise<{ selection: Selection; revision: number; savedAt: number }>
  standard: {
    sessions: {
      selectModel(payload: Selection & { sessionId: string; persistDefault: false }): Promise<RpcResult<{ selected: Selection }>>
    }
    settings: {
      describe(payload: {}): Promise<RpcResult<{ writable: boolean; namespaces: Namespace[] }>>
      mutate(payload: Record<string, unknown>): Promise<RpcResult<{ revision: number }>>
    }
    credentials: {
      describe(payload: {
        refs: string[]
      }): Promise<
        RpcResult<{ credentials: Record<string, { configured: boolean; writable: boolean }> }>
      >
      set(payload: { ref: string; value: string }): Promise<RpcResult<{}>>
      unset(payload: { ref: string }): Promise<RpcResult<{}>>
    }
    llm: {
      discoverModels(
        payload: Record<string, unknown>,
      ): Promise<RpcResult<{ models: Array<{ id: string }> }>>
    }
  }
}

export const CATALOG_CHANGED = 'dsh-model-console:catalog-changed'
export async function profilesCall(method: string, payload: Record<string, unknown> = {}) {
  const response = await fetch('/model-profiles/' + method, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload }),
  })
  const result = await response.json()
  if (!response.ok || !result.result?.ok) throw new Error(result.result?.error?.message ?? 'Model directory request failed.')
  if (method === 'save') window.dispatchEvent(new Event(CATALOG_CHANGED))
  return result.result.value
}
export function valueOf<T>(result: RpcResult<T>): T {
  if (!result.result.ok) throw new Error(result.result.error.message)
  return result.result.value
}
export const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)
export const timeText = (value: number): string =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
