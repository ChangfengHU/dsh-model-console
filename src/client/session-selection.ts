import type { Selection } from '../catalog.ts'

/** The native directory helper drops persistDefault; use the explicit session RPC. */
export async function selectSessionModel(sessionId: string, selection: Selection, api: {
  selectModel: (payload: Selection & { sessionId: string; persistDefault: false }) => Promise<any>
  reload: () => Promise<unknown>
}): Promise<void> {
  const response = await api.selectModel({
    sessionId, provider: selection.provider, model: selection.model,
    ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
    persistDefault: false,
  })
  const result = response.result
  if (!result?.ok) throw new Error(result?.error?.message ?? 'Session model switch failed.')
  if (result.value.selected.provider !== selection.provider || result.value.selected.model !== selection.model) throw new Error('The selected session model could not be confirmed.')
  try { await api.reload() }
  catch { throw new Error('The session model changed, but its state could not be refreshed. Refresh the catalog.') }
}
