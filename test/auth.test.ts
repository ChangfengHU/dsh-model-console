import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCodexLoginStatus, parseCodexVersion } from '../src/auth.ts'

test('recognizes local ChatGPT authentication without returning credentials', () => {
  assert.deepEqual(parseCodexLoginStatus('Logged in using ChatGPT'), {
    kind: 'chatgpt', label: 'ChatGPT account', authenticated: true,
  })
})

test('recognizes logged-out and unknown responses', () => {
  assert.equal(parseCodexLoginStatus('Not logged in').kind, 'logged-out')
  assert.equal(parseCodexLoginStatus('unexpected output').kind, 'unknown')
})

test('projects only a version token', () => {
  assert.equal(parseCodexVersion('codex-cli 0.147.0'), '0.147.0')
  assert.equal(parseCodexVersion('no version'), null)
})
