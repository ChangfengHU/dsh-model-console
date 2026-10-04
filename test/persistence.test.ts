import test from 'node:test'
import assert from 'node:assert/strict'
import { persistDefault, type SelectionSettings } from '../src/persistence.ts'
import type { Selection } from '../src/catalog.ts'
const next: Selection = { provider: 'codex-local', model: 'gpt-5.6-sol', reasoningEffort: 'low' }
function memory(): SelectionSettings {
  let saved: Record<string, unknown> = {},
    revision = 4
  return {
    writable: true,
    describe: () => [{ ns: 'agent-default-model', revision }],
    get: () => saved,
    replace: async (_ns, value, expected) => {
      if (expected !== revision) throw new Error('revision conflict')
      saved = structuredClone(value)
      revision++
    },
  }
}
test('confirms full selection from persisted readback with the new revision', async () => {
  const saved = await persistDefault(memory(), next, 4)
  assert.deepEqual(saved.selection, next)
  assert.equal(saved.revision, 5)
  assert.ok(saved.savedAt > 0)
})
test('absent, read-only or unregistered settings cannot report saved', async () => {
  await assert.rejects(persistDefault(undefined, next, 4), /不可写/)
  await assert.rejects(persistDefault({ ...memory(), writable: false }, next, 4), /不可写/)
  await assert.rejects(persistDefault({ ...memory(), describe: () => [] }, next, 4), /不可写/)
})
test('missing and stale revisions fail without overwriting the owner selection', async () => {
  const settings = memory()
  await assert.rejects(persistDefault(settings, next, undefined), /设置版本/)
  await assert.rejects(persistDefault(settings, next, 3), /revision conflict/)
  assert.deepEqual(settings.get('agent-default-model'), {})
})
test('no-op persistence or different readback must not report success', async () => {
  await assert.rejects(
    persistDefault({ ...memory(), replace: async () => {} }, next, 4),
    /保存未生效/,
  )
  await assert.rejects(
    persistDefault({ ...memory(), get: () => ({ ...next, reasoningEffort: 'high' }) }, next, 4),
    /保存未生效/,
  )
})
test('concurrent saves at the same revision allow exactly one winner', async () => {
  const settings = memory()
  const results = await Promise.allSettled([
    persistDefault(settings, next, 4),
    persistDefault(settings, { ...next, model: 'other' }, 4),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1)
})
