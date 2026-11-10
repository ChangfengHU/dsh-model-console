import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const out = join(root, 'lib')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
await mkdir(out, { recursive: true })

await build({
  entryPoints: [join(root, 'src/index.ts'), join(root, 'src/typert.host.ts')],
  outdir: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-*', '@deepseek-ai/schemastery', 'zod', 'node:*'],
  logLevel: 'info',
})

const client = await build({
  entryPoints: [join(root, 'src/client/index.tsx')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  logLevel: 'info',
})

const body = client.outputFiles[0].text
const bytes = Buffer.byteLength(body)
if (bytes > 120_000) throw new Error(`Model Console client bundle exceeds its 120 KB budget: ${bytes} bytes`)
console.log(`Model Console client bundle: ${bytes} bytes`)
await writeFile(join(out, 'client.js'), `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(pkg.name)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body}
\t\treturn module.exports;
\t}
});
`)
