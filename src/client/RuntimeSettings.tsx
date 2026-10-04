import { useEffect, useRef, useState } from 'react'
import type { ModelConsoleApi, Namespace } from './api.ts'
import { valueOf, errorText, timeText } from './api.ts'
const CODEX = 'llm-codex-app-server',
  CLAUDE = 'claude-code-runtime'
export function RuntimeSettings({
  api,
  kind,
  onSaved,
}: {
  api: ModelConsoleApi
  kind: 'codex' | 'claude'
  onSaved: () => Promise<void>
}) {
  const ns = kind === 'codex' ? CODEX : CLAUDE
  const [namespace, setNamespace] = useState<Namespace | null>(null),
    [writable, setWritable] = useState(false),
    [draft, setDraft] = useState<Record<string, any>>({}),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false)
  const busy = useRef(false),
    dirtyRef = useRef(false),
    [expectedRevision, setExpectedRevision] = useState(0)
  const cacheKey = 'dsh-model-console.runtime-draft.' + ns
  const load = async (restore = true) => {
    try {
      const settings = valueOf(await api.standard.settings.describe({}))
      const found = settings.namespaces.find((n) => n.ns === ns)
      let cached: any = null
      try {
        cached = restore ? JSON.parse(sessionStorage.getItem(cacheKey) || 'null') : null
      } catch {}
      setNamespace(found ?? null)
      setDraft(cached?.draft ?? found?.value ?? {})
      setExpectedRevision(
        Number.isInteger(cached?.revision) ? cached.revision : (found?.revision ?? 0),
      )
      setWritable(settings.writable)
      setFailed(false)
      setMessage(found ? '' : '此运行来源尚未注册可编辑设置')
    } catch (cause) {
      setFailed(true)
      setMessage(errorText(cause))
    }
  }
  useEffect(() => {
    void load()
  }, [ns])
  const edit = (field: string, value: unknown) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setMessage('')
    setFailed(false)
  }
  const fields =
    kind === 'codex'
      ? ['imageGenerationEnabled', 'webSearchEnabled', 'webSearchModel', 'webSearchMaxResults', 'networkProxy']
      : ['executable', 'cwd', 'permissionMode', 'timeoutMs', 'modelCacheMs', 'maxRetries']
  const dirty =
    namespace !== null &&
    fields.some((f) => JSON.stringify(draft[f] ?? '') !== JSON.stringify(namespace.value[f] ?? ''))
  dirtyRef.current = dirty
  useEffect(() => {
    if (!namespace) return
    try {
      if (dirty)
        sessionStorage.setItem(cacheKey, JSON.stringify({ draft, revision: expectedRevision }))
      else sessionStorage.removeItem(cacheKey)
    } catch {}
  }, [dirty, draft, expectedRevision, namespace])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  const save = async () => {
    if (!namespace || busy.current) return
    busy.current = true
    setSaving(true)
    setMessage('')
    setFailed(false)
    try {
      const ops = fields
        .filter((f) => JSON.stringify(draft[f] ?? '') !== JSON.stringify(namespace.value[f] ?? ''))
        .map((f) => ({ op: 'set', path: [f], value: draft[f] }))
      valueOf(await api.standard.settings.mutate({ ns, expectedRevision, ops }))
      const current = valueOf(await api.standard.settings.describe({})).namespaces.find(
        (n) => n.ns === ns,
      )
      if (
        !current ||
        fields.some(
          (f) => JSON.stringify(draft[f] ?? '') !== JSON.stringify(current.value[f] ?? ''),
        )
      )
        throw new Error('写入未确认，草稿已保留')
      setNamespace(current)
      setDraft(current.value)
      setExpectedRevision(current.revision)
      setMessage('已保存并确认 · ' + timeText(Date.now()))
      await onSaved().catch(() => {})
    } catch (cause) {
      setFailed(true)
      setMessage(errorText(cause))
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  return (
    <section className="dmc-settings">
      <h3>{kind === 'codex' ? 'Codex 能力设置' : 'Claude Code 运行设置'}</h3>
      <p className="dmc-muted">
        {kind === 'codex'
          ? '与插件中的 Codex App Server 共用同一份配置。'
          : '登录由原生 Claude Code 维护；下一次请求读取这些设置。'}
      </p>
      {namespace ? (
        <fieldset className="dmc-fields" disabled={!writable || saving}>
          {kind === 'codex' ? (
            <>
              <label className="dmc-check">
                <input
                  type="checkbox"
                  checked={draft.imageGenerationEnabled !== false}
                  onChange={(e) => edit('imageGenerationEnabled', e.target.checked)}
                />
                <span>原生图像生成</span>
              </label>
              <label className="dmc-check">
                <input
                  type="checkbox"
                  checked={draft.webSearchEnabled !== false}
                  onChange={(e) => edit('webSearchEnabled', e.target.checked)}
                />
                <span>Codex Web Search 接管</span>
              </label>
              <label className="dmc-field">
                搜索默认模型
                <input
                  value={draft.webSearchModel ?? ''}
                  placeholder="留空跟随主模型"
                  onChange={(e) => edit('webSearchModel', e.target.value)}
                />
              </label>
              <label className="dmc-field">
                搜索最大结果数
                <input
                  type="number"
                  min="1"
                  value={draft.webSearchMaxResults ?? 8}
                  onChange={(e) => edit('webSearchMaxResults', Number(e.target.value))}
                />
              </label>
              <label className="dmc-field">
                Codex 网络代理
                <input
                  aria-label="Codex 网络代理"
                  value={draft.networkProxy ?? ''}
                  placeholder="http://127.0.0.1:7897"
                  onChange={(e) => edit('networkProxy', e.target.value)}
                />
                <span className="dmc-muted">HTTP / Mixed 地址；留空继承服务环境。下一次请求生效。</span>
              </label>
            </>
          ) : (
            <>
              <label className="dmc-field">
                Claude 可执行文件
                <input
                  value={draft.executable ?? ''}
                  onChange={(e) => edit('executable', e.target.value)}
                />
              </label>
              <label className="dmc-field">
                工作目录
                <input value={draft.cwd ?? ''} onChange={(e) => edit('cwd', e.target.value)} />
              </label>
              <label className="dmc-field">
                超时（毫秒）
                <input
                  type="number"
                  min="1000"
                  value={draft.timeoutMs ?? 300000}
                  onChange={(e) => edit('timeoutMs', Number(e.target.value))}
                />
              </label>
              <label className="dmc-field">
                目录缓存（毫秒）
                <input
                  type="number"
                  min="1000"
                  value={draft.modelCacheMs ?? 300000}
                  onChange={(e) => edit('modelCacheMs', Number(e.target.value))}
                />
              </label>
              <label className="dmc-field">
                失败重试次数
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={draft.maxRetries ?? 0}
                  onChange={(e) => edit('maxRetries', Number(e.target.value))}
                />
              </label>
              <label className="dmc-field">
                原生权限模式
                <select
                  value={draft.permissionMode ?? 'dontAsk'}
                  onChange={(e) => edit('permissionMode', e.target.value)}
                >
                  {['default', 'acceptEdits', 'plan', 'dontAsk', 'auto', 'bypassPermissions'].map(
                    (v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </>
          )}
        </fieldset>
      ) : null}
      <div className="dmc-savebar">
        <div role="status" className={failed ? 'dmc-error' : dirty ? 'dmc-pending' : 'dmc-success'}>
          {message || (dirty ? '有未保存的修改' : namespace ? '设置已保存' : '读取中…')}
        </div>
        <div className="dmc-actions">
          <button
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(namespace!.value)
              setMessage('')
              setFailed(false)
            }}
          >
            取消修改
          </button>
          <button
            className="dmc-primary"
            disabled={!dirty || !writable || saving}
            onClick={() => void save()}
          >
            {saving ? '保存中…' : '保存设置'}
          </button>
        </div>
      </div>
      {failed ? (
        <button className="dmc-link" onClick={() => void load(false)}>
          放弃草稿，重新读取当前配置
        </button>
      ) : null}
    </section>
  )
}
