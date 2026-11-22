import { Util } from 'pdfjs-dist'
import { openLocalOCR } from '../../../lib/local-ocr'
import { parsePages, errorText } from '../../../lib/files'
import { loadRender, renderPage } from '../../../lib/pdf-render'
import { canvasBlob } from '../../../lib/raster'
import { regions } from '../image-translator/imageOCR'
import type { Extraction, JobProgress, OCRLanguage, TextBlock } from '../types'
import { structurePage } from './documentStructure'

export async function extractPdf(
  file: File,
  range: string,
  language: OCRLanguage,
  forceOCR: boolean,
  signal: AbortSignal,
  report: (progress: JobProgress) => void,
): Promise<Extraction> {
  report({ stage: 'Reading document' })
  const doc = await loadRender(file)
  let engine: Awaited<ReturnType<typeof openLocalOCR>> | undefined,
    engineError = ''
  const output: Extraction = { pages: [], blocks: [], warnings: [] }
  try {
    const selected = parsePages(range, doc.numPages)
    if (selected.length > 12)
      throw Error('Select at most 12 PDF pages per run.')
    for (const [i, index] of selected.entries()) {
      signal.throwIfAborted()
      report({
        stage: 'Extracting PDF text',
        done: i,
        total: selected.length,
        unit: 'pages',
      })
      const page = await doc.getPage(index + 1),
        view = page.getViewport({ scale: 1 })
      const text = await page.getTextContent()
      const items = text.items.flatMap((item) => {
        if (!('str' in item) || !item.str.trim()) return []
        const transform = Util.transform(view.transform, item.transform)
        const font = Math.hypot(transform[2], transform[3]) || item.height || 10
        return [
          {
            text: item.str,
            font,
            box: {
              x: transform[4] / view.width,
              y: (transform[5] - font) / view.height,
              width: item.width / view.width,
              height: font / view.height,
            },
          },
        ]
      })
      let blocks: TextBlock[] = structurePage(items, index)
      let scanned = items.length === 0
      const nativeLength = items.reduce(
        (n, item) => n + item.text.trim().length,
        0,
      )
      const brokenMapping = items.some((item) =>
        /[\u0000\uFFFD]/u.test(item.text),
      )
      if (forceOCR || brokenMapping || nativeLength < 35) {
        const scale = Math.min(2.2, 2350 / Math.max(view.width, view.height))
        let canvas: HTMLCanvasElement | undefined
        try {
          if (engineError) throw Error(engineError)
          report({
            stage: 'Recognizing scan text on page ' + (index + 1),
            done: i,
            total: selected.length,
            unit: 'pages',
          })
          try {
            engine ??= await openLocalOCR(language, signal)
          } catch (e) {
            engineError = errorText(e)
            throw e
          }
          canvas = await renderPage(doc, index, scale)
          const data = await engine.recognize(
            await canvasBlob(canvas, 'image/png'),
            true,
          )
          const found = regions(data, canvas.width, canvas.height, index, false)
          if (
            found.length &&
            (scanned ||
              forceOCR ||
              brokenMapping ||
              found.map((b) => b.original).join('').length > nativeLength + 25)
          ) {
            blocks = found
            scanned = true
          } else if (!blocks.length)
            output.warnings.push(
              `Page ${index + 1} contains no text OCR could read.`,
            )
        } catch (error) {
          signal.throwIfAborted()
          output.warnings.push(
            `Page ${index + 1}: OCR unavailable. ${errorText(error)}`,
          )
        } finally {
          if (canvas) canvas.width = canvas.height = 0
        }
      }
      if (brokenMapping && !scanned) {
        blocks = []
        output.warnings.push(
          `Page ${index + 1} has a broken PDF character map. No reliable OCR text was found.`,
        )
      }
      output.pages.push({
        index,
        width: view.width,
        height: view.height,
        scanned,
      })
      output.blocks.push(...blocks)
      page.cleanup()
    }
    if (!output.blocks.length)
      throw Error(
        output.warnings.join(' ') || 'No translatable text was found.',
      )
    return output
  } finally {
    await engine?.close()
    await doc.dispose().catch(() => {})
  }
}
