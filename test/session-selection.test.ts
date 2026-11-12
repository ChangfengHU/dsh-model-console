import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectSessionModel } from '../src/client/session-selection.ts'

test('switching a session never changes the default inherited by other blank sessions', async () => {
  let defaultModel = { provider: 'claude-local', model: 'default' }, reloaded = 0
  const sessions = new Map<string, any>()
  const api = {
    selectModel: async (payload: any) => {
      const selected = { provider: payload.provider, model: payload.model }
      sessions.set(payload.sessionId, selected)
      if (payload.persistDefault !== false) defaultModel = selected
      return { result: { ok: true, value: { selected } } }
    },
    reload: async () => { reloaded++ },
  }
  await selectSessionModel('session-own', { provider: 'qwen', model: 'qwen-flash' }, api)
  assert.deepEqual(sessions.get('session-own'), { provider: 'qwen', model: 'qwen-flash' })
  assert.deepEqual(sessions.get('session-other') ?? defaultModel, { provider: 'claude-local', model: 'default' })
  await selectSessionModel('session-own', { provider: 'deepseek', model: 'deepseek-chat' }, api)
  assert.equal(defaultModel.provider, 'claude-local'); assert.equal(reloaded, 2)
})

test('the scoped request preserves exact model and effort and cannot accept a default-write flag', async () => {
  let sent: any
  const selection: any = { provider: 'provider-route', model: 'exact-id', reasoningEffort: 'high', persistDefault: true }
  await selectSessionModel('session-own', selection, { selectModel: async p => { sent = p; return { result: { ok: true, value: { selected: p } } } }, reload: async () => {} })
  assert.deepEqual(sent, { sessionId: 'session-own', provider: 'provider-route', model: 'exact-id', reasoningEffort: 'high', persistDefault: false })
})

test('a rejected or mismatched selection is never reported as applied', async () => {
  let reloaded = false
  for (const result of [{ ok: false, error: { message: 'Model unavailable' } }, { ok: true, value: { selected: { provider: 'different', model: 'other' } } }]) {
    await assert.rejects(selectSessionModel('session-own', { provider: 'qwen', model: 'qwen-flash' }, { selectModel: async () => ({ result }), reload: async () => { reloaded = true } }))
  }
  assert.equal(reloaded, false)
})

test('a lost directory reload reports the already-applied state instead of silently retrying', async () => {
  let requests = 0
  await assert.rejects(selectSessionModel('session-own', { provider: 'qwen', model: 'qwen-flash' }, { selectModel: async p => { requests++; return { result: { ok: true, value: { selected: p } } } }, reload: async () => { throw new Error('Connection lost') } }), /model changed/)
  assert.equal(requests, 1)
})
