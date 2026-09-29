import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { projectQwenRuntime, type ModelConsoleSnapshot } from '../wire.ts'

const QWEN_ROUTE = 'qwen-bailian'
const QWEN_KEY_REF = 'QWEN_BAILIAN_API_KEY'
const QWEN_ENDPOINTS = {
  cn: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  sg: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  us: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
} as const

type Region = keyof typeof QWEN_ENDPOINTS

interface RpcResult<T> { result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } } }
interface StandardApi {
  llm: {
    providers(payload: {}): Promise<RpcResult<{ providers: Array<{ provider: string; active: boolean }> }>>
    discoverModels(payload: Record<string, unknown>): Promise<RpcResult<{ models: Array<{ id: string }> }>>
  }
  settings: {
    describe(payload: {}): Promise<RpcResult<{ writable: boolean; namespaces: Array<{ ns: string; value: unknown; user?: unknown; revision: number }> }>>
    mutate(payload: Record<string, unknown>): Promise<RpcResult<{ revision: number }>>
  }
  credentials: {
    describe(payload: { refs: string[] }): Promise<RpcResult<{ credentials: Record<string, { configured: boolean; writable: boolean; source?: string }> }>>
    set(payload: { ref: string; value: string }): Promise<RpcResult<{}>>
  }
}

export interface ModelConsoleApi {
  snapshot(): Promise<ModelConsoleSnapshot>
  standard: StandardApi
}

