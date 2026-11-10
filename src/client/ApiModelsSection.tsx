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
  return <section className="dmc-api-editor" aria-label={source.name + ' API settings'}>
    <div className="dmc-api-title"><h3>{source.name}</h3><span className="dmc-muted">{source.provider}</span><span className={source.credential.configured ? 'dmc-success' : 'dmc-muted'}>{source.credential.configured ? 'Key configured' : 'No key configured'}</span></div>
    <div className="dmc-api-grid">
      <label className="dmc-field">Base URL<input aria-label={source.name + ' Base URL'} value={endpoint} placeholder="Leave blank for the current or adapter-default URL" onChange={e => { setEndpoint(e.target.value); setNote('') }} /></label>
      <label className="dmc-field">API Key<input aria-label={source.name + ' API Key'} type="password" autoComplete="new-password" value={key} placeholder={source.credential.configured ? 'Saved; leave blank to keep' : 'Enter a key for this source'} onChange={e => { setKey(e.target.value); setNote('') }} /></label>
    </div>
    <div className="dmc-api-meta"><span>{source.credential.ref || 'No credential reference'}</span>{source.credential.source ? <span>Storage: {source.credential.source}</span> : null}<button className="dmc-link" disabled={!!busy || !dirty || !source.writable} onClick={() => void run('save', async () => {
      await profilesCall('save', { provider: source.provider, baseURL: endpoint, ...(key.trim() ? { apiKey: key.trim() } : {}), expectedRevision: source.revision })
      setKey(''); await refresh(); setNote('Connection saved')
    })}>{busy === 'save' ? 'Saving…' : 'Save connection'}</button></div>
    {source.active && source.models.length ? <div className="dmc-api-test">
      <div className="dmc-api-test-head"><label className="dmc-field">Test model<select aria-label={source.name + ' Test model'} value={model} onChange={e => { setModel(e.target.value); setResult(null) }}>{source.models.map((m: any) => <option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label>
        <button disabled={!!busy || dirty || !model || !prompt.trim()} onClick={() => void run('test', async () => { setResult(await profilesCall('test', { provider: source.provider, model, prompt })) })}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button></div>
      <label className="dmc-field">Test input<textarea aria-label={source.name + ' Test input'} value={prompt} rows={2} onChange={e => setPrompt(e.target.value)} maxLength={2000} /></label>
      {dirty ? <span className="dmc-pending">Save changes before testing</span> : null}
      {result ? <div role="status" className={result.ok ? 'dmc-success' : 'dmc-error'}>{result.ok ? 'Passed' : 'Failed · ' + result.code} · {result.durationMs}ms · {timeText(result.testedAt)}{result.output ? <pre className="dmc-api-output">{result.output}</pre> : null}{result.message ? <p>{result.message}</p> : null}</div> : null}
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
  return <section className="dmc-root" data-models-api="0.4.2">
    <header className="dmc-head"><h2>Models</h2><button disabled={loading} onClick={() => void refresh().catch(() => {})}>{loading ? 'Loading…' : 'Refresh sources'}</button></header>
    {error ? <p className="dmc-error" role="alert">{error}<button className="dmc-link" onClick={() => void refresh().catch(() => {})}>Retry</button></p> : null}
    {loading && !sources.length ? <p role="status" className="dmc-muted">Loading API sources…</p> : null}
    {configured.map(s => <SourceEditor key={s.provider + ':' + s.revision} source={s} refresh={refresh} />)}
    {!loading && !error && !configured.length ? <p className="dmc-empty">No API sources configured</p> : null}
    {available.length ? <div className="dmc-api-add"><label className="dmc-field">Add API source<select aria-label="Add API source" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Select an available source</option>{available.map(s => <option key={s.provider} value={s.provider}>{s.name}</option>)}</select></label></div> : null}
    {picked && !picked.configured && !picked.active ? <SourceEditor key={picked.provider + ':' + picked.revision} source={picked} refresh={refresh} /> : null}
  </section>
}
