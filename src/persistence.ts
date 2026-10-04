import type { Selection } from './catalog.ts'
import { sameSelection } from './catalog.ts'

export interface SelectionSettings {
  readonly writable: boolean
  describe(): ReadonlyArray<{ ns: string; revision: number }>
  replace(ns: any, value: Record<string, unknown>, expectedRevision?: number): Promise<void>
  get(ns: any): unknown
}
export async function persistDefault(
  settings: SelectionSettings | undefined,
  next: Selection,
  expectedRevision: unknown,
): Promise<{ selection: Selection; revision: number; savedAt: number }> {
  const described = settings?.describe()
  const namespace = described?.find((n) => n.ns === 'agent-default-model')
  if (!settings || !settings.writable || !namespace)
    throw new Error('默认模型设置不可写，请检查 DSH 设置服务')
  if (!Number.isInteger(expectedRevision)) throw new Error('缺少设置版本，请刷新后重试')
  await settings.replace(namespace.ns, { ...next }, expectedRevision as number)
  const saved = settings.get(namespace.ns) as Selection | undefined
  if (!saved || !sameSelection(saved, next)) throw new Error('保存未生效；草稿已保留，请重试')
  const revision = settings.describe().find((n) => n.ns === namespace.ns)!.revision
  return { selection: saved, revision, savedAt: Date.now() }
}
