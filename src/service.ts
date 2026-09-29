/** Host facts for the model console. No credentials are read or returned. */

import type { Context } from '@deepseek-ai/cordis'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { parseCodexLoginStatus, parseCodexVersion } from './auth.ts'
import type { ModelConsoleSnapshot, ProviderRow } from './wire.ts'

const execute = promisify(execFile)

export interface ServiceOptions {
  executable: string
  timeoutMs: number
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

  constructor(ctx: Context, private readonly options: ServiceOptions) {
    super(ctx, 'modelConsole')
  }

  async snapshot(): Promise<string> {
    const providers: ProviderRow[] = await Promise.all(this.ctx.llm.listProviders().map(async provider => {
      try {
        const models = await this.ctx.llm.listModels(provider.id)
        return {
          id: provider.id,
          name: provider.name,
          models: models.map(model => ({
            id: model.id,
            name: model.name,
            ...(model.description === undefined ? {} : { description: model.description }),
          })),
        }
      } catch {
        return {
          id: provider.id,
          name: provider.name,
          models: [],
          catalogError: 'Model catalog unavailable',
        }
      }
    }))

    const executable = await resolveCodexExecutable(this.options.executable)
    let installed = false
    let version: string | null = null
    let auth = parseCodexLoginStatus('')
    let diagnostic: string | undefined
    try {
      version = parseCodexVersion(await command(executable, ['--version'], this.options.timeoutMs))
      installed = true
      auth = parseCodexLoginStatus(await command(executable, ['login', 'status'], this.options.timeoutMs))
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      diagnostic = code === 'ENOENT' ? 'Codex CLI is not installed' : 'Codex login status check failed'
    }

    const snapshot: ModelConsoleSnapshot = {
      checkedAt: Date.now(),
      codex: {
        installed,
        executable,
        version,
        auth,
        providerActive: providers.some(provider => provider.id === 'codex-local'),
        ...(diagnostic === undefined ? {} : { diagnostic }),
      },
      defaultModel: this.ctx.agentDefaultModel.currentSelection(),
      providers,
    }
    return JSON.stringify(snapshot)
  }

  async testModel(payload: string): Promise<string> {
    const input = JSON.parse(payload) as { provider?: unknown; model?: unknown }
    const provider = typeof input.provider === 'string' ? input.provider.trim() : ''
    const model = typeof input.model === 'string' ? input.model.trim() : ''
    if (!provider || !model) throw new Error('provider and model are required')
    if (!this.ctx.llm.listProviders().some(item => item.id === provider)) throw new Error(`provider is not registered: ${provider}`)

    const startedAt = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, 30_000)
    let firstTokenAt: number | undefined
    let textSeen = false
    let failure: { code: string; message: string } | undefined
    try {
      for await (const chunk of this.ctx.llm.stream({
        provider,
        model,
        messages: [createUserMessage({
          content: [{ type: 'text', text: 'Reply with exactly: OK' }],
          source: { kind: 'plugin', plugin: 'dsh-model-console' },
        })],
        system: 'This is a connectivity test. Follow the user instruction exactly.',
        tools: [],
        signal: controller.signal,
      })) {
        if (chunk.type === 'text-delta' && chunk.text.length > 0) {
          firstTokenAt ??= Date.now()
          textSeen = true
        }
        if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
          failure = {
            code: chunk.reason.failure.code,
            message: chunk.reason.failure.message.slice(0, 300),
          }
        }
      }
    } catch (cause) {
      failure = {
        code: 'TEST_FAILED',
        message: (cause instanceof Error ? cause.message : String(cause)).slice(0, 300),
      }
    } finally {
      clearTimeout(timer)
    }
    const testedAt = Date.now()
    return JSON.stringify({
      ok: failure === undefined && textSeen,
      provider,
      model,
      testedAt,
      durationMs: testedAt - startedAt,
      ...(firstTokenAt === undefined ? {} : { firstTokenMs: firstTokenAt - startedAt }),
      ...(failure === undefined && textSeen ? {} : failure ?? { code: 'EMPTY_RESPONSE', message: 'Model returned no text' }),
    })
  }

  async saveDefault(payload: string): Promise<string> {
    const input = JSON.parse(payload) as { provider?: unknown; model?: unknown }
    const provider = typeof input.provider === 'string' ? input.provider.trim() : ''
    const model = typeof input.model === 'string' ? input.model.trim() : ''
    if (!provider || !model) throw new Error('provider and model are required')
    if (!this.ctx.llm.listProviders().some(item => item.id === provider)) throw new Error(`provider is not registered: ${provider}`)
    const models = await this.ctx.llm.listModels(provider)
    if (!models.some(item => item.id === model)) throw new Error(`model is not in the current runtime catalog: ${provider}/${model}`)
    await this.ctx.agentDefaultModel.saveSelection({ provider, model })
    return JSON.stringify(this.ctx.agentDefaultModel.currentSelection())
  }
}
