/** Browser plugin: one non-destructive Settings section over real host facts. */

import type { ModelConsoleSnapshot } from '../wire.ts'
import { ModelConsoleSection, type ModelConsoleApi } from './ModelConsoleSection.tsx'
import { MODEL_CONSOLE_REMOTE, unwrap } from './remote.ts'
import { installStyles } from './styles.ts'
import { ModelPicker } from './ModelPicker.tsx'

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
    testModel: async (selection) => {
      const result = await ctx.get('remote.modelConsole').testModel(JSON.stringify(selection))
      return JSON.parse(unwrap<string>(result))
    },
    saveDefault: async (selection, expectedRevision) => {
      const result = await ctx
        .get('remote.modelConsole')
        .saveDefault(JSON.stringify({ ...selection, expectedRevision }))
      const saved = JSON.parse(unwrap<string>(result))
      window.dispatchEvent(new Event('dsh-model-console:default-saved'))
      return saved
    },
    standard: ctx.get('connection').api,
  }
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'model-console',
        order: 11,
        label: 'Model Console',
        inject: () => ({ api }),
      },
      ModelConsoleSection,
    ),
  )
  ctx.inject(['modelDirectories', 'sessions'], (scope: any) => {
    scope.slots.inject('conversation.input.model', () =>
      scope.slots.register(
        {
          name: 'conversation.input.model',
          priority: -20,
          inject: (sessionId: string) => {
            const directory = scope.modelDirectories.directoryFor(sessionId)
            const available = scope.sessions.subagentAddress(sessionId) === undefined
            return {
              api,
              available,
              directory: directory.store,
              load: () => {
                if (available) void directory.load().catch(() => {})
              },
              select: (selection: any) =>
                available
                  ? directory.select(selection).then(
                      () => true,
                      () => false,
                    )
                  : Promise.resolve(false),
            }
          },
        },
        ModelPicker,
      ),
    )
  })
}

export { ModelConsoleSection } from './ModelConsoleSection.tsx'
