import { readFile, writeFile, rename } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const MARKER = 'webDefaultAgentOptions.has(agent.options)'
function exact(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Unsupported DSH default-model code; no changes written')
  return source.replace(before, after)
}
export function patchDefaultModelSource(source) {
  if (source.includes(MARKER)) return source
  source = exact(source, '\tconst agentOptions = () => {', '\tconst webDefaultAgentOptions = new WeakSet();\n\tconst agentOptions = () => {')
  source = exact(source, '\t\tconst { provider, model } = defaults.defaultModelSelection();\n\t\treturn {\n\t\t\tprovider,\n\t\t\tmodel\n\t\t};', '\t\tconst { provider, model } = defaults.defaultModelSelection();\n\t\tconst seed = { provider, model };\n\t\twebDefaultAgentOptions.add(seed);\n\t\treturn seed;')
  const baseline = '\t\t\t\tif (logged === void 0) return defaults.defaultModelSelection();'
  const configured = `\t\t\t\tif (logged === void 0) {
\t\t\t\t\tconst configured = agent.options;
\t\t\t\t\tconst fallback = defaults.defaultModelSelection();
\t\t\t\t\tconst provider = configured.provider ?? fallback.provider;
\t\t\t\t\tconst model = configured.model ?? fallback.model;
\t\t\t\t\tconst inheritsDefaultEffort = provider === fallback.provider && model === fallback.model;
\t\t\t\t\tconst reasoningEffort = configured.reasoningEffort ?? (inheritsDefaultEffort ? fallback.reasoningEffort : void 0);
\t\t\t\t\treturn { provider, model, ...reasoningEffort === void 0 ? {} : { reasoningEffort } };
\t\t\t\t}`
  const next = configured.replace('const fallback = defaults.defaultModelSelection();', 'const fallback = defaults.defaultModelSelection();\n\t\t\t\t\tif (webDefaultAgentOptions.has(agent.options)) return fallback;')
  return exact(source, source.includes(configured) ? configured : baseline, next)
}
export async function installDefaultModelPatch(root) {
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
  if (version !== '0.1.1-rc.2') throw new Error(`Unsupported DSH version ${version}`)
  const host = join(root, 'node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js')
  const before = await readFile(host, 'utf8'), after = patchDefaultModelSource(before)
  if (before === after) return false
  try { await writeFile(host + '.dmc-default-backup', before, { flag: 'wx', mode: 0o600 }) } catch (e) { if (e.code !== 'EEXIST') throw e }
  await writeFile(host + '.dmc-default-next', after)
  await rename(host + '.dmc-default-next', host)
  return true
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let root = process.env.DSH_INSTALL_ROOT
  if (!root) for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    try { root = dirname(dirname(realpathSync(join(dir, 'dsh')))); break } catch {}
  }
  if (!root) throw new Error('Set DSH_INSTALL_ROOT to the DSH package directory')
  console.log('New-session default model:', await installDefaultModelPatch(root) ? 'patched' : 'already installed')
}
