import type { ModelRow, ProviderRow } from './wire.ts'

export interface SourceLabel { displayName?: string; fallbackName?: string }

export function providerName(provider: { id: string; name?: string }, models: Array<{ id: string }>, label: SourceLabel = {}): string {
  if (typeof label.displayName === 'string' && label.displayName.trim()) return label.displayName.trim()
  if (models.length && models.every(m => /^qwen(?:[-_.]|$)/i.test(m.id))) return 'Qwen'
  if (models.length && models.every(m => /^deepseek(?:[-_.]|$)/i.test(m.id))) return 'DeepSeek'
  return label.fallbackName || provider.name || provider.id
}

/** One live directory for settings, defaults and the session picker. No CLI auth probes. */
export async function readRuntimeCatalog(llm: any, labels = new Map<string, SourceLabel>()): Promise<ProviderRow[]> {
  return Promise.all(llm.listProviders().map(async (provider: any) => {
    try {
      const models = await llm.listModels(provider.id)
      return {
        id: provider.id, name: providerName(provider, models, labels.get(provider.id)),
        models: await Promise.all(models.map(async (model: any): Promise<ModelRow> => {
          const resolved = await llm.resolveModelInfo?.(provider.id, model.id).catch(() => undefined)
          const reasoning = resolved?.reasoning ?? model.reasoning
          return { id: model.id, name: model.name || model.id,
            ...(model.description === undefined ? {} : { description: model.description }),
            ...(reasoning ? { reasoning: { efforts: reasoning.efforts.map((e: any) => ({ id: String(e.id), name: e.name })), ...(reasoning.defaultEffort ? { defaultEffort: String(reasoning.defaultEffort) } : {}) } } : {}),
          }
        })),
      }
    } catch {
      return { id: provider.id, name: providerName(provider, [], labels.get(provider.id)), models: [], catalogError: 'Model catalog unavailable' }
    }
  }))
}