function valueOf<T>(result: RpcResult<T>): T {
  if (!result.result.ok) throw new Error(result.result.error.message)
  return result.result.value
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function ModelConsoleSection({ api }: { api: ModelConsoleApi }): ReactNode {
  const [snapshot, setSnapshot] = useState<ModelConsoleSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [codexOpen, setCodexOpen] = useState(false)
  const [qwenOpen, setQwenOpen] = useState(false)
  const [region, setRegion] = useState<Region>('cn')
  const [apiKey, setApiKey] = useState('')
  const [qwenConfigured, setQwenConfigured] = useState(false)
  const [qwenCredential, setQwenCredential] = useState(false)
  const [qwenWritable, setQwenWritable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const [next, described, credential] = await Promise.all([
        api.snapshot(),
        api.standard.settings.describe({}),
        api.standard.credentials.describe({ refs: [QWEN_KEY_REF] }),
      ])
      const settings = valueOf(described)
      const namespace = settings.namespaces.find(item => item.ns === 'llm-pi-ai')
      const providers = asObject(asObject(namespace?.value).providers)
      setSnapshot(next)
      setQwenConfigured(asObject(providers[QWEN_ROUTE]).baseURL !== undefined)
      const credentialState = valueOf(credential).credentials[QWEN_KEY_REF]
      setQwenCredential(credentialState?.configured === true)
      setQwenWritable(settings.writable && credentialState?.writable !== false && namespace !== undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const codexProvider = useMemo(
    () => snapshot?.providers.find(provider => provider.id === 'codex-local'),
    [snapshot],
  )
  const qwenRuntime = useMemo(
    () => projectQwenRuntime(snapshot?.providers ?? [], QWEN_ROUTE),
    [snapshot],
  )

  const configureQwen = async (): Promise<void> => {
    setSaving(true)
    setMessage(null)
    try {
      if (!qwenWritable) throw new Error('DSH settings or credentials are read-only')
      if (!qwenCredential && apiKey.trim().length === 0) throw new Error('First-time setup needs an API key')
      const endpoint = QWEN_ENDPOINTS[region]
      const describe = valueOf(await api.standard.settings.describe({}))
      const namespace = describe.namespaces.find(item => item.ns === 'llm-pi-ai')
      if (!namespace) throw new Error('llm-pi-ai is not installed')
      const probe = valueOf(await api.standard.llm.discoverModels({
        settingsNs: 'llm-pi-ai',
        ...(qwenConfigured ? { provider: QWEN_ROUTE } : { baseURL: endpoint, api: 'openai-completions' }),
        ...(apiKey.trim().length === 0 ? {} : { apiKey: apiKey.trim() }),
      }))
      if (probe.models.length === 0) throw new Error('Qwen returned an empty model catalog')
      const profile = {
        displayName: 'Qwen ModelStudio',
        apiKeyEnv: QWEN_KEY_REF,
        api: 'openai-completions',
        baseURL: endpoint,
        models: [
          { id: 'qwen-plus-latest', name: 'Qwen Plus Latest', contextWindow: 131072, maxTokens: 32768, input: ['text'] },
          { id: 'qwen-flash', name: 'Qwen Flash', contextWindow: 1000000, maxTokens: 32768, input: ['text'] },
        ],
      }
      const write = await api.standard.settings.mutate({
        ns: 'llm-pi-ai',
        ops: [{ op: 'set', path: ['providers', QWEN_ROUTE], value: profile }],
        expectedRevision: namespace.revision,
      })
      valueOf(write)
      if (apiKey.trim().length > 0) valueOf(await api.standard.credentials.set({ ref: QWEN_KEY_REF, value: apiKey.trim() }))
      setApiKey('')
      setMessage('Qwen configuration and credential were verified and saved.')
      await refresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const providerCount = snapshot?.providers.length ?? 0
  const modelCount = snapshot?.providers.reduce((sum, provider) => sum + provider.models.length, 0) ?? 0
  const authGood = snapshot?.codex.auth.authenticated === true
  const qwenStatus = qwenRuntime.mode === 'dedicated'
    ? '已连接（专用路由）'
    : qwenRuntime.mode === 'compatible'
      ? '已连接（兼容路由）'
      : '待配置'

  return (
    <section className="dmc-root">
      <div className="dmc-wrap">
        <header className="dmc-head">
          <div><h2>Model Console</h2><p>真实运行时、机器本地认证和安全 Provider 配置。</p></div>
          <button className="dmc-btn" disabled={loading} onClick={() => { void refresh() }}>
            {loading ? <><span className="dmc-spinner" /> 刷新中</> : '刷新状态'}
          </button>
        </header>
        {error ? <p className="dmc-error">{error}</p> : null}
        <div className="dmc-summary">
          <div><small>实际 Provider</small><strong>{providerCount} 个已注册</strong></div>
          <div><small>实际模型</small><strong>{modelCount} 个可发现</strong></div>
          <div><small>本机 Codex</small><strong>{authGood ? '已认证' : '需要检查'}</strong></div>
        </div>

        <div className="dmc-section-title">本机与 API Provider</div>
        <article className="dmc-card">
          <div className="dmc-row">
            <div className="dmc-logo dmc-logo-codex">C</div>
            <div><div className="dmc-name">Codex App Server <span className={`dmc-badge ${authGood && snapshot?.codex.providerActive ? 'dmc-good' : 'dmc-warn'}`}>{authGood && snapshot?.codex.providerActive ? '已连接' : '需处理'}</span></div><div className="dmc-meta">复用机器本地 Codex CLI 认证 · Provider: codex-local</div></div>
            <button className="dmc-btn" onClick={() => { setCodexOpen(value => !value) }}>{codexOpen ? '收起' : '查看'}</button>
          </div>
          {codexOpen && snapshot ? <div className="dmc-body">
            <div className="dmc-grid">
              <div className="dmc-fact"><small>Codex CLI</small><b>{snapshot.codex.installed ? `已安装${snapshot.codex.version ? ` · ${snapshot.codex.version}` : ''}` : '未安装'}</b></div>
              <div className="dmc-fact"><small>本机认证</small><b>{snapshot.codex.auth.label}</b></div>
              <div className="dmc-fact"><small>DSH Provider</small><b>{snapshot.codex.providerActive ? 'codex-local 已注册' : '未注册'}</b></div>
              <div className="dmc-fact"><small>认证处理</small><b>由 Codex CLI 管理；本页不读取 Token</b></div>
            </div>
            {snapshot.codex.diagnostic ? <p className="dmc-error">{snapshot.codex.diagnostic}</p> : null}
            <div className="dmc-models">{(codexProvider?.models ?? []).map(model => <span className="dmc-model" key={model.id}>{model.id}</span>)}</div>
          </div> : null}
        </article>

        <article className="dmc-card">
          <div className="dmc-row">
            <div className="dmc-logo dmc-logo-qwen">Q</div>
            <div><div className="dmc-name">Qwen ModelStudio <span className={`dmc-badge ${qwenRuntime.connected ? 'dmc-good' : 'dmc-warn'}`}>{qwenStatus}</span></div><div className="dmc-meta">{qwenRuntime.connected ? `${qwenRuntime.providerId} · ${qwenRuntime.models.length} 个 Qwen 模型` : '未检测到可用 Qwen 模型'}</div></div>
            <button className="dmc-btn" onClick={() => { setQwenOpen(value => !value) }}>{qwenOpen ? '收起' : '查看 / 配置'}</button>
          </div>
          {qwenOpen ? <div className="dmc-body">
            <div className="dmc-callout">{qwenRuntime.mode === 'compatible'
              ? `当前 Qwen 已通过 ${qwenRuntime.providerId} 兼容路由正常加载。配置专用 qwen-bailian 是可选操作，不影响现有会话。`
              : qwenRuntime.mode === 'dedicated'
                ? '当前 Qwen 已通过专用 qwen-bailian 路由加载。'
                : '当前运行时未发现 Qwen 模型；可在下方验证并新增专用 qwen-bailian 路由。'}</div>
            <div className="dmc-models">{qwenRuntime.models.map(model => <span className="dmc-model" key={model.id}>{model.id}</span>)}</div>
            <div className="dmc-form" style={{ marginTop: 14 }}>
              <div className="dmc-field"><label>区域</label><select className="dmc-select" value={region} onChange={event => { setRegion(event.target.value as Region) }}><option value="cn">中国（北京）</option><option value="sg">新加坡</option><option value="us">美国（弗吉尼亚）</option></select></div>
              <div className="dmc-field"><label>API Endpoint</label><input className="dmc-input" readOnly value={QWEN_ENDPOINTS[region]} /></div>
              <div className="dmc-field"><label>API Key（只写；已保存值不会回显）</label><input className="dmc-input" type="password" autoComplete="new-password" value={apiKey} placeholder={qwenCredential ? '已配置；留空保持原值' : '首次配置需要输入'} onChange={event => { setApiKey(event.target.value) }} /></div>
              <div className="dmc-actions"><button className="dmc-btn dmc-primary" disabled={saving || !qwenWritable} onClick={() => { void configureQwen() }}>{saving ? '验证并保存中…' : '验证并保存'}</button></div>
              {message ? <p className={message.includes('saved') ? 'dmc-success' : 'dmc-error'}>{message}</p> : null}
            </div>
          </div> : null}
        </article>

        <div className="dmc-section-title">全部运行时 Provider</div>
        <div className="dmc-provider-list">{(snapshot?.providers ?? []).map(provider => <div className="dmc-provider" key={provider.id}><b>{provider.name}</b><small>{provider.id} · {provider.models.length} models{provider.catalogError ? ` · ${provider.catalogError}` : ''}</small></div>)}</div>
        <p className="dmc-foot">原生 Models 页面继续负责通用 Provider 编辑和会话模型选择。本控制台不重复注册 codex-local，不读取 OAuth Token，也不会因 MCP、Tool 或业务验收失败自动切换模型。</p>
      </div>
    </section>
  )
}
