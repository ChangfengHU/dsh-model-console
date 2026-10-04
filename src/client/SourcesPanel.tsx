import { useEffect, useRef, useState } from 'react'
import type { ModelConsoleSnapshot, ModelTestResult, ProviderRow } from '../wire.ts'
import { sourceKind, sourceName } from '../catalog.ts'
import type { ModelConsoleApi, Namespace } from './api.ts'
import { errorText, valueOf, timeText } from './api.ts'
import { RuntimeSettings } from './RuntimeSettings.tsx'

interface Connection {
  namespace: Namespace
  path: string[]
  profile: Record<string, any>
  writable: boolean
  credential: boolean | null
}

function resolveConnection(
  namespaces: Namespace[],
  id: string,
): Omit<Connection, 'writable' | 'credential'> | undefined {
  const pi = namespaces.find((n) => n.ns === 'llm-pi-ai')
  if (pi?.value.providers?.[id])
    return { namespace: pi, path: ['providers', id], profile: pi.value.providers[id] }
  const deepseek = namespaces.find((n) => n.ns === 'llm-deepseek')
  if (id === 'deepseek-official' && deepseek)
    return { namespace: deepseek, path: [], profile: deepseek.value }
}

function ApiSettings({
  api,
  provider,
  connection,
  onSaved,
}: {
  api: ModelConsoleApi
  provider: ProviderRow
  connection: Connection
  onSaved: () => Promise<void>
}) {
  const [endpoint, setEndpoint] = useState(connection.profile.baseURL ?? '')
  const [key, setKey] = useState(''),
    [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false),
    [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const dirty = endpoint !== (connection.profile.baseURL ?? '') || key.length > 0
  const save = async () => {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    setMessage('')
    setFailed(false)
    let newRef: string | undefined,
      committed = false
    try {
      const unchangedDefault = !endpoint && connection.profile.baseURL === undefined
      const url = unchangedDefault ? null : new URL(endpoint)
      if (
        url &&
        (!['https:', 'http:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash)
      )
        throw new Error('请填写 HTTP / HTTPS Base URL，不含密钥、查询参数或片段')
      const baseURL = url?.toString().replace(/\/$/, '')
      const described = valueOf(await api.standard.settings.describe({}))
      const current = described.namespaces.find((n) => n.ns === connection.namespace.ns)
      if (!described.writable || !current) throw new Error('此来源的设置不可写')
      if (current.revision !== connection.namespace.revision)
        throw new Error('配置已被其他页面修改；请刷新来源后重试，草稿仍保留')
      if (key.trim()) {
        newRef =
          'DMC_' +
          provider.id.toUpperCase().replace(/[^A-Z0-9]/g, '_') +
          '_' +
          crypto.randomUUID().replace(/-/g, '')
        valueOf(await api.standard.credentials.set({ ref: newRef, value: key.trim() }))
      }
      const ops = [
        ...(baseURL === undefined
          ? []
          : [{ op: 'set', path: [...connection.path, 'baseURL'], value: baseURL }]),
        ...(newRef ? [{ op: 'set', path: [...connection.path, 'apiKeyEnv'], value: newRef }] : []),
      ]
      try {
        valueOf(
          await api.standard.settings.mutate({
            ns: current.ns,
            ops,
            expectedRevision: current.revision,
          }),
        )
        committed = true
      } catch (cause) {
        // A lost response can follow a successful write. Never remove a credential that a profile now references.
        const after = valueOf(await api.standard.settings.describe({})).namespaces.find(
          (n) => n.ns === current.ns,
        )
        const profile = connection.path.reduce((p, segment) => p?.[segment], after?.value as any)
        committed = profile?.baseURL === baseURL && (!newRef || profile?.apiKeyEnv === newRef)
        if (!committed) throw cause
      }
      const after = valueOf(await api.standard.settings.describe({})).namespaces.find(
        (n) => n.ns === current.ns,
      )
      const profile = connection.path.reduce((p, segment) => p?.[segment], after?.value as any)
      if (profile?.baseURL !== baseURL || (newRef && profile?.apiKeyEnv !== newRef))
        throw new Error('保存结果未确认，请刷新检查；草稿已保留')
      setKey('')
      setEndpoint(baseURL ?? '')
      setMessage('已保存并确认 · ' + timeText(Date.now()) + '。请测试模型验证新连接。')
      await onSaved().catch(() => {})
    } catch (cause) {
      // Cleanup only after a confirmed uncommitted settings write; an unknown outcome keeps the new reference recoverable.
      if (newRef && !committed) {
        try {
          const after = valueOf(await api.standard.settings.describe({})).namespaces.find(
            (n) => n.ns === connection.namespace.ns,
          )
          const profile = connection.path.reduce((p, segment) => p?.[segment], after?.value as any)
          if (after && profile?.apiKeyEnv !== newRef)
            valueOf(await api.standard.credentials.unset({ ref: newRef }))
        } catch {}
      }
      setFailed(true)
      setMessage(errorText(cause))
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  return (
    <section className="dmc-settings">
      <h3>API 连接设置</h3>
      <fieldset className="dmc-fields" disabled={!connection.writable || saving}>
        <label className="dmc-field">
          Base URL
          <input
            value={endpoint}
            placeholder="留空时使用运行时默认地址"
            onChange={(e) => {
              setEndpoint(e.target.value)
              setMessage('')
            }}
          />
        </label>
        <label className="dmc-field">
          API Key
          <input
            type="password"
            autoComplete="new-password"
            value={key}
            placeholder="留空保留现有密钥"
            onChange={(e) => {
              setKey(e.target.value)
              setMessage('')
            }}
          />
        </label>
      </fieldset>
      <p className="dmc-muted">
        {connection.credential === true
          ? '凭据已配置'
          : connection.credential === false
            ? '凭据未配置'
            : '凭据状态待检查'}
        {connection.profile.apiKeyEnv ? ' · 引用 ' + connection.profile.apiKeyEnv : ''}
        。已保存密钥不回显。
      </p>
      <div className="dmc-savebar">
        <span
          role="status"
          className={failed ? 'dmc-error' : dirty ? 'dmc-pending' : 'dmc-success'}
        >
          {message || (dirty ? '有未保存的修改' : '配置已保存 · 连通性需单独测试')}
        </span>
        <div className="dmc-actions">
          <button
            disabled={!dirty || saving}
            onClick={() => {
              setEndpoint(connection.profile.baseURL ?? '')
              setKey('')
              setMessage('')
              setFailed(false)
            }}
          >
            取消修改
          </button>
          <button
            className="dmc-primary"
            disabled={!dirty || !connection.writable || saving}
            onClick={() => void save()}
          >
            {saving ? '保存中…' : '保存连接'}
          </button>
        </div>
      </div>
    </section>
  )
}

export function SourcesPanel({
  api,
  snapshot,
  onSaved,
  onTest,
  testing,
  tests,
}: {
  api: ModelConsoleApi
  snapshot: ModelConsoleSnapshot
  onSaved: () => Promise<void>
  onTest: (provider: string) => void
  testing: boolean
  tests: ModelTestResult[]
}) {
  const [open, setOpen] = useState('codex-local'),
    [connections, setConnections] = useState<Record<string, Connection>>({}),
    [error, setError] = useState('')
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const settings = valueOf(await api.standard.settings.describe({}))
        const profiles = snapshot.providers.flatMap((p) => {
          const c = resolveConnection(settings.namespaces, p.id)
          return c ? [{ id: p.id, ...c }] : []
        })
        const refs = [
          ...new Set(
            profiles
              .map((c) => c.profile.apiKeyEnv)
              .filter((r): r is string => typeof r === 'string' && !!r),
          ),
        ]
        let credentials: Record<string, { configured: boolean; writable: boolean }> = {}
        try {
          credentials = valueOf(await api.standard.credentials.describe({ refs })).credentials
        } catch {}
        if (live) {
          setConnections(
            Object.fromEntries(
              profiles.map((c) => [
                c.id,
                {
                  ...c,
                  writable:
                    settings.writable && credentials[c.profile.apiKeyEnv]?.writable !== false,
                  credential: credentials[c.profile.apiKeyEnv]?.configured ?? null,
                },
              ]),
            ),
          )
          setError('')
        }
      } catch (cause) {
        if (live) setError(errorText(cause))
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [snapshot.checkedAt])
  return (
    <div className="dmc-stack">
      <p className="dmc-muted">
        本机登录、直接 API、账号池 API
        是三种接入方式。模型目录已注册不代表有额度；用“测试模型”确认实际生成。
      </p>
      {error ? <p className="dmc-error">来源配置读取失败：{error}</p> : null}
      {(['本机登录', '直接 API', '账号池 API'] as const).map((kind) => (
        <section key={kind}>
          <h3>{kind}</h3>
          {snapshot.providers
            .filter((p) => sourceKind(p) === kind)
            .map((provider) => {
              const connection = connections[provider.id],
                codex = provider.id === 'codex-local',
                claude = provider.id === 'claude-local'
              const auth = codex ? snapshot.codex.auth.label : claude ? snapshot.claude.label : null
              const installed = codex
                ? snapshot.codex.installed
                : claude
                  ? snapshot.claude.installed
                  : null
              const version = codex
                ? snapshot.codex.version
                : claude
                  ? snapshot.claude.version
                  : null
              const url = connection?.profile.baseURL
              const lastTest = tests
                .filter((t) => t.provider === provider.id)
                .sort((a, b) => b.testedAt - a.testedAt)[0]
              const poolUrl =
                kind === '账号池 API' && typeof url === 'string'
                  ? url.replace(/\/v1\/?$/, '/')
                  : null
              return (
                <article className="dmc-card" key={provider.id}>
                  <div className="dmc-source-row">
                    <div className="dmc-source-icon">
                      {codex ? 'C' : claude ? 'A' : kind === '账号池 API' ? 'P' : '↗'}
                    </div>
                    <div className="dmc-source-main">
                      <b>{sourceName(provider)}</b>
                      <p className="dmc-muted">
                        {provider.id} · {provider.models.length} 个原始条目
                      </p>
                      {url ? <code>{url}</code> : null}
                    </div>
                    <button
                      aria-expanded={open === provider.id}
                      onClick={() => setOpen(open === provider.id ? '' : provider.id)}
                    >
                      {open === provider.id ? '收起' : '详情 / 设置'}
                    </button>
                  </div>
                  <div className="dmc-badges">
                    <span>来源已注册</span>
                    {auth ? (
                      <span>
                        {installed ? '已安装' : '未检测到安装'} · {auth}
                      </span>
                    ) : (
                      <span>{connection?.credential === true ? '凭据已配置' : '凭据待检查'}</span>
                    )}
                    <span>
                      {provider.catalogError
                        ? '目录加载失败'
                        : lastTest
                          ? '目录已加载'
                          : '目录已加载 · 生成待测试'}
                    </span>
                  </div>
                  {lastTest ? (
                    <p className={lastTest.ok ? 'dmc-success' : 'dmc-error'}>
                      最近实测{lastTest.ok ? '通过' : '失败'} · {lastTest.model} ·{' '}
                      {timeText(lastTest.testedAt)}
                    </p>
                  ) : null}
                  {open === provider.id ? (
                    <div className="dmc-body">
                      {installed !== null ? (
                        <div className="dmc-callout">
                          <b>
                            {installed ? version || 'CLI 已安装' : '当前可执行路径未检测到 CLI'}
                          </b>
                          <p>{codex ? snapshot.codex.executable : snapshot.claude.executable}</p>
                          <p>
                            {claude
                              ? '默认别名不代表已登录。Claude Code 使用自己的认证和额度，与 AG Pool 的 Claude 模型分开。'
                              : '本机登录表示复用 Codex 现有认证。模型目录自动跟随本机 Codex，常用页显示前四个；其余在全部模型中。'}
                          </p>
                        </div>
                      ) : null}
                      {codex || claude ? (
                        <RuntimeSettings
                          api={api}
                          kind={codex ? 'codex' : 'claude'}
                          onSaved={onSaved}
                        />
                      ) : connection ? (
                        <ApiSettings
                          key={provider.id}
                          api={api}
                          provider={provider}
                          connection={connection}
                          onSaved={onSaved}
                        />
                      ) : (
                        <p className="dmc-muted">
                          此来源未提供可编辑命名空间，请在原生“模型”页管理高级配置。
                        </p>
                      )}
                      <div className="dmc-actions">
                        <button
                          disabled={testing || !provider.models.length}
                          onClick={() => onTest(provider.id)}
                        >
                          选择模型并测试
                        </button>
                        {poolUrl ? (
                          <a className="dmc-button" href={poolUrl} target="_blank" rel="noreferrer">
                            打开账号池管理 ↗
                          </a>
                        ) : null}
                      </div>
                      {poolUrl ? (
                        <p className="dmc-muted">
                          账号、额度、自动接力及请求记录在账号池中管理。本页尚未取得额度和实际接力元数据。
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              )
            })}
        </section>
      ))}
    </div>
  )
}
