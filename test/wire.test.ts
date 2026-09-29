import assert from 'node:assert/strict'
import test from 'node:test'
import { CONSOLE_INVOCATIONS, METHODS, PKG, projectQwenRuntime } from '../src/wire.ts'

test('host and client share one stable model-console invocation list', () => {
  assert.deepEqual(CONSOLE_INVOCATIONS.map(item => item.method), METHODS.map(([method]) => method))
  assert.equal(CONSOLE_INVOCATIONS[0]?.id, `${PKG}#modelConsole/snapshot`)
  assert.equal(CONSOLE_INVOCATIONS[0]?.namespace, 'modelConsole')
  assert.equal(CONSOLE_INVOCATIONS[1]?.parameters.length, 1)
  assert.equal(CONSOLE_INVOCATIONS[2]?.parameters.length, 1)
})

test('recognizes Qwen models on an existing compatible provider', () => {
  const projection = projectQwenRuntime([
    { id: 'deepseek-official', name: 'DeepSeek', models: [
      { id: 'qwen-plus-latest', name: 'Qwen Plus' },
      { id: 'qwen-flash', name: 'Qwen Flash' },
      { id: 'deepseek-v3', name: 'DeepSeek V3' },
    ] },
  ])
  assert.equal(projection.connected, true)
  assert.equal(projection.mode, 'compatible')
  assert.equal(projection.providerId, 'deepseek-official')
  assert.deepEqual(projection.models.map(model => model.id), ['qwen-plus-latest', 'qwen-flash'])
})

test('prefers a dedicated Qwen route when both routes are live', () => {
  const projection = projectQwenRuntime([
    { id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'qwen-flash', name: 'Qwen Flash' }] },
    { id: 'qwen-bailian', name: 'Qwen ModelStudio', models: [{ id: 'qwen-plus-latest', name: 'Qwen Plus' }] },
  ])
  assert.equal(projection.mode, 'dedicated')
  assert.equal(projection.providerId, 'qwen-bailian')
})

test('does not infer Qwen from a provider label without a live Qwen model', () => {
  const projection = projectQwenRuntime([
    { id: 'qwen-bailian', name: 'Qwen ModelStudio', models: [] },
  ])
  assert.deepEqual(projection, { connected: false, mode: 'none', providerId: null, models: [] })
})
