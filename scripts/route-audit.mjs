import { readFile, stat } from 'node:fs/promises'
import { tools, toolPath } from '../src/catalog.ts'
import { pdfSuiteCategories } from '../src/tools-config.ts'
const index = await readFile('dist/index.html', 'utf8')
const entryAssets = [...index.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1])
for (const path of entryAssets) await stat('dist' + path)
for (const tool of tools) {
  const html = await readFile('dist' + toolPath(tool.id) + '.html', 'utf8')
  if (!html.includes('<div id="root">')) throw Error(`Missing app entry for ${tool.id}`)
}
const headers = await readFile('dist/_headers', 'utf8')
if (!headers.includes("worker-src 'self' blob:") || !headers.includes("'wasm-unsafe-eval'")) throw Error('Missing local worker/WASM CSP directives.')
console.log(`Static route audit passed: ${tools.length} catalog routes, ${pdfSuiteCategories.length} PDF categories, local entry assets and worker CSP. Browser execution is a separate check.`)
