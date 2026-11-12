import { randomUUID } from 'node:crypto'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { providerName, readRuntimeCatalog, type SourceLabel } from './runtime-catalog.ts'

export const PROFILE_CHANNEL = '/model-profiles'
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
const invalid = (message: string) => Object.assign(new Error(message), { code: 'INVALID_CONFIG' })

export function validateEndpoint(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || value.length > 2000) throw invalid('Invalid API endpoint.')
  let url: URL
  try { url = new URL(value) } catch { throw invalid('Use a valid API Base URL.') }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw invalid('Use HTTPS or an explicit localhost endpoint, without credentials or query parameters.')
  return url.toString().replace(/\/$/, '')
}

function getPath(value: any, path: readonly string[]) {
  return path.reduce((current, key) => current?.[key], value)
}
function publicEndpoint(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) return ''
    url.username = ''; url.password = ''; url.search = ''; url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch { return '' }
}

/** The adapter directory owns namespace/path addresses; browsers never supply them. */
export class ApiProfiles {
  private queue = Promise.resolve()
  constructor(private readonly ports: { llm: any; settings: any; credentials: any }) {}

  private entries() {
    return this.ports.llm.listConfigurableProviders().filter((entry: any) =>
      typeof entry.settingsNs === 'string' && !!entry.settingsNs &&
      Array.isArray(entry.settingsPath) && entry.settingsPath.every((p: unknown) => typeof p === 'string' && !forbidden.has(p)),
    )
  }

  private locate(provider: unknown) {
    if (typeof provider !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(provider)) throw invalid('Choose an API provider from the runtime directory.')
    const entry = this.entries().find((e: any) => e.provider === provider)
    if (!entry) throw invalid('This route is not a configurable API provider.')
    const namespace = this.ports.settings.describe().find((n: any) => n.ns === entry.settingsNs)
    if (!namespace) throw invalid('This provider settings namespace is unavailable.')
    const stored = getPath(this.ports.settings.get(settingsNamespace(entry.settingsNs)), entry.settingsPath)
    const profile = stored ?? {}
    return { entry, namespace, profile, exists: stored !== undefined }
  }

  async sources() {
    const active = new Map(this.ports.llm.listProviders().map((p: any) => [p.id, p]))
    const rows = []
    for (const entry of this.entries()) {
      const { namespace, profile } = this.locate(entry.provider)
      const ref = typeof profile.apiKeyEnv === 'string' ? profile.apiKeyEnv : ''
      const credential = ref ? await this.ports.credentials.describe(ref) : undefined
      const models = active.has(entry.provider) ? await this.ports.llm.listModels(entry.provider).catch(() => []) : []
      rows.push({
        provider: entry.provider, name: providerName({ id: entry.provider, name: entry.displayName }, models, { displayName: profile.displayName }),
        active: active.has(entry.provider), configured: entry.settingsPath.length === 0 || Object.keys(profile).length > 0,
        baseURL: publicEndpoint(profile.baseURL),
        credential: { configured: credential?.configured === true, writable: credential?.writable !== false, source: typeof credential?.source === 'string' ? credential.source : undefined, ref },
        revision: namespace.revision, writable: this.ports.settings.writable === true,
        models: models.map((m: any) => ({ id: m.id, name: m.name })),
      })
    }
    return { sources: rows }
  }

  async catalog() {
    const labels = new Map<string, SourceLabel>()
    const configured = new Set<string>()
    for (const entry of this.entries()) {
      try {
        const { profile, exists } = this.locate(entry.provider)
        labels.set(entry.provider, { displayName: profile.displayName, fallbackName: entry.displayName })
        if (exists) configured.add(entry.provider)
      } catch { /* Registered runtime sources remain visible if settings metadata is unavailable. */ }
    }
    const providers = await readRuntimeCatalog(this.ports.llm, labels)
    for (const id of configured) if (!providers.some(p => p.id === id)) providers.push({ id, name: providerName({ id }, [], labels.get(id)), models: [], catalogError: 'Configured source is not registered in the runtime' })
    const preferences = this.ports.settings.get(settingsNamespace('model-console')) as { favoriteModels?: string[] } | undefined
    return { checkedAt: Date.now(), providers, preferences: { favoriteModels: preferences?.favoriteModels ?? [], revision: this.ports.settings.describe().find((n: any) => n.ns === 'model-console')?.revision ?? 0, writable: this.ports.settings.writable === true } }
  }

