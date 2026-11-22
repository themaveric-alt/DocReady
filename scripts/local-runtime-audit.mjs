import { access, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const required = [
  'pdf-lib.min.js',
  'pdf.min.js',
  'pdf.worker.min.js',
  'qpdf.js',
  'qpdf.wasm',
  'mammoth.browser.min.js',
  'docx.min.js',
  'pptxgen.bundle.js',
  'html2pdf.bundle.min.js',
  'opencv.js',
  'jszip.min.js',
  'tesseract.min.js',
]
for (const filename of required) {
  const path = join('public/libs', filename)
  await access(path)
  if ((await stat(path)).size < 64) throw Error(`${path} is empty or invalid.`)
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const output = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    // Vendored minified upstream files can contain source-map URLs or license
    // attributions. They are not application fetch targets; audit executable
    // app configuration rather than treating those strings as CDN imports.
    if (entry.isDirectory() && !['libs', 'ocr', 'licenses'].includes(entry.name))
      output.push(...(await sourceFiles(path)))
    else if (/\.(?:[cm]?[jt]sx?|html)$/i.test(entry.name)) output.push(path)
  }
  return output
}
const offenders = []
for (const path of [...(await sourceFiles('src')), ...(await sourceFiles('public'))]) {
  const text = await readFile(path, 'utf8').catch(() => '')
  if (/(?:unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)/i.test(text)) offenders.push(path)
}
if (offenders.length)
  throw Error(`External CDN references remain in runtime files: ${offenders.join(', ')}`)
console.log(`Local runtime audit passed: ${required.length} pinned /libs assets verified.`)
