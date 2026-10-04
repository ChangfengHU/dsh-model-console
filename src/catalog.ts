import type { ModelRow, ProviderRow } from './wire.ts'

export interface Selection {
  provider: string
  model: string
  reasoningEffort?: string
}
export interface ModelChoice {
  id: string
  name: string
  models: ModelRow[]
  efforts: Array<{ id: string; name: string }>
  suffixEfforts: boolean
  core: boolean
}
export const choiceKey = (provider: string, id: string): string => JSON.stringify([provider, id])
export const sameSelection = (a: Selection, b: Selection): boolean =>
  a.provider === b.provider &&
  a.model === b.model &&
  (a.reasoningEffort ?? '') === (b.reasoningEffort ?? '')
export function sourceKind(provider: ProviderRow): '本机登录' | '直接 API' | '账号池 API' {
  return /^(codex|claude)-local$/.test(provider.id)
    ? '本机登录'
    : provider.id.startsWith('ag-pool')
      ? '账号池 API'
      : '直接 API'
}
export function sourceName(provider: ProviderRow): string {
  return provider.id === 'codex-local'
    ? 'Codex · 本机登录'
    : provider.id === 'claude-local'
      ? 'Claude Code · 本机登录'
      : provider.name
}
const label = (id: string): string =>
  ({ low: '低', medium: '中', high: '高', xhigh: '更高', max: '最大', ultra: '最高' })[id] ?? id
const numeric = (id: string): number[] => [...id.matchAll(/\d+/g)].map((m) => Number(m[0]))
function newer(a: string, b: string): number {
  const x = numeric(a),
    y = numeric(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (y[i] ?? 0) - (x[i] ?? 0)
    if (d) return d
  }
  return a.localeCompare(b)
}
function title(id: string, name: string): string {
  if (/^gemini-\d+(?:\.\d+)?-(flash|pro)$/.test(id))
    return id
      .replace(/^gemini-/, 'Gemini ')
      .replace(/-(flash|pro)$/, (_, role) => ' ' + (role === 'flash' ? 'Flash' : 'Pro'))
  if (/^claude-(opus|sonnet)-/.test(id))
    return id
      .replace(
        /^claude-(opus|sonnet)-/,
        (_, role) => 'Claude ' + (role === 'opus' ? 'Opus' : 'Sonnet') + ' ',
      )
      .replace(/-thinking$/, '')
      .replace(/-(\d+)$/, ' .$1')
      .replace(' .', '.')
  if (/^gpt-oss-120b/.test(id)) return 'GPT-OSS 120B'
  return name || id
}
export function projectModels(provider: ProviderRow): ModelChoice[] {
  const groups = new Map<string, ModelRow[]>()
  for (const model of provider.models) {
    // Only documented AG Gemini effort suffixes merge. Agent/tiered/unknown aliases stay intact.
    const id =
      sourceKind(provider) === '账号池 API' &&
      /^gemini-\d+(?:\.\d+)?-(flash|pro)-(low|medium|high)$/.test(model.id)
        ? model.id.replace(/-(low|medium|high)$/, '')
        : model.id
    groups.set(id, [...(groups.get(id) ?? []), model])
  }
  const rows = [...groups.entries()].map(([id, models]): ModelChoice => {
    const suffixEfforts = models.some((m) => m.id !== id)
    const efforts = suffixEfforts
      ? ['low', 'medium', 'high']
          .filter((e) => models.some((m) => m.id === id + '-' + e))
          .map((e) => ({ id: e, name: label(e) }))
      : (models[0]?.reasoning?.efforts ?? []).map((e) => ({ ...e, name: label(e.id) }))
    return {
      id,
      name: title(id, models[0]?.name ?? id),
      models,
      efforts,
      suffixEfforts,
      core: false,
    }
  })
  const choose = (pattern: RegExp) => {
    const row = rows.filter((r) => pattern.test(r.id)).sort((a, b) => newer(a.id, b.id))[0]
    if (row) row.core = true
  }
  if (sourceKind(provider) === '账号池 API') {
    choose(/^claude-opus-\d/)
    choose(/^claude-sonnet-\d/)
    choose(/^gemini-\d+(?:\.\d+)?-flash$/)
    choose(/^gemini-\d+(?:\.\d+)?-pro$/)
    choose(/^gpt-oss-120b/)
  } else if (provider.id === 'codex-local') {
    // The native catalog is already ordered by Codex recommendation priority.
    // Keep its first few entries, including integer versions and new families.
    rows.slice(0, 4).forEach(r => { r.core = true })
  } else if (provider.id === 'claude-local') {
    rows.forEach((r) => {
      r.core = ['default', 'opus', 'sonnet'].includes(r.id)
    })
  } else if (provider.id === 'deepseek-official') {
    choose(/^deepseek-v\d+-pro$/)
    choose(/^deepseek-v\d+-flash$/)
  } else if (provider.id === 'qwen-bailian')
    rows.forEach((r) => {
      r.core = true
    })
  if (!rows.some((r) => r.core))
    rows.slice(0, 3).forEach((r) => {
      r.core = true
    })
  const family = (id: string) =>
    sourceKind(provider) === '账号池 API'
      ? [
          /^claude-opus/,
          /^claude-sonnet/,
          /^gemini-.*-flash$/,
          /^gemini-.*-pro$/,
          /^gpt-oss/,
        ].findIndex((pattern) => pattern.test(id))
      : provider.id === 'codex-local'
        ? ['sol', 'terra', 'luna'].findIndex((role) => id.endsWith('-' + role))
        : 0
  if (provider.id === 'codex-local') return rows
  return rows.sort(
    (a, b) =>
      Number(b.core) - Number(a.core) ||
      (a.core && b.core ? family(a.id) - family(b.id) : 0) ||
      newer(a.id, b.id),
  )
}
export function choiceFor(provider: ProviderRow, selection: Selection): ModelChoice | undefined {
  return projectModels(provider).find((r) => r.models.some((m) => m.id === selection.model))
}
export function effortOf(row: ModelChoice, selection: Selection): string {
  return row.suffixEfforts
    ? (selection.model.match(/-(low|medium|high)$/)?.[1] ?? row.efforts[0]?.id ?? '')
    : (selection.reasoningEffort ?? '')
}
export function selectChoice(provider: string, row: ModelChoice, effort?: string): Selection {
  const selected = row.efforts.some((e) => e.id === effort)
    ? effort!
    : row.suffixEfforts
      ? (row.efforts.find((e) => e.id === 'medium')?.id ?? row.efforts[0]?.id)
      : effort === ''
        ? undefined
        : row.models[0]?.reasoning?.defaultEffort
  return {
    provider,
    model: row.suffixEfforts
      ? (row.models.find((m) => m.id === row.id + '-' + selected)?.id ?? row.models[0]!.id)
      : row.models[0]!.id,
    ...(!row.suffixEfforts && selected ? { reasoningEffort: selected } : {}),
  }
}
