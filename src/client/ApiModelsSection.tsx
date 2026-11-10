import { useEffect, useRef, useState } from 'react'
import { errorText, timeText } from './api.ts'

export async function profilesCall(method: string, payload: Record<string, unknown> = {}) {
  const response = await fetch('/model-profiles/' + method, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload }),
  })
  const result = await response.json()
  if (!response.ok || !result.result?.ok) throw new Error(result.result?.error?.message ?? 'API source request failed.')
  return result.result.value
}

function SourceEditor({ source, refresh }: { source: any; refresh: () => Promise<void> }) {
  const [endpoint, setEndpoint] = useState(source.baseURL), [key, setKey] = useState('')
  const [model, setModel] = useState(source.models[0]?.id ?? '')
  const [prompt, setPrompt] = useState('What are three things to check before a day trip?')
  const [result, setResult] = useState<any>(null), [error, setError] = useState(''), [note, setNote] = useState('')
  const [busy, setBusy] = useState(''), lock = useRef(false)
  const dirty = endpoint !== source.baseURL || !!key
  async function run(kind: string, fn: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(kind); setError(''); setNote('')
    try { await fn() } catch (cause) { setError(errorText(cause)) }
    finally { lock.current = false; setBusy('') }
  }
  return <section className="dmc-api-editor" aria-label={source.name + ' API 设置'}>
    <div className="dmc-api-title"><h3>{source.name}</h3><span className="dmc-muted">{source.provider}</span><span className={source.credential.configured ? 'dmc-success' : 'dmc-muted'}>{source.credential.configured ? '密钥已配置' : '未配置密钥'}</span></div>
    <div className="dmc-api-grid">
      <label className="dmc-field">Base URL<input aria-label={source.name + ' Base URL'} value={endpoint} placeholder="留空保留当前地址或使用运行时默认值" onChange={e => { setEndpoint(e.target.value); setNote('') }} /></label>
      <label className="dmc-field">API Key<input aria-label={source.name + ' API Key'} type="password" autoComplete="new-password" value={key} placeholder={source.credential.configured ? '已保存；留空保持不变' : '输入此来源的独立 Key'} onChange={e => { setKey(e.target.value); setNote('') }} /></label>
    </div>
    <div className="dmc-api-meta"><span>{source.credential.ref || '尚未分配凭据引用'}</span>{source.credential.source ? <span>来源：{source.credential.source}</span> : null}<button className="dmc-link" disabled={!!busy || !dirty || !source.writable} onClick={() => void run('save', async () => {
      await profilesCall('save', { provider: source.provider, baseURL: endpoint, ...(key.trim() ? { apiKey: key.trim() } : {}), expectedRevision: source.revision })
      setKey(''); await refresh(); setNote('配置已保存')
    })}>{busy === 'save' ? '保存中…' : '保存连接'}</button></div>
    {source.active && source.models.length ? <div className="dmc-api-test">
      <div className="dmc-api-test-head"><label className="dmc-field">测试模型<select aria-label={source.name + ' 测试模型'} value={model} onChange={e => { setModel(e.target.value); setResult(null) }}>{source.models.map((m: any) => <option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label>
        <button disabled={!!busy || dirty || !model || !prompt.trim()} onClick={() => void run('test', async () => { setResult(await profilesCall('test', { provider: source.provider, model, prompt })) })}>{busy === 'test' ? '测试中…' : '测试连接'}</button></div>
      <label className="dmc-field">测试内容<textarea aria-label={source.name + ' 测试内容'} value={prompt} rows={2} onChange={e => setPrompt(e.target.value)} maxLength={2000} /></label>
      {dirty ? <span className="dmc-pending">先保存修改，再测试已保存的连接</span> : null}
      {result ? <div role="status" className={result.ok ? 'dmc-success' : 'dmc-error'}>{result.ok ? '测试通过' : '测试失败 · ' + result.code} · {result.durationMs}ms · {timeText(result.testedAt)}{result.output ? <pre className="dmc-api-output">{result.output}</pre> : null}{result.message ? <p>{result.message}</p> : null}</div> : null}
    </div> : null}
    {error ? <p role="alert" className="dmc-error">{error}</p> : null}{note ? <p role="status" className="dmc-success">{note}</p> : null}
  </section>
}

export function ApiModelsSection() {
  const [sources, setSources] = useState<any[]>([]), [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const generation = useRef(0)
  async function refresh() {
    const id = ++generation.current; setLoading(true); setError('')
    try { const result = await profilesCall('sources'); if (id === generation.current) setSources(result.sources) }
    catch (cause) { if (id === generation.current) setError(errorText(cause)); throw cause }
    finally { if (id === generation.current) setLoading(false) }
  }
  useEffect(() => { void refresh().catch(() => {}); return () => { generation.current++ } }, [])
  const configured = sources.filter(s => s.configured || s.active), available = sources.filter(s => !s.configured && !s.active)
  const picked = sources.find(s => s.provider === selected)
  return <section className="dmc-root" data-models-api="0.4.1">
    <header className="dmc-head"><h2>Models</h2><button disabled={loading} onClick={() => void refresh().catch(() => {})}>{loading ? '加载中…' : '刷新来源'}</button></header>
    {error ? <p className="dmc-error" role="alert">{error}<button className="dmc-link" onClick={() => void refresh().catch(() => {})}>重试</button></p> : null}
    {loading && !sources.length ? <p role="status" className="dmc-muted">正在读取 API 来源…</p> : null}
    {configured.map(s => <SourceEditor key={s.provider + ':' + s.revision} source={s} refresh={refresh} />)}
    {!loading && !error && !configured.length ? <p className="dmc-empty">尚未配置 API 来源</p> : null}
    {available.length ? <div className="dmc-api-add"><label className="dmc-field">添加 API 来源<select aria-label="添加 API 来源" value={selected} onChange={e => setSelected(e.target.value)}><option value="">选择运行时支持的来源</option>{available.map(s => <option key={s.provider} value={s.provider}>{s.name}</option>)}</select></label></div> : null}
    {picked && !picked.configured && !picked.active ? <SourceEditor key={picked.provider + ':' + picked.revision} source={picked} refresh={refresh} /> : null}
  </section>
}
