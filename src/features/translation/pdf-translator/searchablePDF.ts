import { PDFDocument } from 'pdf-lib'
import { canvasBlob } from '../../../lib/raster'
import { pdfBlob } from '../../../lib/pdf-edit'
import { stem, type Output } from '../../../lib/files'
import { ensureFonts, families, translationFontBytes } from '../fonts'
import { wrapText } from '../layoutText'
import type { JobProgress, SourcePage, TextBlock } from '../types'
import { attemptPositions, type PDFMode } from './pdfLayoutEngine'
import {
  addSearchLayer,
  searchFonts,
  type SearchLine,
} from './pdfSearchLayer'

const WIDTH = 595.28,
  HEIGHT = 841.89,
  MARGIN = 42
const DPI = 180,
  DENSITY = DPI / 72

/** Render each page at print resolution and put exact Unicode text over its visual layer. */
export async function searchablePDF(
  name: string,
  sources: SourcePage[],
  blocks: TextBlock[],
  mode: PDFMode,
  fontPixels: number,
  fontStyle: keyof typeof families,
  signal: AbortSignal,
  report?: (value: JobProgress) => void,
): Promise<Output> {
  await ensureFonts()
  const pdf = await PDFDocument.create()
  pdf.registerFontkit((await import('@pdf-lib/fontkit')).default)
  const [latin, devanagari] = await translationFontBytes()
  const embedded = await searchFonts(pdf, [
    await pdf.embedFont(latin, { subset: false }),
    await pdf.embedFont(devanagari, { subset: false }),
  ])
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(WIDTH * DENSITY)
  canvas.height = Math.round(HEIGHT * DENSITY)
  const ctx = canvas.getContext('2d')
  if (!ctx)
    throw Error('The browser could not create a printable PDF canvas.')
  ctx.scale(DENSITY, DENSITY)
  const family = families[fontStyle],
    base = fontPixels * 0.75
  const span = WIDTH - MARGIN * 2
  const lineGap = base * 1.55
  const search: SearchLine[] = []
  let y = MARGIN,
    reflowed = 0
  function ink(size: number, bold = false, mono = false) {
    ctx!.font = `${bold ? 700 : 400} ${size}px ${mono ? 'monospace, ' : ''}${family}`
    ctx!.fillStyle = '#182137'
    ctx!.textBaseline = 'alphabetic'
  }
  function draw(
    text: string,
    x: number,
    top: number,
    size: number,
    bold = false,
    mono = false,
  ) {
    if (!text) return
    ink(size, bold, mono)
    ctx!.direction = /^[^\p{L}]*[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(
      text,
    )
      ? 'rtl'
      : 'ltr'
    ctx!.textAlign = 'left'
    const baseline = top + size
    ctx!.fillText(text, x, baseline)
    search.push({
      text,
      x,
      baseline,
      size,
      width: Math.max(1, ctx!.measureText(text).width),
    })
  }
  function start(sourcePage: number, label = true, continued = false) {
    ctx!.fillStyle = '#ffffff'
    ctx!.fillRect(0, 0, WIDTH, HEIGHT)
    y = MARGIN
    if (label) {
      draw(
        'Page ' + (sourcePage + 1) + (continued ? ' · continued' : ''),
        MARGIN,
        y,
        Math.max(8, base * 0.8),
        true,
      )
      y += lineGap * 1.6
    }
  }
  async function flush() {
    signal.throwIfAborted()
    if (pdf.getPageCount() >= 36)
      throw Error(
        'This PDF exceeds 36 output pages. Reduce the font size or export fewer pages at once.',
      )
    const page = pdf.addPage([WIDTH, HEIGHT])
    const png = await canvasBlob(canvas, 'image/png')
    const image = await pdf.embedPng(await png.arrayBuffer())
    page.drawImage(image, { x: 0, y: 0, width: WIDTH, height: HEIGHT })
    addSearchLayer(pdf, page, search, embedded)
    search.length = 0
  }
  async function row(
    texts: string[],
    index: number,
    size = base,
    options: {
      border?: boolean
      bold?: boolean
      mono?: boolean
      inset?: number
    } = {},
  ) {
    const gutter = texts.length > 1 ? (options.border ? 0 : 12) : 0
    const width = (span - gutter * (texts.length - 1)) / texts.length
    const pad = options.border ? 7 : 0,
      inset = options.inset ?? 0
    const step = size * 1.55
    ink(size, options.bold, options.mono)
    const items = texts.map(
      (text) =>
        wrapText(
          text,
          Math.max(10, width - 2 * pad - inset - 2),
          (t) => ctx!.measureText(t).width,
        ) ?? [text],
    )
    const length = Math.max(...items.map((item) => item.length))
    for (let offset = 0; offset < length;) {
      const available = Math.floor((HEIGHT - MARGIN - y - 2 * pad) / step)
      if (available < 1) {
        await flush()
        start(index, true, true)
        continue
      }
      const count = Math.min(available, length - offset)
      const height = 2 * pad + count * step
      if (options.border) {
        ctx!.strokeStyle = '#aeb8cd'
        ctx!.lineWidth = 0.5
        for (let i = 0; i < items.length; i++)
          ctx!.strokeRect(MARGIN + i * (width + gutter), y, width, height)
      }
      // Emit lines in row order so adjacent columns remain usable in a text reader.
      for (let j = 0; j < count; j++)
        for (const [i, item] of items.entries()) {
          const content = item[offset + j] ?? ''
          draw(
            content,
            MARGIN + (width + gutter) * i + pad + inset,
            y + pad + j * step,
            size,
            options.bold,
            options.mono,
          )
        }
      offset += count
      y += height
    }
    y += options.border ? 0 : Math.max(3, step * 0.23)
  }
  async function reflow(
    entries: TextBlock[],
    index: number,
    original = false,
  ) {
    const value = (block: TextBlock) =>
      original ? block.original : block.translated
    for (let i = 0; i < entries.length; i++) {
      const b = entries[i]
      if (b.role === 'cell') {
        const cells = [value(b)]
        while (
          entries[i + 1]?.role === 'cell' &&
          entries[i + 1].row === b.row
        )
          cells.push(value(entries[++i]))
        await row(cells, index, base, { border: true })
      } else
        await row(
          [value(b)],
          index,
          b.role === 'heading' ? base * 1.26 : base,
          {
            bold: b.role === 'heading',
            mono: b.role === 'code',
            inset: b.role === 'list' ? 9 : 0,
          },
        )
    }
  }
  try {
    for (const [i, page] of sources.entries()) {
      signal.throwIfAborted()
      report?.({
        stage: 'Generating downloadable PDF',
        done: i,
        total: sources.length,
        unit: 'pages',
      })
      const entries = blocks.filter(
        (b) => b.page === page.index && b.translated.trim(),
      )
      const positions =
        mode === 'layout' && entries.length
          ? attemptPositions(
              page,
              entries,
              base,
              fontStyle === 'serif',
              WIDTH,
            )
          : undefined
      if (positions) {
        const columns = entries.map((b, index) => {
          const p = positions[index]
          const width = (parseFloat(String(p.width)) * WIDTH) / 100
          const size = parseFloat(String(p.fontSize))
          ink(size, b.role === 'heading')
          return wrapText(
            b.translated,
            width - 4,
            (t) => ctx.measureText(t).width,
          )
        })
        const fits = columns.every(
          (lines, i) =>
            lines &&
            lines.length * parseFloat(String(positions[i].fontSize)) * 1.5 <=
              (parseFloat(String(positions[i].minHeight)) * HEIGHT) / 100,
        )
        if (fits) {
          start(page.index, false)
          entries.forEach((b, index) => {
            const { left, top, fontSize } = positions[index]
            const [x, y] = [
              (parseFloat(String(left)) * WIDTH) / 100,
              (parseFloat(String(top)) * HEIGHT) / 100,
            ]
            const size = parseFloat(String(fontSize))
            columns[index]!.forEach((line, j) =>
              draw(line, x, y + j * size * 1.5, size, b.role === 'heading'),
            )
          })
          await flush()
          continue
        }
      }
      if (mode === 'layout') reflowed++
      start(page.index)
      if (!entries.length)
        await row(['No translated text on this page.'], page.index)
      else if (mode === 'bilingual-columns') {
        await row(['Original', 'Translation'], page.index, base, {
          border: true,
          bold: true,
        })
        for (const b of entries)
          await row([b.original, b.translated], page.index, base, {
            border: true,
          })
      } else if (mode === 'bilingual-blocks') {
        for (const b of entries) {
          await row(['Original'], page.index, base * 0.8, { bold: true })
          await row([b.original], page.index)
          await row(['Translation'], page.index, base * 0.8, { bold: true })
          await row([b.translated], page.index)
        }
      } else if (mode === 'bilingual-pages') {
        await row(['Original'], page.index, base, { bold: true })
        await reflow(entries, page.index, true)
        await row(['Translation'], page.index, base, { bold: true })
        await reflow(entries, page.index)
      } else await reflow(entries, page.index)
      await flush()
    }
    return {
      name: stem(name) + '-translated.pdf',
      blob: pdfBlob(await pdf.save()),
      detail: `${pdf.getPageCount()} PDF page(s) · ${DPI} DPI visual layer · searchable Unicode${reflowed ? ' · ' + reflowed + ' page(s) used reflow' : ''}`,
    }
  } finally {
    canvas.width = canvas.height = 0
  }
}
