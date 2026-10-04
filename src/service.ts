/** Host facts for the model console. No credentials are read or returned. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { persistDefault } from './persistence.ts'
import { parseCodexLoginStatus, parseCodexVersion } from './auth.ts'
import type { ModelConsoleSnapshot, ProviderRow } from './wire.ts'
import { measureModelTest } from './model-test.ts'

const execute = promisify(execFile)

export interface ServiceOptions {
  executable: string
  timeoutMs: number
  testTimeoutMs?: number
}

async function command(executable: string, args: string[], timeoutMs: number): Promise<string> {
  const result = await execute(executable, args, {
    timeout: timeoutMs,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  })
  return `${result.stdout}\n${result.stderr}`.trim()
}

/** Prefer the user's local Codex over an older system-wide binary. */
export async function resolveCodexExecutable(configured: string): Promise<string> {
  if (configured !== 'codex') return configured
  const local = join(homedir(), '.local', 'bin', 'codex')
  try {
    await access(local, constants.X_OK)
    return local
  } catch {
    return configured
  }
}

/** Remote service backing the Settings section. */
export class ModelConsoleService extends TypertRemoteService {
  static inject = ['llm', 'agentDefaultModel']

  constructor(
    ctx: Context,
    private readonly options: ServiceOptions,
  ) {
    super(ctx, 'modelConsole')
  }

  async snapshot(): Promise<string> {
    const providers: ProviderRow[] = await Promise.all(
      this.ctx.llm.listProviders().map(async (provider) => {
        try {
          const models = await this.ctx.llm.listModels(provider.id)
          return {
            id: provider.id,
            name: provider.name,
            models: await Promise.all(
              models.map(async (model) => {
                const resolved = await this.ctx.llm
                  .resolveModelInfo(provider.id, model.id)
                  .catch(() => undefined)
                return {
                  id: model.id,
                  name: model.name,
                  ...(model.description === undefined ? {} : { description: model.description }),
                  ...(resolved?.reasoning
                    ? {
                        reasoning: {
                          efforts: resolved.reasoning.efforts.map((e) => ({
                            id: String(e.id),
                            name: e.name,
                          })),
                          ...(resolved.reasoning.defaultEffort
                            ? { defaultEffort: String(resolved.reasoning.defaultEffort) }
                            : {}),
                        },
                      }
                    : {}),
                }
              }),
            ),
          }
        } catch {
          return {
            id: provider.id,
            name: provider.name,
            models: [],
            catalogError: 'Model catalog unavailable',
          }
        }
      }),
    )

    const executable = await resolveCodexExecutable(this.options.executable)
    let installed = false
    let version: string | null = null
    let auth = parseCodexLoginStatus('')
    let diagnostic: string | undefined
    try {
      version = parseCodexVersion(await command(executable, ['--version'], this.options.timeoutMs))
      installed = true
      auth = parseCodexLoginStatus(
        await command(executable, ['login', 'status'], this.options.timeoutMs),
      )
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      diagnostic =
        code === 'ENOENT' ? 'Codex CLI is not installed' : 'Codex login status check failed'
    }

    const settings = this.ctx.get('settings')
    const described = settings?.describe()
    const cli = settings?.get(settingsNamespace('claude-code-runtime')) as
      | { executable?: string }
      | undefined
    const claudeExecutable = cli?.executable || 'claude'
    let claudeInstalled = false,
      claudeVersion: string | null = null,
      authenticated: boolean | null = null
    try {
      claudeVersion = parseCodexVersion(
        await command(claudeExecutable, ['--version'], this.options.timeoutMs),
      )
      claudeInstalled = true
      const status = JSON.parse(
        await command(claudeExecutable, ['auth', 'status', '--json'], this.options.timeoutMs),
      )
      authenticated = typeof status.loggedIn === 'boolean' ? status.loggedIn : null
    } catch {}
    const preferences = settings?.get(settingsNamespace('model-console')) as
      | { favoriteModels?: string[] }
      | undefined
    const snapshot: ModelConsoleSnapshot = {
      checkedAt: Date.now(),
      codex: {
        installed,
        executable,
        version,
        auth,
        providerActive: providers.some((provider) => provider.id === 'codex-local'),
        ...(diagnostic === undefined ? {} : { diagnostic }),
      },
      defaultModel: this.ctx.agentDefaultModel.currentSelection(),
      defaultState: {
        revision: described?.find((n) => n.ns === 'agent-default-model')?.revision ?? 0,
        writable: settings?.writable === true,
      },
      preferences: {
        favoriteModels: preferences?.favoriteModels ?? [],
        revision: described?.find((n) => n.ns === 'model-console')?.revision ?? 0,
        writable: settings?.writable === true,
      },
      claude: {
        installed: claudeInstalled,
        executable: claudeExecutable,
        version: claudeVersion,
        authenticated,
        label: authenticated === true ? '已登录' : authenticated === false ? '未登录' : '待检查',
        providerActive: providers.some((p) => p.id === 'claude-local'),
      },
      providers,
    }
    return JSON.stringify(snapshot)
  }

