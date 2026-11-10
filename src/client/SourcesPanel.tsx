import type { ModelConsoleSnapshot, ModelTestResult } from '../wire.ts'
import { sourceKind, sourceName } from '../catalog.ts'
import type { ModelConsoleApi } from './api.ts'
import { timeText } from './api.ts'

export function SourcesPanel({ snapshot, onTest, testing, tests }: {
  api: ModelConsoleApi
  snapshot: ModelConsoleSnapshot
  onSaved: () => Promise<void>
  onTest: (provider: string) => void
  testing: boolean
  tests: ModelTestResult[]
}) {
  return <div className="dmc-stack">
    {snapshot.providers.filter(p => sourceKind(p) === '本机登录').map(provider => {
      const codex = provider.id === 'codex-local'
      const runtime = codex ? snapshot.codex : snapshot.claude
      const authenticated = codex ? snapshot.codex.auth.authenticated : snapshot.claude.authenticated
      const latest = tests.filter(t => t.provider === provider.id).sort((a, b) => b.testedAt - a.testedAt)[0]
      return <section className="dmc-api-editor" key={provider.id}>
        <div className="dmc-api-title"><h3>{sourceName(provider)}</h3><button className="dmc-link" disabled={testing || !runtime.installed} onClick={() => onTest(provider.id)}>选择模型并测试</button></div>
        <div className="dmc-local-meta"><span>{runtime.installed ? '已安装 · ' + runtime.version : '未检测到执行程序'}</span><span className={authenticated === true ? 'dmc-success' : 'dmc-pending'}>{authenticated === true ? '已登录' : authenticated === false ? '未登录' : '认证状态待确认'}</span><span>{provider.models.length} 个目录条目</span></div>
        <div className="dmc-local-path">{runtime.executable}</div>
        {'diagnostic' in runtime && runtime.diagnostic ? <p role="status" className="dmc-pending">{runtime.diagnostic}</p> : null}
        <p className={latest?.ok ? 'dmc-success' : latest ? 'dmc-error' : 'dmc-muted'}>{latest ? (latest.ok ? '最近测试通过' : '最近测试失败 · ' + latest.message) + ' · ' + timeText(latest.testedAt) : '尚未执行连接测试'}</p>
      </section>
    })}
  </div>
}
