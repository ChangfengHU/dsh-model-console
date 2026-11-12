import assert from 'node:assert/strict'
import { test } from 'node:test'
import { providerName, readRuntimeCatalog } from '../src/runtime-catalog.ts'
import { ApiProfiles, profilesRpc } from '../src/api-profiles.ts'

test('source labels follow configured names or actual models, not legacy provider IDs', () => {
  const legacy = { id: 'deepseek-official', name: 'DeepSeek' }
  assert.equal(providerName(legacy, [{ id: 'qwen-flash' }, { id: 'qwen-plus-latest' }]), 'Qwen')
  assert.equal(providerName({ id: 'deepseek', name: 'deepseek' }, [{ id: 'deepseek-v4-flash' }]), 'DeepSeek')
  assert.equal(providerName(legacy, [{ id: 'qwen-flash' }], { displayName: 'My team gateway' }), 'My team gateway')
  assert.equal(providerName(legacy, [{ id: 'qwen-flash' }, { id: 'other-model' }]), 'DeepSeek')
  assert.equal(providerName({ id: 'new-source', name: 'Raw adapter' }, [], { fallbackName: 'Configured adapter' }), 'Configured adapter')
})

function fixture() {
  const providers = [{ id: 'deepseek-official', name: 'DeepSeek' }, { id: 'codex-local', name: 'Codex' }, { id: 'claude-local', name: 'Claude' }, { id: 'deepseek', name: 'deepseek' }]
  const models: Record<string, any[]> = {
    'deepseek-official': [{ id: 'qwen-flash', name: 'Qwen Flash' }],
    'codex-local': [{ id: 'codex-current', name: 'Local Codex' }],
    'claude-local': [{ id: 'default', name: 'Default' }],
    deepseek: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }],
  }
  const config: any = { providers: { 'deepseek-official': { apiKeyEnv: 'QWEN_SECRET' }, deepseek: { apiKeyEnv: 'DEEPSEEK_SECRET' } } }
  let credentialReads = 0
  const ports = {
    llm: { listProviders: () => providers, listModels: async (id: string) => models[id] ?? [], resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' } }), listConfigurableProviders: () => ['deepseek-official', 'deepseek'].map(provider => ({ provider, displayName: provider === 'deepseek-official' ? 'DeepSeek' : 'deepseek', settingsNs: 'api', settingsPath: ['providers', provider] })) },
    settings: { writable: true, describe: () => [{ ns: 'api', revision: 1 }, { ns: 'model-console', revision: 2 }], get: (ns: string) => ns === 'model-console' ? { favoriteModels: ['saved-favorite'] } : config },
    credentials: { describe: async () => { credentialReads++; return { configured: true } } },
  }
  return { ports, providers, models, config, profiles: new ApiProfiles(ports), reads: () => credentialReads }
}

test('the union includes API and local sources and refreshes without a hard-coded provider list', async () => {
  const f = fixture(), first = await f.profiles.catalog()
  assert.deepEqual(first.providers.map(p => p.name), ['Qwen', 'Codex', 'Claude', 'DeepSeek'])
  assert.equal(first.providers[0].id, 'deepseek-official', 'the transport ID is never renamed')
  assert.equal(first.providers[0].models[0].reasoning?.defaultEffort, 'high')
  assert.equal(f.reads(), 0, 'picker catalogs do not read credentials or authenticate a CLI')
  f.providers.push({ id: 'new-runtime-source', name: 'New Runtime Source' })
  f.models['new-runtime-source'] = [{ id: 'new-model', name: 'New Model' }]
  f.models['deepseek-official'].push({ id: 'qwen-next', name: 'New Qwen Model' })
  const second = await f.profiles.catalog()
  assert.equal(second.providers.length, 5)
  assert.equal(second.providers[0].models.length, 2)
  assert.equal(second.providers.at(-1)?.models[0].id, 'new-model')
})

test('Models and the shared catalog use the same configured labels', async () => {
  const f = fixture()
  f.config.providers['deepseek-official'].displayName = 'Team Qwen'
  const [api, catalog] = await Promise.all([f.profiles.sources(), f.profiles.catalog()])
  for (const s of api.sources) assert.equal(catalog.providers.find(p => p.id === s.provider)?.name, s.name)
  assert.equal(catalog.providers[0].name, 'Team Qwen')
  assert.ok(!JSON.stringify(catalog).includes('QWEN_SECRET'))
})

test('configured but unregistered sources remain explicitly unavailable, not runnable fake choices', async () => {
  const f = fixture(); f.providers.splice(0, 1)
  const result = await f.profiles.catalog()
  const missing = result.providers.find(p => p.id === 'deepseek-official')!
  assert.equal(missing.models.length, 0)
  assert.match(missing.catalogError!, /not registered/)
})

test('one failing runtime catalog does not hide other sources', async () => {
  const f = fixture(), list = f.ports.llm.listModels
  f.ports.llm.listModels = async id => { if (id === 'codex-local') throw new Error('Unavailable'); return list(id) }
  const result = await readRuntimeCatalog(f.ports.llm)
  assert.equal(result.length, 4)
  assert.equal(result.find(p => p.id === 'codex-local')?.models.length, 0)
  assert.ok(result.find(p => p.id === 'codex-local')?.catalogError)
  assert.equal(result.find(p => p.id === 'claude-local')?.models[0].id, 'default')
})

test('the trusted profile RPC exposes only a lightweight catalog, without model tests', async () => {
  const f = fixture(); let tested = false
  const rpc = profilesRpc(f.profiles, async () => { tested = true; return '{}' })
  const response: any = await rpc('catalog', {})
  assert.equal(response.ok, true); assert.equal(response.value.providers.length, 4)
  assert.equal(tested, false); assert.equal(f.reads(), 0)
})
