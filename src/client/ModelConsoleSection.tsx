import { useCallback, useEffect, useRef, useState } from 'react'
import type { ModelConsoleSnapshot, ModelTestResult } from '../wire.ts'
import {
  choiceKey,
  choiceFor,
  effortOf,
  projectModels,
  selectChoice,
  sourceKind,
  sourceName,
  type Selection,
} from '../catalog.ts'
import type { ModelConsoleApi } from './api.ts'
import { errorText, timeText, valueOf } from './api.ts'
import { DefaultPanel } from './DefaultPanel.tsx'
import { SourcesPanel } from './SourcesPanel.tsx'
export type { ModelConsoleApi } from './api.ts'

export function ModelConsoleSection({ api }: { api: ModelConsoleApi }) {
  const [snapshot, setSnapshot] = useState<ModelConsoleSnapshot | null>(null)
  const [tab, setTab] = useState('catalog'),
    [source, setSource] = useState(''),
    [view, setView] = useState('core'),
    [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [dirty, setDirty] = useState(false),
    [staged, setStaged] = useState<Selection | null>(null)
  const [choices, setChoices] = useState<Record<string, Selection>>({}),
    [tests, setTests] = useState<Record<string, ModelTestResult>>({})
  const [testing, setTesting] = useState(''),
    [favoriting, setFavoriting] = useState(false)
  const generation = useRef(0),
    testBusy = useRef(false),
    favoriteBusy = useRef(false)
  const refresh = useCallback(async () => {
    const run = ++generation.current
    setLoading(true)
    setError('')
    try {
      const next = await api.snapshot()
      if (run === generation.current) {
        setSnapshot(next)
        setSource((current) =>
          next.providers.some((p) => p.id === current && sourceKind(p) === '本机登录')
            ? current
            : next.providers.find(p => p.id === next.defaultModel.provider && sourceKind(p) === '本机登录')?.id || next.providers.find(p => sourceKind(p) === '本机登录')?.id || '',
        )
      }
    } catch (cause) {
      if (run === generation.current) setError(errorText(cause))
    } finally {
      if (run === generation.current) setLoading(false)
    }
  }, [api])
  useEffect(() => {
    void refresh()
    return () => {
      generation.current++
    }
  }, [refresh])
  const refreshAfterSave = useCallback(async () => {
    setTests({})
    await refresh()
  }, [refresh])
  const test = async (selection: Selection) => {
    if (testBusy.current) return
    const key = JSON.stringify(selection)
    testBusy.current = true
    setTesting(key)
    try {
      const result = await api.testModel(selection)
      setTests((current) => ({ ...current, [key]: result }))
    } catch (cause) {
      setTests((current) => ({
        ...current,
        [key]: {
          ...selection,
          ok: false,
          code: 'REQUEST_FAILED',
          message: errorText(cause),
          testedAt: Date.now(),
          durationMs: 0,
        },
      }))
    } finally {
      testBusy.current = false
      setTesting('')
    }
  }
  const favorite = async (key: string) => {
    if (!snapshot || favoriteBusy.current) return
    favoriteBusy.current = true
    setFavoriting(true)
    setError('')
    try {
      const next = snapshot.preferences.favoriteModels.includes(key)
        ? snapshot.preferences.favoriteModels.filter((k) => k !== key)
        : [...snapshot.preferences.favoriteModels, key]
      const after = await api.saveFavorites(next, snapshot.preferences.revision)
      if (JSON.stringify(after.favoriteModels) !== JSON.stringify(next))
        throw new Error('Favorite save was not confirmed')
      setSnapshot((current) =>
        current
          ? {
              ...current,
              preferences: {
                ...current.preferences,
                favoriteModels: next,
                revision: after.revision,
              },
            }
          : current,
      )
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      favoriteBusy.current = false
      setFavoriting(false)
    }
  }
  const provider = snapshot?.providers.find((p) => p.id === source)
  const rows = provider ? projectModels(provider) : []
  const pinned =
    provider && snapshot?.defaultModel.provider === provider.id
      ? choiceFor(provider, snapshot.defaultModel)?.id
      : undefined
  const visible = rows.filter(
    (row) =>
      (view === 'all' ||
        row.id === pinned ||
        (view === 'favorites'
          ? snapshot?.preferences.favoriteModels.includes(choiceKey(source, row.id))
          : row.core ||
            snapshot?.preferences.favoriteModels.includes(choiceKey(source, row.id)))) &&
      (row.name + ' ' + row.id).toLowerCase().includes(search.toLowerCase()),
  )
  const rawCount = snapshot?.providers.reduce((n, p) => n + p.models.length, 0) ?? 0
  const coreCount = new Set(
    snapshot?.providers.flatMap((p) =>
      projectModels(p)
        .filter((r) => r.core)
        .map((r) => (sourceKind(p) === '账号池 API' ? 'ag/' + r.id : p.id + '/' + r.id)),
    ),
  ).size
  return (
    <section className="dmc-root">
      <header className="dmc-head">
        <div>
          <div className="dmc-eyebrow">Native CLI models</div>
          <h2>Model Console</h2>
        </div>
        <button disabled={loading} onClick={() => void refresh()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      {error ? (
        <p className="dmc-error" role="alert">
          {error}{' '}
          <button className="dmc-link" onClick={() => void refresh()}>
            Retry
          </button>
        </p>
      ) : null}
      <div className="dmc-tabs" role="tablist" aria-label="Model management">
        {[
          ['catalog', 'Models'],
          ['sources', 'Sources'],
          ['default', 'Defaults'],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            id={'dmc-tab-' + id}
            aria-controls={'dmc-panel-' + id}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'default' && dirty ? ' · Unsaved' : ''}
          </button>
        ))}
      </div>
      {!snapshot ? (
        <p className="dmc-muted" role="status">
          {loading ? 'Loading catalogs and local sign-in status…' : 'Could not load status. Try again.'}
        </p>
      ) : (
        <>
          <div
            hidden={tab !== 'catalog'}
            role="tabpanel"
            id="dmc-panel-catalog"
            aria-labelledby="dmc-tab-catalog"
          >
            <div className="dmc-toolbar">
              <label className="dmc-field">
                Sources
                <select
                  aria-label="Sources"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  {snapshot.providers.filter(p => sourceKind(p) === '本机登录').map((p) => (
                    <option key={p.id} value={p.id}>
                      {sourceName(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dmc-field">
                Search models
                <input
                  placeholder="Model name or ID"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="dmc-filter-row">
              <div className="dmc-filters" aria-label="Catalog filter">
                {[
                  ['core', 'Popular'],
                  ['favorites', 'Favorites'],
                  ['all', 'All models'],
                ].map(([id, label]) => (
                  <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="dmc-muted">
                {visible.length} models / {provider?.models.length ?? 0} catalog entries
              </span>
            </div>
            {snapshot.defaultModel.provider === source &&
            provider &&
            !choiceFor(provider, snapshot.defaultModel) ? (
              <p className="dmc-callout">
                Saved default retained: {snapshot.defaultModel.model} (Not in catalog)
              </p>
            ) : null}
            {provider?.catalogError ? <p className="dmc-error">{provider.catalogError}</p> : null}
            <div className="dmc-model-list">
              {visible.map((row) => {
                const key = choiceKey(source, row.id)
                const selection =
                  choices[key] ??
                  (pinned === row.id ? snapshot.defaultModel : selectChoice(source, row))
                const result = tests[JSON.stringify(selection)],
                  starred = snapshot.preferences.favoriteModels.includes(key)
                return (
                  <article className="dmc-card dmc-model-card" key={key}>
                    <div className="dmc-model-heading">
                      <div>
                        <b>{row.name}</b>
                        <div className="dmc-muted">
                          {row.id}
                          {pinned === row.id ? ' · New-session default' : ''}
                        </div>
                      </div>
                      <button
                        className="dmc-star"
                        aria-label={(starred ? 'Unfavorite ' : 'Favorite ') + row.name}
                        aria-pressed={starred}
                        disabled={favoriting || !snapshot.preferences.writable}
                        onClick={() => void favorite(key)}
                      >
                        {starred ? '★' : '☆'}
                      </button>
                    </div>
                    <div className="dmc-model-controls">
                      {row.efforts.length ? (
                        <label className="dmc-effort">
                          Reasoning effort
                          <select
                            aria-label="Reasoning effort"
                            value={effortOf(row, selection)}
                            onChange={(e) =>
                              setChoices((current) => ({
                                ...current,
                                [key]: selectChoice(source, row, e.target.value),
                              }))
                            }
                          >
                            {!row.suffixEfforts ? <option value="">Model default</option> : null}
                            {row.efforts.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <span className="dmc-muted">Model default effort</span>
                      )}
                      <div className="dmc-actions">
                        <button disabled={!!testing} onClick={() => void test(selection)}>
                          {testing === JSON.stringify(selection) ? 'Testing…' : 'Test'}
                        </button>
                        <button
                          onClick={() => {
                            setStaged({ ...selection })
                            setTab('default')
                          }}
                        >
                          Set default…
                        </button>
                      </div>
                    </div>
                    {result ? (
                      <p className={result.ok ? 'dmc-success' : 'dmc-error'} role="status">
                        {result.ok
                          ? 'Passed · First token ' +
                            (result.firstTokenMs ?? '—') +
                            'ms · Total ' +
                            result.durationMs +
                            'ms'
                          : 'Failed · ' + result.code + ' · ' + result.message}{' '}
                        · {timeText(result.testedAt)}
                        <br />
                        <small>
                          Tested: {result.provider} / {result.model}
                          {result.reasoningEffort ? ' · ' + result.reasoningEffort : ''}
                        </small>
                      </p>
                    ) : null}
                  </article>
                )
              })}
            </div>
            {!visible.length ? (
              <p className="dmc-empty">No matching models</p>
            ) : null}
          </div>
          <div
            hidden={tab !== 'sources'}
            role="tabpanel"
            id="dmc-panel-sources"
            aria-labelledby="dmc-tab-sources"
          >
            <SourcesPanel
              api={api}
              snapshot={snapshot}
              onSaved={refreshAfterSave}
              tests={Object.values(tests)}
              testing={!!testing}
              onTest={(id) => {
                setSource(id)
                setTab('catalog')
                setView('core')
                setSearch('')
              }}
            />
          </div>
          <div
            hidden={tab !== 'default'}
            role="tabpanel"
            id="dmc-panel-default"
            aria-labelledby="dmc-tab-default"
          >
            <DefaultPanel
              api={api}
              snapshot={snapshot}
              staged={staged}
              onSaved={refresh}
              onDirty={setDirty}
            />
          </div>
          <footer className="dmc-muted dmc-footer">
            Checked {timeText(snapshot.checkedAt)} · Browser local time
          </footer>
        </>
      )}
    </section>
  )
}
