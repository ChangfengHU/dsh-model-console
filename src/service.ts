/** Host facts for the model console. No credentials are read or returned. */

import type { Context } from '@deepseek-ai/cordis'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
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
  static inject = ['llm']

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
      providers,
    }
    return JSON.stringify(snapshot)
  }
}
