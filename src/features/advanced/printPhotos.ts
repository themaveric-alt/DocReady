import { PDFDocument, rgb } from 'pdf-lib'
import { canvasBlob, decodeImage, newCanvas } from '../../lib/raster'
import { photoJob } from './photo/photoJobs'
import { inspectImage } from '../../lib/image-meta'
import { errorText, type Output } from '../../lib/files'
import { pdfBlob } from '../../lib/pdf-edit'
import {
  contain,
  defaultPrint,
  effectiveDpi,
  marksFor,
  mmToPoints,
  planSheets,
  type Sheet,
  type Size,
} from '../e-card-studio/printLayout'

export const photoPapers: Record<string, Size> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  '4 × 6 inches': { width: 101.6, height: 152.4 },
  Letter: { width: 215.9, height: 279.4 },
}
export type PhotoSheetSettings = {
  paper: Size
  photo: Size
  copies: number
  gap: number
  margin: number
  cuts: boolean
  landscape: boolean
  dpi: 150 | 300 | 600
}
export const defaultPhotoSheet: PhotoSheetSettings = {
  paper: photoPapers.A4,
  photo: { width: 35, height: 45 },
  copies: 6,
  gap: 4,
  margin: 7,
  cuts: true,
  landscape: false,
  dpi: 300,
}
export const bins = (value: number, dpi: number) =>
  Math.max(1, Math.round((value * dpi) / 25.4))
export function photoPlan(
  count: number,
  settings: PhotoSheetSettings,
): Sheet[] {
  if (
    !Number.isInteger(settings.copies) ||
    settings.copies < 1 ||
    count * settings.copies > 120
  )
    throw Error('Choose at most 120 total photo copies.')
  return planSheets(
    Array.from({ length: count * settings.copies }, (_, i) => ({
      id: String(Math.floor(i / settings.copies)),
      side: 'extra',
      ...settings.photo,
    })),
    {
      ...defaultPrint,
      mode: 'grid',
      paper: 'custom',
      paperSize: settings.paper,
      orientation: settings.landscape ? 'landscape' : 'portrait',
      marginX: settings.margin,
      marginY: settings.margin,
      gapX: settings.gap,
      gapY: settings.gap,
      vertical: 'top',
    },
  )
}
async function embedPhoto(pdf: PDFDocument, file: Blob) {
  const metadata = await inspectImage(file)
  if (file.type === 'image/jpeg' && !metadata.includes('EXIF'))
    return pdf.embedJpg(await file.arrayBuffer())
  if (file.type === 'image/png' && !metadata.includes('eXIf'))
    return pdf.embedPng(await file.arrayBuffer())
  const image = await decodeImage(file),
    factor = Math.min(1, Math.sqrt(12_000_000 / (image.width * image.height)))
  const canvas = newCanvas(
    Math.round(image.width * factor),
    Math.round(image.height * factor),
  )
  try {
    const ctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return pdf.embedPng(
      await (await canvasBlob(canvas, 'image/png')).arrayBuffer(),
    )
  } finally {
    image.close()
    canvas.width = canvas.height = 1
  }
}
export async function makePhotoSheet(
  files: Blob[],
  settings: PhotoSheetSettings,
  signal?: AbortSignal,
): Promise<Output> {
  if (!files.length) throw Error('Choose at least one photo.')
  const sheets = photoPlan(files.length, settings)
  const pdf = await PDFDocument.create()
  const sources = []
  // Process one input at a time. Encoded images are reused for repeated copies.
  for (const file of files) {
    signal?.throwIfAborted()
    sources.push(await embedPhoto(pdf, file))
  }
  for (const sheet of sheets) {
    signal?.throwIfAborted()
    const page = pdf.addPage([
      mmToPoints(sheet.width),
      mmToPoints(sheet.height),
    ])
    for (const position of sheet.cards) {
      const source = sources[+position.id],
        frame = contain(source, position)
      page.drawImage(source, {
        x: mmToPoints(position.x + frame.x),
        y: mmToPoints(sheet.height - position.y - frame.y - frame.height),
        width: mmToPoints(frame.width),
        height: mmToPoints(frame.height),
      })
    }
    if (settings.cuts)
      for (const line of marksFor(sheet, 'corners'))
        page.drawLine({
          start: {
            x: mmToPoints(line.x1),
            y: mmToPoints(sheet.height - line.y1),
          },
          end: {
            x: mmToPoints(line.x2),
            y: mmToPoints(sheet.height - line.y2),
          },
          thickness: 0.42,
          color: rgb(0.37, 0.42, 0.51),
        })
  }
  return {
    name: 'docready-photo-sheet.pdf',
    blob: pdfBlob(await pdf.save()),
    detail:
      sheets.length +
      ' pages · ' +
      sheets[0].width +
      ' × ' +
      sheets[0].height +
      ' mm',
  }
}
export async function printInspection(
  file: Blob,
  target: Size,
  output?: Blob,
) {
  if (Object.values(target).some((n) => !Number.isFinite(n) || n <= 0))
    throw Error('Enter positive physical width and height values.')
  try {
    const signal = new AbortController().signal
    const original = await photoJob({ kind: 'analysis', file }, signal)
    const result = output
      ? await photoJob({ kind: 'analysis', file: output }, signal)
      : original
    const dpi = effectiveDpi(original, target)
    const gap = Math.abs(
      Math.log(
        original.width / original.height / (target.width / target.height),
      ),
    )
    return {
      original,
      result,
      dpi,
      format: (output ?? file).type,
      size: (output ?? file).size,
      ratio: original.width / original.height,
      clarity: result.sharpness < 9 ? 'Low edge detail' : 'Edges detected',
      warnings: [
        ...(result.sharpness < 9
          ? [
              'Low edge detail may appear soft when printed. Review the photo at 100%.',
            ]
          : []),
        ...(result.transparent
          ? [
              'Transparent areas show the underlying paper color. Flatten onto the intended print background if needed.',
            ]
          : []),
        ...(original.transparent && output?.type === 'image/jpeg'
          ? ['The JPEG output flattens source transparency.']
          : []),
        ...(result.highlights > 0.2
          ? [
              'Some areas are near white. Review bright details that may be clipped.',
            ]
          : []),
        ...(dpi < 300
          ? ['Below 300 effective source DPI at the selected print size.']
          : []),
        ...(gap > 0.05
          ? [
              'The source and paper slot have different ratios. Contain-fit leaves space around the image.',
            ]
          : []),
        ...(result.width > original.width * 1.2 ||
        result.height > original.height * 1.2
          ? ['Pixel dimensions were increased. This adds no original detail.']
          : []),
      ],
    }
  } catch (e) {
    throw Error(errorText(e))
  }
}
export function openPhotoPrint(
  build: () => Promise<Output>,
  onError: (message: string) => void,
) {
  const popup = window.open('', '_blank')
  if (!popup) {
    onError('Allow pop-ups or download the PDF and open it in a PDF viewer.')
    return
  }
  popup.opener = null
  popup.document.title = 'Print-ready PDF'
  popup.document.body.textContent = 'Preparing the local PDF…'
  void build()
    .then((file) => {
      if (popup.closed) return
      const url = URL.createObjectURL(file.blob)
      popup.location.replace(url)
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
    })
    .catch((e) => {
      popup.close()
      onError(errorText(e))
    })
}
