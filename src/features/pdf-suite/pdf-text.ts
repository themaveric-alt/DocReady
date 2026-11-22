import { loadRender } from '../../lib/pdf-render'

export type PdfTextLine = {
  text: string
  x: number
  y: number
  width: number
  height: number
  font: number
}

export type PdfTextPage = {
  index: number
  width: number
  height: number
  lines: PdfTextLine[]
}

type RawText = {
  str?: string
  transform?: number[]
  width?: number
  height?: number
}

/**
 * Extracts only embedded PDF text. It intentionally does not OCR silently:
 * tools that need scan recognition link to the dedicated local OCR workflow.
 */
export async function extractPdfText(
  file: Blob,
  signal?: AbortSignal,
  report?: (done: number, total: number) => void,
  maxPages = 80,
) {
  const doc = await loadRender(file, { signal, workerRendering: true })
  try {
    if (doc.numPages > maxPages)
      throw Error(`Choose a document with up to ${maxPages} pages for this export.`)
    const pages: PdfTextPage[] = []
    for (let index = 0; index < doc.numPages; index++) {
      signal?.throwIfAborted()
      const page = await doc.getPage(index + 1)
      const view = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const rows: PdfTextLine[][] = []
      for (const source of content.items as unknown as RawText[]) {
        const text = source.str?.replaceAll(/\s+/g, ' ').trim()
        if (!text) continue
        const transform = source.transform ?? [1, 0, 0, 1, 0, 0]
        const font = Math.max(1, Math.hypot(transform[0], transform[1]) || source.height || 10)
        const y = transform[5]
        const item: PdfTextLine = {
          text,
          x: transform[4],
          y,
          width: Math.max(0, source.width ?? 0),
          height: Math.max(1, source.height ?? font),
          font,
        }
        const row = rows.find((candidate) =>
          Math.abs(candidate[0].y - y) <= Math.max(2.5, font * 0.42),
        )
        ;(row ?? rows[rows.push([]) - 1]).push(item)
      }
      const lines = rows
        .map((row) => {
          const sorted = row.sort((a, b) => a.x - b.x)
          const first = sorted[0]
          return {
            text: sorted
              .map((item, position) => {
                const before = sorted[position - 1]
                const space =
                  before && item.x - (before.x + before.width) > Math.max(1.5, item.font * 0.12)
                    ? ' '
                    : ''
                return space + item.text
              })
              .join('')
              .replaceAll(/\s+/g, ' ')
              .trim(),
            x: Math.min(...sorted.map((item) => item.x)),
            y: first.y,
            width: Math.max(...sorted.map((item) => item.x + item.width)) - Math.min(...sorted.map((item) => item.x)),
            height: Math.max(...sorted.map((item) => item.height)),
            font: Math.max(...sorted.map((item) => item.font)),
          }
        })
        .filter((line) => line.text)
        .sort((a, b) => b.y - a.y || a.x - b.x)
      pages.push({ index, width: view.width, height: view.height, lines })
      page.cleanup()
      report?.(index + 1, doc.numPages)
    }
    if (!pages.some((page) => page.lines.length))
      throw Error('No embedded text was found. Use OCR PDF for a scanned document.')
    return pages
  } finally {
    await doc.dispose().catch(() => {})
  }
}

export function pdfLinesText(pages: PdfTextPage[]) {
  return pages
    .map((page) => page.lines.map((line) => line.text).join('\n'))
    .join('\n\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim()
}

function words(value: string) {
  return value
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]{2,}/gu) ?? []
}

/** A deterministic, fully local extractive summary—not a fabricated LLM result. */
export function extractiveSummary(text: string, maxSentences = 7) {
  const chunks = text
    .replaceAll(/\s+/g, ' ')
    .split(/(?<=[.!?।])\s+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 25 && item.length <= 520)
  if (!chunks.length) return []
  const frequencies = new Map<string, number>()
  for (const token of words(text)) frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
  const scored = chunks.map((sentence, index) => {
    const tokens = words(sentence)
    const score = tokens.length
      ? tokens.reduce((sum, token) => sum + (frequencies.get(token) ?? 0), 0) / Math.sqrt(tokens.length)
      : 0
    return { sentence, index, score }
  })
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.min(maxSentences, chunks.length))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence)
}

export function toMarkdown(pages: PdfTextPage[]) {
  return pages
    .map((page, pageIndex) => {
      const sizes = page.lines.map((line) => line.font).sort((a, b) => a - b)
      // Use the lower median so a single display heading does not become the
      // baseline in short title-and-body pages.
      const median = sizes[Math.max(0, Math.floor((sizes.length - 1) / 2))] || 10
      const lines = page.lines.map((line) => {
        const value = line.text.replaceAll(/([*_`])/g, '\\$1')
        if (line.font > median * 1.42 && value.length < 140) return `# ${value}`
        if (line.font > median * 1.18 && value.length < 180) return `## ${value}`
        if (/^(?:[•●▪◦–-]|\d+[.)])\s+/u.test(value)) return `- ${value.replace(/^(?:[•●▪◦–-]|\d+[.)])\s+/u, '')}`
        return value
      })
      return `<!-- Page ${pageIndex + 1} -->\n\n${lines.join('\n\n')}`
    })
    .join('\n\n---\n\n')
}
