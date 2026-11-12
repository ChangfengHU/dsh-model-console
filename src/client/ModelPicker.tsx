import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
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
import type { ProviderRow, RuntimeCatalog } from '../wire.ts'
import { CATALOG_CHANGED, errorText, type ModelConsoleApi } from './api.ts'

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
  const [catalog, setCatalog] = useState<RuntimeCatalog | null>(null),
    [catalogLoading, setCatalogLoading] = useState(false),
    [catalogError, setCatalogError] = useState('')
  const [switching, setSwitching] = useState(false), switchLock = useRef(false)
  const generation = useRef(0), nativeLoad = useRef(load)
  nativeLoad.current = load
  const refreshCatalog = useCallback(async () => {
    const id = ++generation.current
    setCatalogLoading(true)
    try {
      const result = await api.catalog()
      if (id === generation.current) { setCatalog(result); setFavorites(result.preferences.favoriteModels); setCatalogError('') }
    } catch {
      if (id === generation.current) setCatalogError('Could not refresh the configured model catalog. Retry before switching models.')
    } finally { if (id === generation.current) setCatalogLoading(false) }
  }, [api])
  const refresh = useCallback(() => { nativeLoad.current(); void refreshCatalog() }, [refreshCatalog])
  const root = useRef<HTMLDivElement>(null),
    panel = useRef<HTMLDivElement>(null)
  const providers: ProviderRow[] = catalog?.providers ?? []
  const current: Selection | null = state.current
  const owner = current ? providers.find((p) => p.id === current.provider) ?? state.groups.find((p: any) => p.id === current.provider) : undefined
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
  const busy = switching || state.status === 'selecting'
  const currentEffort = active && current ? effortOf(active, current) : ''
  const effortLabel = active?.efforts.find((e) => e.id === currentEffort)?.name ?? currentEffort
  useEffect(() => {
    if (open && !draft && state.current) setDraft(state.current)
  }, [open, draft, state.current])
  useEffect(() => {
    if (!available) return
    refresh()
    window.addEventListener('dsh-model-console:default-saved', refresh)
    window.addEventListener(CATALOG_CHANGED, refresh)
    return () => {
      generation.current++
      window.removeEventListener('dsh-model-console:default-saved', refresh)
      window.removeEventListener(CATALOG_CHANGED, refresh)
    }
  }, [available, refresh])
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
    refresh()
  }
  const apply = async () => {
    if (!draft || busy || switchLock.current) return
    switchLock.current = true; setSwitching(true); setFailure('')
    try {
      if (await select(draft)) {
        setOpen(false)
        root.current?.querySelector('button')?.focus()
      } else setFailure(directory.getSnapshot().error ?? 'Model switch failed. Try again.')
    } catch (cause) { setFailure(errorText(cause)) }
    finally { switchLock.current = false; setSwitching(false) }
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
                style={{ position: 'fixed', ...position, boxSizing: 'border-box', maxHeight: `min(560px, calc(100dvh - ${position.bottom + 12}px))` }}
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
                        const p = providers.find((p) => p.id === e.target.value)
                        if (!p) return
                        const r =
                          projectModels(p).find((r) => r.id === row?.id) ?? projectModels(p)[0]
                        if (r) setDraft(selectChoice(p.id, r))
                      }}
                    >
                      {draft && !provider ? (
                        <option value={draft.provider}>{draft.provider} (Current)</option>
                      ) : null}
                      {providers.map((p) => (
                        <option key={p.id} value={p.id} disabled={!p.models.length}>
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
                  <p className="dmc-muted">{catalogLoading ? 'Loading configured models…' : provider?.catalogError || 'No matching models'}</p>
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
                {state.error || failure || catalogError ? (
                  <p className="dmc-error" role="alert">
                    {catalogError || failure || state.error}
                  </p>
                ) : null}
                {catalog?.providers.some(p => p.catalogError) ? (
                  <p className="dmc-muted">
                    {catalog.providers.filter(p => p.catalogError).length} source catalogs unavailable
                  </p>
                ) : null}
                <div className="dmc-actions">
                  <button disabled={busy || catalogLoading} onClick={refresh}>
                    {catalogLoading ? 'Refreshing…' : 'Refresh catalog'}
                  </button>
                  <button
                    className="dmc-primary"
                    disabled={!draft || !row || busy || locked || catalogLoading || !!catalogError}
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
