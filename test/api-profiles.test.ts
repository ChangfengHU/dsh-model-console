import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiProfiles, profilesRpc, validateEndpoint } from '../src/api-profiles.ts'

function fixture() {
  let revision = 1
  const state: any = { providers: { cloud: { baseURL: 'https://api.example.com/v1', apiKeyEnv: 'EXISTING_KEY' } } }
  const secrets = new Map([['EXISTING_KEY', 'private-original-secret']])
  const writes: string[] = []
  const ports = {
    llm: {
      listConfigurableProviders: () => [{ provider: 'cloud', displayName: 'Cloud API', settingsNs: 'api-scope', settingsPath: ['providers', 'cloud'] }, { provider: 'codex-local', displayName: 'Codex', settingsNs: '', settingsPath: [] }],
      listProviders: () => [{ id: 'cloud', name: 'Cloud API' }, { id: 'codex-local', name: 'Codex' }],
      listModels: async () => [{ id: 'example-model', name: 'Example' }],
    },
    settings: {
      writable: true, describe: () => [{ ns: 'api-scope', revision }], get: () => state,
      mutate: async (_ns: unknown, ops: any[], expected: number) => {
        assert.equal(expected, revision)
        for (const op of ops) state.providers.cloud[op.path.at(-1)] = op.value
        revision++
      },
    },
    credentials: {
      describe: async (ref: string) => ({ configured: secrets.has(ref), writable: true, source: 'managed' }),
      set: async (ref: string, key: string) => { writes.push(ref); secrets.set(ref, key) },
      unset: async (ref: string) => { secrets.delete(ref) },
    },
  }
  return { ports, state, secrets, writes, profiles: new ApiProfiles(ports) }
}
test('API directory excludes local CLI routes and never returns credential values', async () => {
  const { profiles } = fixture(), value = await profiles.sources()
  assert.equal(value.sources.length, 1)
  assert.equal(value.sources[0].credential.configured, true)
  assert.equal(value.sources[0].credential.ref, 'EXISTING_KEY')
  assert.ok(!JSON.stringify(value).includes('private-original-secret'))
})
test('saving an API source preserves other fields and allocates an independent key', async () => {
  const { profiles, state, secrets } = fixture()
  const result = await profiles.save({ provider: 'cloud', expectedRevision: 1, baseURL: 'https://new.example.com/v1/', apiKey: 'new-private-secret' })
  assert.equal(state.providers.cloud.baseURL, 'https://new.example.com/v1')
  assert.match(state.providers.cloud.apiKeyEnv, /^DMC_[A-F0-9]+$/)
  assert.equal(secrets.get('EXISTING_KEY'), 'private-original-secret')
  assert.equal(secrets.get(state.providers.cloud.apiKeyEnv), 'new-private-secret')
  assert.ok(!JSON.stringify(result).includes('new-private-secret'))
})
test('dormant sources create the adapter-owned profile without assuming nested fields exist', async () => {
  const { ports, profiles, state, secrets } = fixture()
  delete state.providers.cloud
  ports.settings.mutate = async (_ns, ops, revision) => {
    assert.equal(revision, 1)
    assert.deepEqual(ops[0].path, ['providers', 'cloud'])
    state.providers.cloud = ops[0].value
  }
  await profiles.save({ provider: 'cloud', expectedRevision: 1, apiKey: 'new-private-secret' })
  assert.equal(secrets.get(state.providers.cloud.apiKeyEnv), 'new-private-secret')
})
test('legacy endpoint userinfo and query credentials are removed from public projection', async () => {
  const { profiles, state } = fixture()
  state.providers.cloud.baseURL = 'https://private-user:private-password@api.example.com/v1?key=private-query#private-fragment'
  const value = await profiles.sources()
  assert.equal(value.sources[0].baseURL, 'https://api.example.com/v1')
  for (const secret of ['private-user', 'private-password', 'private-query', 'private-fragment']) assert.ok(!JSON.stringify(value).includes(secret))
})
test('invalid or stale writes reject before changing any credential', async () => {
  for (const patch of [{ provider: 'codex-local' }, { expectedRevision: 0 }, { ns: 'permission' }, { baseURL: 'http://public.example.com' }, { baseURL: 'https://secret:pass@example.com' }, { apiKey: 'a\nbad-key' }]) {
    const { profiles, writes, state } = fixture()
    await assert.rejects(profiles.save({ provider: 'cloud', expectedRevision: 1, apiKey: 'new-private-secret', ...patch }))
    assert.equal(writes.length, 0); assert.equal(state.providers.cloud.apiKeyEnv, 'EXISTING_KEY')
  }
})
test('sequential revision checks prevent duplicate concurrent credential rotations', async () => {
  const { profiles, writes } = fixture()
  const result = await Promise.allSettled([profiles.save({ provider: 'cloud', expectedRevision: 1, apiKey: 'new-private-secret' }), profiles.save({ provider: 'cloud', expectedRevision: 1, apiKey: 'other-private-secret' })])
  assert.equal(result[0].status, 'fulfilled'); assert.equal(result[1].status, 'rejected'); assert.equal(writes.length, 1)
})
test('a lost write response never removes a credential already referenced by the profile', async () => {
  const { ports, profiles, secrets, state } = fixture(), mutate = ports.settings.mutate
  ports.settings.mutate = async (...args) => { await mutate(...args); throw new Error('response lost') }
  await profiles.save({ provider: 'cloud', expectedRevision: 1, apiKey: 'new-private-secret' })
  assert.equal(secrets.get(state.providers.cloud.apiKeyEnv), 'new-private-secret')
})
test('failed settings commit cleans only the newly allocated unused credential', async () => {
  const { ports, profiles, secrets } = fixture()
  ports.settings.mutate = async () => { throw new Error('storage unavailable') }
  await assert.rejects(profiles.save({ provider: 'cloud', expectedRevision: 1, apiKey: 'new-private-secret' }))
  assert.equal(secrets.size, 1); assert.equal(secrets.get('EXISTING_KEY'), 'private-original-secret')
})
test('RPC exposes no global settings, arbitrary credential or CLI test operations', async () => {
  const { profiles } = fixture(); let tested = false
  const rpc = profilesRpc(profiles, async () => { tested = true; return '{"ok":true}' })
  assert.equal((await rpc('settings.describe', {})).ok, false)
  assert.equal((await rpc('test', { provider: 'codex-local', model: 'example-model', prompt: 'Help organize my day.' })).ok, false)
  assert.equal((await rpc('test', { provider: 'cloud', model: 'wrong-model', prompt: 'Help organize my day.' })).ok, false)
  assert.equal((await rpc('test', { provider: 'cloud', model: 'example-model', prompt: '' })).ok, false)
  assert.equal(tested, false)
  assert.equal((await rpc('test', { provider: 'cloud', model: 'example-model', prompt: 'Help organize my day.' })).ok, true)
})
test('endpoint validation rejects embedded credentials, query strings and unsafe schemes', () => {
  assert.equal(validateEndpoint('https://api.example.com/v1/'), 'https://api.example.com/v1')
  assert.equal(validateEndpoint('http://127.0.0.1:9000/v1'), 'http://127.0.0.1:9000/v1')
  for (const value of ['file:///etc/passwd', 'https://key:secret@example.com', 'https://api.example.com/?key=secret', 'https://api.example.com/#secret']) assert.throws(() => validateEndpoint(value))
})
