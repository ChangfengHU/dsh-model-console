import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { patchDefaultModelSource } from '../scripts/patch-default-model.mjs'

test('real DSH selection: reused Web blanks follow live defaults; explicit and logged selections remain', { skip: !process.env.DSH_INSTALL_ROOT }, async () => {
  const source = await readFile(join(process.env.DSH_INSTALL_ROOT!, 'node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js'), 'utf8')
  const patched = patchDefaultModelSource(source)
  assert.equal(patchDefaultModelSource(patched), patched, 'installer is idempotent')
  const seed = patched.slice(patched.indexOf('\tconst webDefaultAgentOptions'), patched.indexOf('\tconst selections ='))
  const getter = patched.slice(patched.indexOf('\tfunction selectionFor(agent)'), patched.indexOf('\t/** Pre-publication setup'))
  let current: any = { provider: 'pool', model: 'flash', reasoningEffort: 'high' }
  const runtime = new Function('defaults', 'installModelSelection', `${seed}\nconst selections = new WeakMap();\n${getter}\nreturn {agentOptions,selectionFor};`)({ defaultModelSelection: () => ({ ...current }) }, () => {})
  const web = { options: runtime.agentOptions(), session: { requestHeader: () => undefined }, ctx: {} }
  const reused = runtime.selectionFor(web)
  current = { provider: 'codex-local', model: 'gpt-6.1-sol', reasoningEffort: 'medium' }
  assert.deepEqual(reused.current, current)
  const direct = { options: { provider: 'author', model: 'opus', reasoningEffort: 'low' }, session: web.session, ctx: {} }
  assert.deepEqual(runtime.selectionFor(direct).current, direct.options, 'plugin-created Agent must retain authored model')
  web.session.requestHeader = () => ({ config: { provider: 'pool', model: 'flash', reasoningEffort: 'high' } }) as any
  assert.equal(reused.current.model, 'flash', 'started session must retain logged model')
  reused.current = { provider: 'manual', model: 'sonnet' }
  assert.equal(reused.current.model, 'sonnet', 'manual session choice wins')
})

test('unsupported host code fails without producing a partial patch', () => {
  assert.throws(() => patchDefaultModelSource('unsupported'), /Unsupported DSH/)
})
