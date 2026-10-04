import { CONSOLE_INVOCATIONS, PKG } from '../wire.ts'

export const MODEL_CONSOLE_REMOTE = Object.freeze({
  package: PKG,
  descriptors: CONSOLE_INVOCATIONS,
})

export function unwrap<T>(result: {
  ok: boolean
  value?: T
  error?: { code: string; message: string }
}): T {
  if (!result.ok) throw new Error(result.error?.message ?? 'Model Console request failed')
  return result.value as T
}
