import { useEffect, useRef, useState } from 'react'
import { sameSelection, type Selection, sourceName, choiceFor } from '../catalog.ts'
import type { ModelConsoleSnapshot } from '../wire.ts'
import type { ModelConsoleApi } from './api.ts'
import { errorText, timeText, valueOf } from './api.ts'
import { ModelFields } from './ModelFields.tsx'
const DRAFT_KEY = 'dsh-model-console.default-draft.v1'
function cachedDraft(): { selection: Selection; revision: number } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
    return value &&
      typeof value.selection?.provider === 'string' &&
      typeof value.selection?.model === 'string' &&
      Number.isInteger(value.revision)
      ? value
      : null
  } catch {
    return null
  }
}
export function DefaultPanel({
  api,
  snapshot,
  staged,
  onSaved,
  onDirty,
}: {
  api: ModelConsoleApi
  snapshot: ModelConsoleSnapshot
  staged: Selection | null
  onSaved: () => Promise<void>
  onDirty: (dirty: boolean) => void
}) {
  const [draft, setDraft] = useState<Selection>(
    () => cachedDraft()?.selection ?? snapshot.defaultModel,
  )
  const [revision, setRevision] = useState(
    () => cachedDraft()?.revision ?? snapshot.defaultState.revision,
  )
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false)
  const dirty = !sameSelection(draft, snapshot.defaultModel),
    dirtyRef = useRef(dirty),
    savingRef = useRef(false)
  dirtyRef.current = dirty
  useEffect(() => {
    if (!dirtyRef.current && !savingRef.current) {
      setDraft(snapshot.defaultModel)
      setRevision(snapshot.defaultState.revision)
    }
  }, [snapshot])
  useEffect(() => {
    if (staged) {
      setDraft(staged)
      setMessage('')
    }
  }, [staged])
  useEffect(() => {
    onDirty(dirty)
    try {
      if (dirty) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ selection: draft, revision }))
      else sessionStorage.removeItem(DRAFT_KEY)
    } catch {}
  }, [dirty, draft, revision])
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
  const cancel = () => {
    setDraft(snapshot.defaultModel)
    setRevision(snapshot.defaultState.revision)
    setMessage('')
    setFailed(false)
  }
  const save = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setMessage('')
    setFailed(false)
    try {
      const saved = await api.saveDefault(draft, revision)
      setDraft(saved.selection)
      setRevision(saved.revision)
      setMessage('已保存并确认 · ' + timeText(saved.savedAt))
      try {
        sessionStorage.removeItem(DRAFT_KEY)
      } catch {}
      await onSaved().catch(() => {})
    } catch (cause) {
      setFailed(true)
      setMessage(errorText(cause))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  const refreshRevision = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const current = valueOf(await api.standard.settings.describe({})).namespaces.find(
        (ns) => ns.ns === 'agent-default-model',
      )
      if (!current) throw new Error('默认模型设置尚未就绪')
      setRevision(current.revision)
      await onSaved().catch(() => {})
      setMessage('已刷新保存版本；草稿保留，请核对后再次保存')
    } catch (cause) {
      setMessage(errorText(cause))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  const p = snapshot.providers.find((p) => p.id === snapshot.defaultModel.provider)
  return (
    <div>
      <div className="dmc-saved">
        <small>已保存 · 新会话默认值</small>
        <b>
          {p ? sourceName(p) : snapshot.defaultModel.provider} /{' '}
          {p
            ? (choiceFor(p, snapshot.defaultModel)?.name ?? snapshot.defaultModel.model)
            : snapshot.defaultModel.model}
        </b>
        <span>
          {snapshot.defaultModel.model}
          {snapshot.defaultModel.reasoningEffort
            ? ' · ' + snapshot.defaultModel.reasoningEffort
            : ''}
        </span>
      </div>
      <h3>新的默认选择</h3>
      <ModelFields
        providers={snapshot.providers}
        value={draft}
        disabled={saving || !snapshot.defaultState.writable}
        onChange={(next) => {
          setDraft(next)
          setMessage('')
          setFailed(false)
        }}
      />
      <p className="dmc-muted">
        精确模型 ID：{draft.model}
        {draft.reasoningEffort ? ' · 推理 ' + draft.reasoningEffort : ''}
      </p>
      <p className="dmc-muted">
        仅影响之后新建的会话。已有会话保留自己的选择；Agent 预设指定模型时按预设执行。
      </p>
      {!snapshot.defaultState.writable ? (
        <p className="dmc-error">设置服务只读，无法保存默认模型。</p>
      ) : null}
      <div className="dmc-savebar">
        <div
          role="status"
          aria-live="polite"
          className={failed ? 'dmc-error' : dirty ? 'dmc-pending' : 'dmc-success'}
        >
          {saving ? '保存中…' : message || (dirty ? '有未保存的修改' : '默认设置已保存')}
        </div>
        <div className="dmc-actions">
          <button disabled={!dirty || saving} onClick={cancel}>
            取消修改
          </button>
          <button
            className="dmc-primary"
            disabled={!dirty || saving || !snapshot.defaultState.writable}
            onClick={() => void save()}
          >
            {saving ? '保存中…' : failed ? '重试保存' : '保存默认设置'}
          </button>
        </div>
      </div>
      {failed ? (
        <button
          className="dmc-link"
          disabled={saving}
          onClick={() => void refreshRevision()}
        >
          刷新保存版本，保留草稿
        </button>
      ) : null}
    </div>
  )
}
