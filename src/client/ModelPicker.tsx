import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  choiceFor,
  choiceKey,
  effortOf,
  projectModels,
  selectChoice,
  sourceName,
  selectionLabel,
  type Selection,
} from '../catalog.ts'
import type { ProviderRow } from '../wire.ts'
import type { ModelConsoleApi } from './api.ts'

export function ModelPicker({
  locked,
  available,
  directory,
  load,
  select,
  api,
}: {
  locked: boolean
  available: boolean
  directory: any
  load: () => void
  select: (selection: Selection) => Promise<boolean>
  api: ModelConsoleApi
}) {
  const state = useSyncExternalStore(
    (fn) => directory.subscribe(fn),
    () => directory.getSnapshot(),
  ) as any
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<Selection | null>(null),
    [view, setView] = useState('core'),
    [search, setSearch] = useState(''),
    [favorites, setFavorites] = useState<string[]>([])
  const [position, setPosition] = useState({ left: 16, bottom: 80 }),
    [failure, setFailure] = useState('')
  const root = useRef<HTMLDivElement>(null),
    panel = useRef<HTMLDivElement>(null)
  const providers: ProviderRow[] = state.groups.map((p: any) => ({
    id: String(p.id),
    name: p.name,
    models: p.models.map((m: any) => ({ ...m, id: String(m.id) })),
  }))
  const current: Selection | null = state.current
  const owner = current ? providers.find((p) => p.id === current.provider) : undefined
  const active = owner && current ? choiceFor(owner, current) : undefined
  const provider = providers.find((p) => p.id === draft?.provider)
  const row = provider && draft ? choiceFor(provider, draft) : undefined
  const rows = provider
    ? projectModels(provider).filter(
        (r) =>
          (view === 'all' ||
            r.id === row?.id ||
            (view === 'favorites'
              ? favorites.includes(choiceKey(provider.id, r.id))
              : r.core || favorites.includes(choiceKey(provider.id, r.id)))) &&
          (r.name + ' ' + r.id).toLowerCase().includes(search.toLowerCase()),
      )
    : []
  const busy = state.status === 'selecting'
  const currentEffort = active && current ? effortOf(active, current) : ''
  const effortLabel = active?.efforts.find((e) => e.id === currentEffort)?.name ?? currentEffort
  useEffect(() => {
    if (open && !draft && state.current) setDraft(state.current)
  }, [open, draft, state.current])
  useEffect(() => {
    if (available) load()
    const refresh = () => { if (available) load() }
    window.addEventListener('dsh-model-console:default-saved', refresh)
    return () => window.removeEventListener('dsh-model-console:default-saved', refresh)
  }, [available, load])
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !panel.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])
  const show = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = root.current!.getBoundingClientRect()
    setPosition({
      left: Math.max(16, Math.min(rect.right - 360, window.innerWidth - 376)),
      bottom: Math.max(12, window.innerHeight - rect.top + 8),
    })
    setDraft(
      current ??
        (providers[0] && projectModels(providers[0])[0]
          ? selectChoice(providers[0].id, projectModels(providers[0])[0]!)
          : null),
    )
    setFailure('')
    setSearch('')
    setOpen(true)
    load()
    void api.snapshot()
      .then(result => setFavorites(result.preferences.favoriteModels))
      .catch(() => {})
  }
  const apply = async () => {
    if (!draft || busy) return
    if (await select(draft)) {
      setOpen(false)
      root.current?.querySelector('button')?.focus()
    } else setFailure(directory.getSnapshot().error ?? 'Model switch failed. Try again.')
  }
  if (!available) return null
  return (
    <div className="dmc-picker" ref={root}>
      <button
        disabled={locked || busy}
        aria-label="Select session model"
        title={current ? [owner ? sourceName(owner) : current.provider, current.model, effortLabel].filter(Boolean).join(' / ') : 'Select session model'}
        aria-expanded={open}
        onClick={show}
      >
        {selectionLabel(owner, current)} ▾
      </button>
      {open
        ? createPortal(
            <div className="dmc-picker">
              <div
                className="dmc-picker-panel"
                ref={panel}
                style={{ position: 'fixed', ...position }}
                role="dialog"
                aria-label="Select session model"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setOpen(false)
                    root.current?.querySelector('button')?.focus()
                  }
                }}
              >
                <h3>Session model</h3>
                <p className="dmc-muted">Changes apply to this session only.</p>
                <div className="dmc-fields">
                  <label className="dmc-field">
                    Source
                    <select
                      aria-label="Source"
                      value={draft?.provider ?? ''}
                      disabled={busy}
                      onChange={(e) => {
                        const p = providers.find((p) => p.id === e.target.value)!
                        const r =
                          projectModels(p).find((r) => r.id === row?.id) ?? projectModels(p)[0]
                        if (r) setDraft(selectChoice(p.id, r))
                      }}
                    >
                      {draft && !provider ? (
                        <option value={draft.provider}>{draft.provider} (Current)</option>
                      ) : null}
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {sourceName(p)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    aria-label="Search session models"
                    placeholder="Search name or ID"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="dmc-filters">
                  {[
                    ['core', 'Popular'],
                    ['favorites', 'Favorites'],
                    ['all', 'All'],
                  ].map(([id, label]) => (
                    <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div>
                  {rows.map((r) => (
                    <button
                      className="dmc-model-pick"
                      key={r.id}
                      aria-pressed={r.id === row?.id}
                      disabled={busy}
                      onClick={() => setDraft(selectChoice(provider!.id, r))}
                    >
                      <span>{r.name}</span>
                      <span>
                        {r.id === row?.id
                          ? '✓'
                          : favorites.includes(choiceKey(provider!.id, r.id))
                            ? '★'
                            : ''}
                      </span>
                    </button>
                  ))}
                </div>
                {draft && !row ? (
                  <p className="dmc-muted">Current selection outside catalog: {draft.model}</p>
                ) : null}
                {!rows.length ? (
                  <p className="dmc-muted">No matching models</p>
                ) : null}
                {row?.efforts.length && draft ? (
                  <label className="dmc-field">
                    Reasoning effort
                    <select
                      aria-label="Reasoning effort"
                      value={effortOf(row, draft)}
                      disabled={busy}
                      onChange={(e) => setDraft(selectChoice(provider!.id, row, e.target.value))}
                    >
                      {!row.suffixEfforts ? <option value="">Model default</option> : null}
                      {row.efforts.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {state.error || failure ? (
                  <p className="dmc-error" role="alert">
                    {failure || state.error}
                  </p>
                ) : null}
                {state.failures.length ? (
                  <p className="dmc-muted">
                    {state.failures.length} source catalogs failed to load
                  </p>
                ) : null}
                <div className="dmc-actions">
                  <button disabled={busy || state.status === 'loading'} onClick={load}>
                    {state.status === 'loading' ? 'Refreshing…' : 'Refresh catalog'}
                  </button>
                  <button
                    className="dmc-primary"
                    disabled={!draft || busy || locked}
                    onClick={() => void apply()}
                  >
                    {busy ? 'Switching…' : 'Apply'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
