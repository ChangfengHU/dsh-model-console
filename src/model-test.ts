import type { ModelTestResult } from './wire.ts'
import type { Selection } from './catalog.ts'
interface TestChunk {
  type: string
  text?: string
  reason?: { kind: string; failure?: { code: string; message: string } }
}
/** Report our deadline as a timeout, never as a user cancellation or exhausted quota. */
export async function measureModelTest(
  selection: Selection,
  timeoutMs: number,
  stream: (signal: AbortSignal) => AsyncIterable<TestChunk>,
): Promise<ModelTestResult> {
  const startedAt = Date.now(), controller = new AbortController()
  let timedOut = false, firstTokenAt: number | undefined, textSeen = false
  let failure: { code: string; message: string } | undefined
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('Model connectivity test timed out'))
  }, timeoutMs)
  try {
    for await (const chunk of stream(controller.signal)) {
      if (chunk.type === 'text-delta' && chunk.text) {
        firstTokenAt ??= Date.now()
        textSeen = true
      }
      if (chunk.type === 'finish' && ['error', 'aborted'].includes(chunk.reason?.kind ?? '') && chunk.reason?.failure)
        failure = { code: chunk.reason.failure.code, message: chunk.reason.failure.message.slice(0, 300) }
    }
  } catch (cause) {
    failure = { code: 'TEST_FAILED', message: (cause instanceof Error ? cause.message : String(cause)).slice(0, 300) }
  } finally { clearTimeout(timer) }
  if (timedOut) failure = {
    code: 'TEST_TIMEOUT',
    message: `测试等待 ${timeoutMs / 1000} 秒后超时，请检查此来源的网络代理；这不代表模型没有额度。`,
  }
  const testedAt = Date.now()
  return {
    ...selection, ok: !failure && textSeen, testedAt, durationMs: testedAt - startedAt,
    ...(firstTokenAt === undefined ? {} : { firstTokenMs: firstTokenAt - startedAt }),
    ...(!failure && textSeen ? {} : failure ?? { code: 'EMPTY_RESPONSE', message: 'Model returned no text' }),
  }
}
