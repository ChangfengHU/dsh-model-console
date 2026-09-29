import assert from 'node:assert/strict'
import test from 'node:test'
import { CONSOLE_INVOCATIONS, METHODS, PKG } from '../src/wire.ts'

test('host and client share one stable model-console invocation list', () => {
  assert.deepEqual(CONSOLE_INVOCATIONS.map(item => item.method), [...METHODS])
  assert.equal(CONSOLE_INVOCATIONS[0]?.id, `${PKG}#modelConsole/snapshot`)
  assert.equal(CONSOLE_INVOCATIONS[0]?.namespace, 'modelConsole')
})
