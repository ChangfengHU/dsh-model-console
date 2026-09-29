/** Browser plugin: one non-destructive Settings section over real host facts. */

import type { ModelConsoleSnapshot } from '../wire.ts'
import { ModelConsoleSection, type ModelConsoleApi } from './ModelConsoleSection.tsx'
import { MODEL_CONSOLE_REMOTE, unwrap } from './remote.ts'
import { installStyles } from './styles.ts'

export const name = 'dsh-model-console'
export const inject = ['slots', 'remote', 'connection']

export async function apply(ctx: any): Promise<void> {
  ctx.effect(() => installStyles(), 'model-console: stylesheet')
  await ctx.remote.$mount(MODEL_CONSOLE_REMOTE)
  const api: ModelConsoleApi = {
    snapshot: async () => {
      const result = await ctx.get('remote.modelConsole').snapshot()
      return JSON.parse(unwrap<string>(result)) as ModelConsoleSnapshot
    },
    testModel: async (provider, model) => {
      const result = await ctx.get('remote.modelConsole').testModel(JSON.stringify({ provider, model }))
      return JSON.parse(unwrap<string>(result))
    },
    saveDefault: async (provider, model) => {
      const result = await ctx.get('remote.modelConsole').saveDefault(JSON.stringify({ provider, model }))
      return JSON.parse(unwrap<string>(result))
    },
    standard: ctx.get('connection').api,
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'model-console',
    order: 11,
    label: 'Model Console',
    inject: () => ({ api }),
  }, ModelConsoleSection))
}

export { ModelConsoleSection } from './ModelConsoleSection.tsx'