  save(input: any) {
    const job = this.queue.then(() => this.saveNow(input))
    this.queue = job.catch(() => {})
    return job
  }

  private async saveNow(input: any) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['provider', 'baseURL', 'apiKey', 'expectedRevision'].includes(k))) throw invalid('Invalid API profile fields.')
    const { entry, namespace, profile, exists } = this.locate(input.provider)
    if (!this.ports.settings.writable) throw invalid('API settings are read-only.')
    if (!Number.isInteger(input.expectedRevision) || namespace.revision !== input.expectedRevision) throw invalid('Settings changed. Refresh before saving; your draft is preserved.')
    const endpoint = validateEndpoint(input.baseURL)
    const key = input.apiKey
    if (key !== undefined && (typeof key !== 'string' || key.trim().length < 8 || key.length > 4096 || /[\r\n\0]/.test(key))) throw invalid('Invalid API key.')
    if (!endpoint && !key) throw invalid('There are no changes to save.')
    const newRef = key ? 'DMC_' + randomUUID().replace(/-/g, '').toUpperCase() : undefined
    let ops = [
      ...(endpoint ? [{ op: 'set', path: [...entry.settingsPath, 'baseURL'], value: endpoint }] : []),
      ...(newRef ? [{ op: 'set', path: [...entry.settingsPath, 'apiKeyEnv'], value: newRef }] : []),
    ]
    if (!exists && entry.settingsPath.length) ops = [{ op: 'set', path: [...entry.settingsPath], value: { ...(endpoint ? { baseURL: endpoint } : {}), ...(newRef ? { apiKeyEnv: newRef } : {}) } }]
    if (newRef) await this.ports.credentials.set(newRef, key.trim())
    let failure: unknown
    try { await this.ports.settings.mutate(settingsNamespace(entry.settingsNs), ops, input.expectedRevision) }
    catch (error) { failure = error }
    const current = getPath(this.ports.settings.get(settingsNamespace(entry.settingsNs)), entry.settingsPath)
    const committed = (!newRef || current?.apiKeyEnv === newRef) && (!endpoint || current?.baseURL === endpoint)
    if (!committed) {
      // Remove only our newly allocated, proven-unreferenced key; never clear an existing credential.
      if (newRef && current?.apiKeyEnv !== newRef) await this.ports.credentials.unset(newRef)
      throw failure ?? invalid('The saved API profile could not be confirmed.')
    }
    return { ok: true, ...(await this.sources()) }
  }
}

export function profilesRpc(profiles: ApiProfiles, testModel: (payload: string) => Promise<string>) {
  return async (method: string, payload: any) => {
    try {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || JSON.stringify(payload).length > 20000) throw invalid('Invalid API profile request.')
      if (method === 'sources') return { ok: true, value: await profiles.sources() }
      if (method === 'catalog') return { ok: true, value: await profiles.catalog() }
      if (method === 'save') return { ok: true, value: await profiles.save(payload) }
      if (method === 'test') {
        const sources = await profiles.sources()
        const source = sources.sources.find(s => s.provider === payload.provider && s.active)
        if (!source || !source.models.some((m: any) => m.id === payload.model)) throw invalid('Choose a currently registered API model.')
        if (typeof payload.prompt !== 'string' || !payload.prompt.trim() || payload.prompt.length > 2000) throw invalid('Enter a short test message.')
        return { ok: true, value: JSON.parse(await testModel(JSON.stringify({ provider: payload.provider, model: payload.model, prompt: payload.prompt }))) }
      }
      return { ok: false, error: { code: 'not-found', message: 'Unknown API profile operation.', details: {} } }
    } catch (error: any) {
      return { ok: false, error: { code: error.code === 'INVALID_CONFIG' ? 'bad-request' : 'internal', message: error.code === 'INVALID_CONFIG' ? error.message : 'API profile operation failed. Check provider settings and service availability.', details: {} } }
    }
  }
}