  async testModel(payload: string): Promise<string> {
    const input = JSON.parse(payload) as {
      provider?: unknown
      model?: unknown
      reasoningEffort?: string
    }
    const provider = typeof input.provider === 'string' ? input.provider.trim() : ''
    const model = typeof input.model === 'string' ? input.model.trim() : ''
    if (!provider || !model) throw new Error('provider and model are required')
    if (!this.ctx.llm.listProviders().some((item) => item.id === provider))
      throw new Error(`provider is not registered: ${provider}`)
    if (!(await this.ctx.llm.listModels(provider)).some((item) => item.id === model))
      throw new Error('测试模型不在当前目录中')
    if (input.reasoningEffort) {
      const resolved = await this.ctx.llm.resolveModelInfo(provider, model)
      if (!resolved.reasoning?.efforts.some((e) => String(e.id) === input.reasoningEffort))
        throw new Error('此模型不支持所选推理档位')
    }

    const result = await measureModelTest(
      { provider, model, ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}) },
      this.options.testTimeoutMs ?? 90_000,
      signal => this.ctx.llm.stream({
        provider, model,
        ...(input.reasoningEffort ? { reasoningEffort: ReasoningEffortId(input.reasoningEffort) } : {}),
        messages: [createUserMessage({
          content: [{ type: 'text', text: 'Reply with exactly: OK' }],
          source: { kind: 'plugin', plugin: 'dsh-model-console' },
        })],
        system: 'This is a connectivity test. Follow the user instruction exactly.',
        tools: [], signal,
      }),
    )
    return JSON.stringify(result)
  }

  async saveDefault(payload: string): Promise<string> {
    const input = JSON.parse(payload) as {
      provider?: unknown
      model?: unknown
      reasoningEffort?: unknown
      expectedRevision?: unknown
    }
    const provider = typeof input.provider === 'string' ? input.provider.trim() : ''
    const model = typeof input.model === 'string' ? input.model.trim() : ''
    if (!provider || !model) throw new Error('provider and model are required')
    if (!this.ctx.llm.listProviders().some((item) => item.id === provider))
      throw new Error(`provider is not registered: ${provider}`)
    const models = await this.ctx.llm.listModels(provider)
    if (!models.some((item) => item.id === model))
      throw new Error(`model is not in the current runtime catalog: ${provider}/${model}`)
    const effort =
      typeof input.reasoningEffort === 'string' && input.reasoningEffort
        ? input.reasoningEffort
        : undefined
    if (effort) {
      const resolved = await this.ctx.llm.resolveModelInfo(provider, model)
      if (!resolved.reasoning?.efforts.some((e) => String(e.id) === effort))
        throw new Error('此模型不支持所选推理档位')
    }
    return JSON.stringify(
      await persistDefault(
        this.ctx.get('settings'),
        { provider, model, ...(effort ? { reasoningEffort: effort } : {}) },
        input.expectedRevision,
      ),
    )
  }
}
