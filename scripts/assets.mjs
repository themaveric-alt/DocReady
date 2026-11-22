import { cp, mkdir, readdir } from 'node:fs/promises'
await mkdir('public/libs', { recursive: true })
// Static fallbacks are intentionally copied from pinned npm packages. The
// React application imports ESM versions (which Vite hashes into /assets),
// while these same-origin files give workers and offline audits stable local
// paths without a CDN dependency.
for (const [source, destination] of [
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'public/libs/pdf-lib.min.js'],
  ['node_modules/pdfjs-dist/legacy/build/pdf.min.mjs', 'public/libs/pdf.min.js'],
  ['node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'public/libs/pdf.worker.min.js'],
  ['node_modules/@soulehshaikh99/qpdf-wasm/dist/qpdf.js', 'public/libs/qpdf.js'],
  ['node_modules/@soulehshaikh99/qpdf-wasm/dist/qpdf.wasm', 'public/libs/qpdf.wasm'],
  ['node_modules/mammoth/mammoth.browser.min.js', 'public/libs/mammoth.browser.min.js'],
  ['node_modules/docx/dist/index.iife.js', 'public/libs/docx.min.js'],
  ['node_modules/pptxgenjs/dist/pptxgen.bundle.js', 'public/libs/pptxgen.bundle.js'],
  ['node_modules/html2pdf.js/dist/html2pdf.bundle.min.js', 'public/libs/html2pdf.bundle.min.js'],
  ['node_modules/jspdf/dist/jspdf.umd.min.js', 'public/libs/jspdf.min.js'],
  ['node_modules/html2canvas/dist/html2canvas.min.js', 'public/libs/html2canvas.min.js'],
  ['node_modules/jszip/dist/jszip.min.js', 'public/libs/jszip.min.js'],
  ['node_modules/tesseract.js/dist/tesseract.min.js', 'public/libs/tesseract.min.js'],
]) await cp(source, destination)
await mkdir('public/ocr/core', { recursive: true })
await cp(
  'node_modules/tesseract.js/dist/worker.min.js',
  'public/ocr/worker.min.js',
)
for (const file of await readdir('node_modules/tesseract.js-core')) {
  if (/\.wasm(\.js)?$/.test(file) && !file.includes('lstm')) {
    continue
  }
  if (/\.wasm(\.js)?$/.test(file))
    await cp(
      `node_modules/tesseract.js-core/${file}`,
      `public/ocr/core/${file}`,
    )
}
for (const lang of ['eng', 'hin', 'spa', 'fra', 'deu']) {
  await cp(
    `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    `public/ocr/${lang}.traineddata.gz`,
  )
}
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await cp(`node_modules/pdfjs-dist/${dir}`, `public/pdf/${dir}`, {
    recursive: true,
  })
}
