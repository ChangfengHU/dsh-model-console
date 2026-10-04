import test from 'node:test'
import assert from 'node:assert/strict'
import { measureModelTest } from '../src/model-test.ts'
const target = { provider: 'codex-local', model: 'gpt-6.1-sol', reasoningEffort: 'low' }
test('a real text response passes with its exact source, model and effort', async () => {
  const result = await measureModelTest(target, 1000, async function* () { yield { type: 'text-delta', text: 'OK' } })
  assert.equal(result.ok, true)
  assert.equal(result.model, target.model)
  assert.equal(result.reasoningEffort, 'low')
  assert.ok(result.firstTokenMs !== undefined)
})
test('our deadline overrides caller-aborted wording, including a late text response', async () => {
  const result = await measureModelTest(target, 5, async function* (signal) {
    await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
    yield { type: 'text-delta', text: 'late OK' }
    yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'aborted by caller' } } }
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'TEST_TIMEOUT')
  assert.match(result.message!, /不代表模型没有额度/)
})
test('an upstream quota error remains a quota error', async () => {
  const result = await measureModelTest(target, 1000, async function* () {
    yield { type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT', message: 'quota exhausted' } } }
  })
  assert.equal(result.code, 'RATE_LIMIT')
  assert.equal(result.ok, false)
})
