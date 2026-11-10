import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectionLabel } from '../src/catalog.ts'

test('closed picker labels are compact while keeping the real model choice', () => {
  const claude = { id: 'claude-local', name: 'Claude Code', models: [{ id: 'default', name: 'Default (recommended)' }, { id: 'opus', name: 'Claude Opus 5.5' }] }
  assert.equal(selectionLabel(claude, { provider: claude.id, model: 'default', reasoningEffort: 'high' }), 'Claude · Default')
  assert.equal(selectionLabel(claude, { provider: claude.id, model: 'opus' }), 'Claude · Opus 5.5')
  assert.equal(selectionLabel(undefined, null), 'Select model')
})
