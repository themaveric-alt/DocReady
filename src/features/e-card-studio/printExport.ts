import { PDFDocument, rgb, StandardFonts, type PDFPage } from 'pdf-lib'
import { pdfBlob } from '../../lib/pdf-edit'
import { canvasBlob, decodeImage } from '../../lib/raster'
import { runRaster } from '../../lib/process-image'
import { zipFiles, sizeLabel, type Output } from '../../lib/files'
import { withDPI } from '../../lib/image-dpi'
import { finalCrop, intrinsic, type Card, type Cropped } from './cardCrop'
import { release } from './cardInput'
import { fullQuad } from './geometry'
import { sourceWalletQuad } from './walletRegions'
import {
  contain,
  effectiveDpi,
  marksFor,
  mmToPixels,
  mmToPoints,
  rulerFor,
  type Placement,
  type PrintSettings,
  type Sheet,
} from './printLayout'

export type ExportFormat = 'pdf' | 'png' | 'jpeg' | 'cards' | 'cards-jpeg' | 'zip'
type Prepared = { placement: Placement; card: Card; crop: Cropped }
const point = mmToPoints
type Report = (stage: string) => void

export function sheetDpi(
  sheet: Sheet,
  cards: Card[],
  selected: PrintSettings['dpi'],
) {
  if (selected) return selected
  const resolutions = sheet.cards.map((slot) => {
    const card = cards.find((c) => c.id === slot.id)!
    return card.source.pdf ? 300 : effectiveDpi(intrinsic(card), slot)
  })
  return Math.min(600, Math.max(72, Math.min(...resolutions)))
}
export function rasterPixelLimit() {
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory
  return memory && memory <= 2 ? 16_000_000 : 38_000_000
}
function printGuides(sheet: Sheet, s: PrintSettings) {
  return s.mode === 'pvc'
    ? []
    : [...marksFor(sheet, s.marks), ...(s.ruler ? rulerFor(sheet) : [])]
}
async function embedWholePage(
  output: PDFDocument,
  card: Card,
  bodies: Map<File, Promise<PDFDocument>>,
) {
  const { source } = card
  if (
    !source.pdf ||
    source.encrypted ||
    card.clarity ||
    card.rotation ||
    card.corners.some(
      (p, i) => p.x !== fullQuad[i].x || p.y !== fullQuad[i].y,
    )
  )
    return
  try {
    const page = await source.pdf.getPage(source.page! + 1)
    if (page.rotate || (await page.getAnnotations()).length) return
    let body = bodies.get(source.file)
    if (!body) {
      body = source.file
        .arrayBuffer()
        .then((bytes) => PDFDocument.load(bytes, { updateMetadata: false }))
      bodies.set(source.file, body)
    }
    const pdfPage = (await body).getPage(source.page!)
    const crop = pdfPage.getCropBox(),
      media = pdfPage.getMediaBox()
    if (
      crop.x !== 0 ||
      crop.y !== 0 ||
      media.x !== 0 ||
      media.y !== 0 ||
      crop.width !== media.width ||
      crop.height !== media.height ||
      Math.abs(crop.width - source.width) > 0.1 ||
      Math.abs(crop.height - source.height) > 0.1
    )
      return
    const embedded = await output.embedPage(pdfPage)
    await embedded.embed()
    return embedded
  } catch {
    /* Use the browser-rendered crop for ineligible PDF content. */
  }
}
function drawPDFGuides(page: PDFPage, sheet: Sheet, s: PrintSettings) {
  for (const l of printGuides(sheet, s))
    page.drawLine({
      start: { x: point(l.x1), y: point(sheet.height - l.y1) },
      end: { x: point(l.x2), y: point(sheet.height - l.y2) },
      thickness: 0.45,
      dashArray: s.marks === 'border' ? [3, 2] : undefined,
      color: rgb(0.37, 0.42, 0.51),
    })
}
async function makeRaster(
  sheet: Sheet,
  prepared: Prepared[],
  s: PrintSettings,
  dpi: number,
  type: 'png' | 'jpeg',
) {
  const width = mmToPixels(sheet.width, dpi),
    height = mmToPixels(sheet.height, dpi)
  if (width * height > rasterPixelLimit() || Math.max(width, height) > 11500)
    throw Error(
      'That raster sheet is too large for this device. Use print-ready PDF or select 300 DPI.',
    )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  try {
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingQuality = 'high'
    ctx.scale(width / sheet.width, height / sheet.height)
    for (const { placement, crop, card } of prepared) {
      const frame = contain(intrinsic(card), placement)
      const bitmap = await decodeImage(crop.blob)
      try {
        ctx.drawImage(
          bitmap,
          placement.x + frame.x,
          placement.y + frame.y,
          frame.width,
          frame.height,
        )
      } finally {
        bitmap.close()
      }
    }
    ctx.strokeStyle = '#606b82'
    ctx.lineWidth = 0.16
    ctx.beginPath()
    for (const l of printGuides(sheet, s)) {
      ctx.moveTo(l.x1, l.y1)
      ctx.lineTo(l.x2, l.y2)
    }
    ctx.stroke()
    if (s.ruler && s.mode !== 'pvc') {
      ctx.fillStyle = '#4f5a6f'
      ctx.font = '2.6px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(
        '50 mm  ·  Actual Size / 100%',
        sheet.width / 2,
        sheet.height - 3,
      )
    }
    return {
      blob: await withDPI(
        await canvasBlob(canvas, 'image/' + type, 0.96),
        dpi,
      ),
      detail: `${width} × ${height} px · ${dpi} DPI`,
    }
  } finally {
    release(canvas)
  }
}
export async function prepareExport(
  sheets: Sheet[],
  cards: Card[],
  s: PrintSettings,
  format: ExportFormat,
  report: Report,
  signal: AbortSignal,
): Promise<Output[]> {
  if (!sheets.length) throw Error('Add a card first.')
  const lookup = new Map(cards.map((c) => [c.id, c]))
  for (const card of cards) if (card.walletOnly && !sourceWalletQuad(card.corners, {
    width: card.source.width, height: card.source.height, rotation: card.source.pageRotation,
    lowerSection: true, anchors: [],
  })) throw Error('Only a compact landscape wallet card can be exported. Adjust the crop; the full letter page is not a card.')
  if (
    sheets.some((sheet) =>
      sheet.cards.some(
        ({ id }) => !lookup.get(id)?.detected || !lookup.get(id)?.accepted,
      ),
    )
  )
    throw Error('Review and confirm every crop before export.')
  const pdf =
    format === 'pdf' || format === 'zip'
      ? await PDFDocument.create()
      : undefined
  if (pdf) {
    pdf.setTitle('DocReady card print sheet')
    pdf.setCreator('DocReadyApp')
  }
  const vectors = new Map<File, Promise<PDFDocument>>(),
    crops: Output[] = [],
    outputs: Output[] = []
  const seen = new Set<string>()
  let extra = 0
  for (const [i, sheet] of sheets.entries()) {
    signal.throwIfAborted()
    const dpi = sheetDpi(sheet, cards, s.dpi)
    const page = pdf?.addPage([point(sheet.width), point(sheet.height)])
    const prepared: Prepared[] = []
    const raster = format === 'png' || format === 'jpeg'
    for (const [j, placement] of sheet.cards.entries()) {
      signal.throwIfAborted()
      report(
        `Preparing sheet ${i + 1} of ${sheets.length}, card ${j + 1} of ${sheet.cards.length}`,
      )
      const card = lookup.get(placement.id)!
      const vector =
        page && s.vector
          ? await embedWholePage(pdf!, card, vectors)
          : undefined
      const individual =
        (format === 'zip' || format === 'cards' || format === 'cards-jpeg') && !seen.has(card.id)
      const crop =
        !vector || individual
          ? await finalCrop(
              card,
              placement,
              raster || s.dpi ? dpi : 0,
              signal,
            )
          : undefined
      if (individual && crop) {
        seen.add(card.id)
        const name = card.side === 'extra' ? 'card-' + ++extra : card.side
        const effective = effectiveDpi(crop, placement)
        const jpeg = format === 'cards-jpeg'
        const blob = jpeg ? (await runRaster(crop.blob, { format: 'image/jpeg', quality: .96 }, signal)).blob : crop.blob
        crops.push({
          name: `docready-${name}.${jpeg ? 'jpg' : 'png'}`,
          blob: await withDPI(blob, effective),
          detail: `${crop.width} × ${crop.height} px · ${effective} DPI at print size`,
        })
      }
      if (raster && crop) prepared.push({ placement, card, crop })
      if (!page) continue
      const source =
        vector ?? (await pdf!.embedPng(await crop!.blob.arrayBuffer()))
      const frame = contain(intrinsic(card), placement)
      const dimensions = {
        x: point(placement.x + frame.x),
        y: point(sheet.height - placement.y - frame.y - frame.height),
        width: point(frame.width),
        height: point(frame.height),
      }
      if (vector) page.drawPage(vector, dimensions)
      else
        page.drawImage(
          source as Awaited<ReturnType<PDFDocument['embedPng']>>,
          dimensions,
        )
    }
    if (page) {
      drawPDFGuides(page, sheet, s)
      if (s.ruler && s.mode !== 'pvc') {
        const font = await pdf!.embedFont(StandardFonts.Helvetica)
        const label = '50 mm   Actual Size / 100%'
        page.drawText(label, {
          x: point(sheet.width / 2) - font.widthOfTextAtSize(label, 7) / 2,
          y: point(3),
          size: 7,
          font,
          color: rgb(0.32, 0.37, 0.45),
        })
      }
    }
    if (raster) {
      const rasterSettings = await makeRaster(sheet, prepared, s, dpi, format)
      outputs.push({
        name: `docready-sheet-${i + 1}.${format === 'jpeg' ? 'jpg' : 'png'}`,
        ...rasterSettings,
      })
    }
  }
  signal.throwIfAborted()
  if (format === 'cards' || format === 'cards-jpeg') return crops
  if (pdf) {
    report('Saving the print-ready PDF')
    const bytes = await pdf.save()
    if (!bytes.length || !pdf.getPageCount())
      throw Error('The print PDF could not be generated.')
    outputs.push({
      name: 'docready-card-print.pdf',
      blob: pdfBlob(bytes),
      detail: `${sheets.length} ${sheets.length === 1 ? 'sheet' : 'sheets'} · ${sheets[0].width} × ${sheets[0].height} mm`,
    })
  }
  if (format === 'zip') {
    report('Packing sheets and cropped cards')
    const zip = await zipFiles(
      [...outputs, ...crops],
      'docready-card-studio.zip',
    )
    return [
      {
        ...zip,
        detail: `${outputs.length + crops.length} files · ${sizeLabel(zip.blob.size)}`,
      },
    ]
  }
  return outputs
}
