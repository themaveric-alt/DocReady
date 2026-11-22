import type { Page } from 'tesseract.js'
import { openLocalOCR } from '../../../lib/local-ocr'
import { decodeImage, canvasBlob } from '../../../lib/raster'
import { joinParagraphLines, sameParagraph } from '../paragraphLines'
import { union } from '../pdf-translator/documentStructure'
import type {
  Box,
  Extraction,
  JobProgress,
  OCRLanguage,
  TextBlock,
} from '../types'

export function regions(
  data: Page,
  width: number,
  height: number,
  page: number,
  keepLines: boolean,
) {
  const output: TextBlock[] = []
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      let previous: { text: string; box: Box } | undefined
      let region: TextBlock | undefined
      for (const item of keepLines ? paragraph.lines : [paragraph]) {
        const text = item.text.replaceAll(/\s+/gu, ' ').trim()
        const { x0, y0, x1, y1 } = item.bbox
        if (!text || x1 <= x0 || y1 <= y0) continue
        const box = {
          x: x0 / width,
          y: y0 / height,
          width: (x1 - x0) / width,
          height: (y1 - y0) / height,
        }
        const line = { text, box }
        if (region && previous && sameParagraph(previous, line)) {
          region.original = joinParagraphLines(region.original, text)
          region.box = union([region.box, box])
          region.sourceLines!.push(box)
          region.confidence = Math.min(region.confidence!, item.confidence)
        } else {
          region = {
            id: `p${page}-b${output.length}`,
            page,
            role: 'paragraph',
            original: text,
            translated: '',
            confidence: item.confidence,
            box,
            sourceLines: [box],
          }
          output.push(region)
        }
        previous = line
      }
    }
  }
  return output
}

export async function extractImage(
  file: File,
  language: OCRLanguage,
  signal: AbortSignal,
  report: (progress: JobProgress) => void,
): Promise<Extraction> {
  report({ stage: 'Decoding image' })
  const image = await decodeImage(file)
  const { width, height } = image
  const canvas = document.createElement('canvas')
  try {
    if (width * height > 16_000_000 || width > 9000 || height > 9000)
      throw Error(
        'Use an image under 16 megapixels and 9,000 pixels on each side.',
      )
    if (Math.min(width, height) < 40)
      throw Error('The image is too small for readable OCR.')
    const factor = Math.min(1, 2300 / Math.max(width, height))
    canvas.width = Math.round(width * factor)
    canvas.height = Math.round(height * factor)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const input = await canvasBlob(canvas, 'image/png')
    const ocr = await openLocalOCR(language, signal, (m) =>
      report({
        stage:
          m.status === 'recognizing text'
            ? 'Recognizing image text and positions'
            : 'Loading local OCR',
      }),
    )
    try {
      const data = await ocr.recognize(input, true)
      const blocks = regions(data, canvas.width, canvas.height, 0, true)
      if (!blocks.length)
        throw Error(
          'OCR could not locate readable text. Try a sharper image or use a manual text box.',
        )
      return {
        pages: [{ index: 0, width, height, scanned: true }],
        blocks,
        warnings: [],
      }
    } finally {
      await ocr.close()
    }
  } finally {
    image.close()
    canvas.width = canvas.height = 0
  }
}
