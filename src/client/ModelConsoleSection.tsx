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
          next.providers.some((p) => p.id === current)
            ? current
            : next.defaultModel.provider || next.providers[0]?.id || '',
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
      valueOf(
        await api.standard.settings.mutate({
          ns: 'model-console',
          expectedRevision: snapshot.preferences.revision,
          ops: [{ op: 'set', path: ['favoriteModels'], value: next }],
        }),
      )
      const after = valueOf(await api.standard.settings.describe({})).namespaces.find(
        (n) => n.ns === 'model-console',
      )
      if (JSON.stringify(after?.value.favoriteModels) !== JSON.stringify(next))
        throw new Error('收藏保存未确认，请刷新后重试')
      setSnapshot((current) =>
        current
          ? {
              ...current,
              preferences: {
                ...current.preferences,
                favoriteModels: next,
                revision: after!.revision,
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
          <div className="dmc-eyebrow">模型管理</div>
          <h2>Model Console</h2>
          <p className="dmc-muted">统一管理接入来源、常用模型和新会话默认设置。</p>
        </div>
        <button disabled={loading} onClick={() => void refresh()}>
          {loading ? '刷新中…' : '刷新状态'}
        </button>
      </header>
      {error ? (
        <p className="dmc-error" role="alert">
          {error}{' '}
          <button className="dmc-link" onClick={() => void refresh()}>
            重试刷新
          </button>
        </p>
      ) : null}
      <div className="dmc-summary">
        <div>
          <strong>3</strong>
          <small>接入方式</small>
        </div>
        <div>
          <strong>{snapshot?.providers.length ?? '—'}</strong>
          <small>接入来源</small>
        </div>
        <div>
          <strong>{coreCount || '—'}</strong>
          <small>核心型号 · 池目录去重</small>
        </div>
        <div>
          <strong>{rawCount || '—'}</strong>
          <small>原始条目 · 含档位</small>
        </div>
      </div>
      <div className="dmc-tabs" role="tablist" aria-label="模型管理页面">
        {[
          ['catalog', '模型目录'],
          ['sources', '接入来源'],
          ['default', '默认设置'],
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
            {id === 'default' && dirty ? ' · 未保存' : ''}
          </button>
        ))}
      </div>
      {!snapshot ? (
        <p className="dmc-muted" role="status">
          {loading ? '正在读取模型目录和本机状态…' : '状态读取失败，请重试刷新。'}
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
                接入来源
                <select
                  aria-label="接入来源"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  {snapshot.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {sourceName(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dmc-field">
                搜索模型
                <input
                  placeholder="模型名称或 ID"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="dmc-filter-row">
              <div className="dmc-filters" aria-label="目录筛选">
                {[
                  ['core', '常用'],
                  ['favorites', '收藏'],
                  ['all', '全部模型'],
                ].map(([id, label]) => (
                  <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="dmc-muted">
                {visible.length} 个型号 / {provider?.models.length ?? 0} 个原始条目
              </span>
            </div>
            {provider?.id === 'codex-local' ? (
              <p className="dmc-muted">按本机 Codex 目录顺序展示；常用页保留前四个模型，收藏和当前默认值也会保留。</p>
            ) : null}
            {snapshot.defaultModel.provider === source &&
            provider &&
            !choiceFor(provider, snapshot.defaultModel) ? (
              <p className="dmc-callout">
                当前默认值仍保留：{snapshot.defaultModel.model}（不在已加载目录中）
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
                          {pinned === row.id ? ' · 新会话默认' : ''}
                        </div>
                      </div>
                      <button
                        className="dmc-star"
                        aria-label={(starred ? '取消收藏 ' : '收藏 ') + row.name}
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
                          推理档位
                          <select
                            aria-label="推理档位"
                            value={effortOf(row, selection)}
                            onChange={(e) =>
                              setChoices((current) => ({
                                ...current,
                                [key]: selectChoice(source, row, e.target.value),
                              }))
                            }
                          >
                            {!row.suffixEfforts ? <option value="">模型默认</option> : null}
                            {row.efforts.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <span className="dmc-muted">使用模型默认档位</span>
                      )}
                      <div className="dmc-actions">
                        <button disabled={!!testing} onClick={() => void test(selection)}>
                          {testing === JSON.stringify(selection) ? '测试中…' : '测试模型'}
                        </button>
                        <button
                          onClick={() => {
                            setStaged({ ...selection })
                            setTab('default')
                          }}
                        >
                          设为默认…
                        </button>
                      </div>
                    </div>
                    {result ? (
                      <p className={result.ok ? 'dmc-success' : 'dmc-error'} role="status">
                        {result.ok
                          ? '实测通过 · 首字 ' +
                            (result.firstTokenMs ?? '—') +
                            'ms · 总耗时 ' +
                            result.durationMs +
                            'ms'
                          : '测试失败 · ' + result.code + ' · ' + result.message}{' '}
                        · {timeText(result.testedAt)}
                        <br />
                        <small>
                          测试目标：{result.provider} / {result.model}
                          {result.reasoningEffort ? ' · ' + result.reasoningEffort : ''}
                        </small>
                      </p>
                    ) : null}
                  </article>
                )
              })}
            </div>
            {!visible.length ? (
              <p className="dmc-empty">没有匹配的模型。尝试“全部模型”或其他来源。</p>
            ) : null}
            <p className="dmc-muted">
              测试发送一次短请求，不创建聊天会话。结果只代表该来源与型号在测试时间的响应；额度以账号池管理为准。
            </p>
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
            状态更新于 {timeText(snapshot.checkedAt)} · 时间按浏览器本地时区显示
          </footer>
        </>
      )}
    </section>
  )
}
