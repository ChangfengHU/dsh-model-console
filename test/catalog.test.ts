import test from 'node:test'
import assert from 'node:assert/strict'
import { projectModels, selectChoice, effortOf, choiceFor, sameSelection } from '../src/catalog.ts'
import type { ProviderRow } from '../src/wire.ts'

const pool: ProviderRow = {
  id: 'ag-pool',
  name: 'AG Pool',
  models: [
    'claude-opus-4-6-thinking',
    'claude-sonnet-4-6',
    'gpt-oss-120b-medium',
    'gemini-3.6-flash-low',
    'gemini-3.6-flash-medium',
    'gemini-3.8-flash-low',
    'gemini-3.8-flash-medium',
    'gemini-3.8-flash-high',
    'gemini-3.1-pro-low',
    'gemini-3.1-pro-high',
    'gemini-3.1-pro-tiered',
    'gemini-3.8-flash-agent',
  ].map((id) => ({ id, name: id })),
}
test('AG core catalog has five families; older, agent and tiered aliases remain accessible', () => {
  const rows = projectModels(pool)
  assert.equal(rows.filter((r) => r.core).length, 5)
  assert.equal(rows.filter((r) => r.id === 'gemini-3.8-flash').length, 1)
  assert.equal(rows.find((r) => r.id === 'gemini-3.6-flash')!.core, false)
  assert.ok(rows.find((r) => r.id === 'gemini-3.1-pro-tiered'))
  assert.ok(rows.find((r) => r.id === 'gemini-3.8-flash-agent'))
  assert.equal(rows.flatMap((r) => r.models).length, pool.models.length)
})
test('effort selects a real raw ID and never invents unsupported Pro medium', () => {
  const pro = projectModels(pool).find((r) => r.id === 'gemini-3.1-pro')!
  assert.deepEqual(
    pro.efforts.map((e) => e.id),
    ['low', 'high'],
  )
  assert.equal(selectChoice('ag-pool', pro, 'high').model, 'gemini-3.1-pro-high')
  assert.equal(selectChoice('ag-pool', pro, 'medium').model, 'gemini-3.1-pro-low')
  assert.equal(effortOf(pro, { provider: 'ag-pool', model: 'gemini-3.1-pro-high' }), 'high')
})
test('Codex follows native order, displays its first four, and retains older entries in all', () => {
  const provider = {
    id: 'codex-local',
    name: 'Codex',
    models: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra'].map((id) => ({
      id,
      name: id,
    })),
  }
  assert.deepEqual(
    projectModels(provider)
      .filter((r) => r.core)
      .map((r) => r.id),
    ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'],
  )
  assert.equal(projectModels(provider).length, 6)
  assert.equal(projectModels(provider).find(r => r.id === 'gpt-5.6-sol')?.core, false)
})
test('native reasoning stays separate from model ID, including provider default', () => {
  const p: ProviderRow = {
    id: 'codex-local',
    name: 'Codex',
    models: [
      {
        id: 'gpt-5.6-sol',
        name: 'Sol',
        reasoning: {
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'high', name: 'High' },
          ],
          defaultEffort: 'high',
        },
      },
    ],
  }
  const row = projectModels(p)[0]!
  assert.deepEqual(selectChoice(p.id, row, 'low'), {
    provider: p.id,
    model: row.id,
    reasoningEffort: 'low',
  })
  assert.deepEqual(selectChoice(p.id, row, ''), { provider: p.id, model: row.id })
  assert.equal(effortOf(row, { provider: p.id, model: row.id }), '')
  assert.equal(
    sameSelection(selectChoice(p.id, row, 'low'), selectChoice(p.id, row, 'high')),
    false,
  )
})
test('only account-pool effort aliases merge and current older IDs can be found', () => {
  const api = { ...pool, id: 'other-api' }
  assert.equal(projectModels(api).length, pool.models.length)
  assert.equal(
    choiceFor(pool, { provider: 'ag-pool', model: 'gemini-3.6-flash-low' })?.id,
    'gemini-3.6-flash',
  )
})
