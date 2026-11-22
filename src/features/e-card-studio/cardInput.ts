import { fileKind, PDF } from '../../lib/files'
import { canvasBlob, decodeImage } from '../../lib/raster'
import {
  loadRender,
  renderPage,
  type PDFPasswordRequest,
  type RenderPDF,
} from '../../lib/pdf-render'
import type { Point } from '../../lib/perspective'
import { bounds, containsPoint, type Quad } from './geometry'
import type { Side, Size } from './printLayout'

export type OCRHint = Point & {
  text: string
  angle: number
  box: ReturnType<typeof bounds>
}
export type Source = Size & {
  id: string
  file: File
  thumb: Blob
  page?: number
  pageRotation?: number
  pdf?: RenderPDF
  encrypted?: boolean
  aadhaar?: boolean
  imageOnly?: boolean
  hints: OCRHint[]
}
const canvasOf = (width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(3, Math.round(width))
  canvas.height = Math.max(3, Math.round(height))
  return canvas
}
export function release(canvas: HTMLCanvasElement) {
  canvas.width = canvas.height = 0
}
export async function imageCanvas(
  file: Blob,
  maxSide = Infinity,
  maxPixels = 16_000_000,
) {
  const image = await decodeImage(file)
  try {
    const scale = Math.min(
      1,
      maxSide / Math.max(image.width, image.height),
      Math.sqrt(maxPixels / (image.width * image.height)),
    )
    const canvas = canvasOf(image.width * scale, image.height * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return { canvas, width: image.width, height: image.height }
  } finally {
    image.close()
  }
}
export async function makeSources(
  file: File,
  signal: AbortSignal,
  password: PDFPasswordRequest,
  own: (pdf: RenderPDF) => void,
  maxPages: number,
) {
  if (file.size > 36 * 1024 * 1024)
    throw Error('Use a file smaller than 36 MB.')
  if ((await fileKind(file)) !== PDF) {
    const { canvas, width, height } = await imageCanvas(file, 1180)
    try {
      signal.throwIfAborted()
      return {
        sources: [
          {
            id: crypto.randomUUID(),
            file,
            width,
            height,
            thumb: await canvasBlob(canvas, 'image/jpeg', 0.94),
            hints: [],
          } satisfies Source,
        ],
        truncated: false,
      }
    } finally {
      release(canvas)
    }
  }
  if (maxPages <= 0)
    throw Error(
      'The PDF page limit for this batch was reached. Add this PDF separately.',
    )
  let encrypted = false
  const pdf = await loadRender(file, {
    signal,
    workerRendering: true,
    password: (incorrect) => {
      encrypted = true
      return password(incorrect)
    },
  })
  own(pdf)
  const sources: Source[] = []
  for (let index = 0; index < Math.min(pdf.numPages, maxPages); index++) {
    signal.throwIfAborted()
    const page = await pdf.getPage(index + 1)
    const base = page.getViewport({ scale: 1 })
    if (base.width < 4 || base.height < 4)
      throw Error('The PDF contains a page too small to process.')
    const thumb = await renderPage(
      pdf,
      index,
      Math.min(1180 / Math.max(base.width, base.height), 3),
    )
    try {
      const text = await page.getTextContent()
      const hints = text.items.flatMap((item) => {
        if (!('str' in item) || !item.str.trim()) return []
        const [a, b, c, d, tx, ty] = item.transform
        const p = (x: number, y: number) => {
          const [u, v] = base.convertToViewportPoint(x, y)
          return { x: u / base.width, y: v / base.height }
        }
        const start = p(tx, ty)
        const anglePoint = p(tx + a, ty + b)
        const length = Math.hypot(a, b) || 1
        const cap = Math.hypot(c, d) || 1
        const wx = (a * item.width) / length,
          wy = (b * item.width) / length
        const hx = (c * item.height) / cap,
          hy = (d * item.height) / cap
        const box = bounds([
          start,
          p(tx + wx, ty + wy),
          p(tx + wx + hx, ty + wy + hy),
          p(tx + hx, ty + hy),
        ])
        return [
          {
            x: (box.left + box.right) / 2,
            y: (box.top + box.bottom) / 2,
            angle:
              Math.round(
                Math.atan2(
                  (anglePoint.y - start.y) * base.height,
                  (anglePoint.x - start.x) * base.width,
                ) /
                  (Math.PI / 2),
              ) * 90,
            text: item.str,
            box,
          },
        ]
      })
      sources.push({
        id: crypto.randomUUID(),
        file,
        width: base.width,
        height: base.height,
        thumb: await canvasBlob(thumb, 'image/jpeg', 0.94),
        page: index,
        pageRotation: page.rotate,
        pdf,
        encrypted,
        aadhaar: hints.some((h) =>
          /\baadhaar\b|आधार|\buidai\b/iu.test(h.text),
        ),
        imageOnly: hints.length === 0,
        hints,
      })
    } finally {
      release(thumb)
      page.cleanup()
    }
  }
  if (sources.some((source) => source.aadhaar))
    for (const source of sources) source.aadhaar = true
  return { sources, truncated: pdf.numPages > sources.length }
}

export async function detectionCanvas(source: Source) {
  if (!source.pdf) return (await imageCanvas(source.thumb, 1180)).canvas
  const page = await source.pdf.getPage(source.page! + 1)
  const viewport = page.getViewport({ scale: 1 })
  const lite = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4) <= 2
  const scale = Math.min((lite ? 150 : 300) / 72, 5500 / Math.max(viewport.width, viewport.height), Math.sqrt((lite ? 3_000_000 : 9_000_000) / (viewport.width * viewport.height)))
  return renderPage(source.pdf, source.page!, scale)
}

export type Preset = keyof typeof presets
export const presets = {
  generic: ['Generic front and back', 1.586],
  aadhaar: ['e-Aadhaar', 1.586],
  masked: ['Masked e-Aadhaar', 1.586],
  pan: ['e-PAN', 1.586],
  epic: ['e-EPIC / Voter ID', 1.586],
  abha: ['ABHA Health Card', 1.586],
  ayushman: ['Ayushman health card', 1.586],
  licence: ['Driving Licence', 1.586],
  apaar: ['APAAR ID Card', 1.586],
  shram: ['e-Shram Card', 1.586],
  staff: ['Government employee ID', 1.586],
  student: ['Student identity card', 1.586],
  other: ['Other digital card', 1.5],
  custom: ['Custom document', 1.4],
} as const

export function sideFromText(
  text: string,
  preset: Preset,
): { side?: Side; high: boolean } {
  const normalized = text.normalize('NFKC').toLowerCase()
  if (
    /\b(front\s*(side|face)|obverse)\b|सामने\s*(का|की)/u.test(normalized) &&
    !/\b(back\s*(side|face)|reverse)\b/.test(normalized)
  )
    return { side: 'front', high: true }
  if (
    /\b(back\s*(side|face)|reverse side|reverse face)\b|पीछे\s*(का|की)/u.test(
      normalized,
    ) &&
    !/\b(front\s*(side|face)|obverse)\b/.test(normalized)
  )
    return { side: 'back', high: true }
  const address = /\b(address|residential)\b|पता\s*[:：]/u.test(normalized)
  const personal =
    /\b(dob|birth|gender|sex|father|mother|photo|portrait)\b|जन्म\s*तिथि/u.test(
      normalized,
    )
  const linked =
    /\b(aadhaar|epic|licence|license|government|abha|ayushman|pan|voter|student|registration|identity|apaar|shram|uan)\b|आधार|श्रम/u.test(
      normalized,
    )
  const contextual =
    linked ||
    ['aadhaar', 'masked', 'epic', 'licence', 'abha', 'ayushman', 'pan', 'apaar', 'shram'].includes(
      preset,
    )
  if (contextual && address && !personal)
    return { side: 'back', high: linked }
  if (contextual && personal && !address) {
    const detailCount =
      Number(/\b(dob|birth)\b|जन्म\s*तिथि/u.test(normalized)) +
      Number(/\b(gender|sex|male|female)\b|पुरुष|महिला/u.test(normalized)) +
      Number(/\b(photo|portrait)\b/u.test(normalized))
    return { side: 'front', high: linked && detailCount >= 2 }
  }
  return { high: false }
}
export const textIn = (source: Source, corners: Quad) =>
  source.hints
    .filter((h) => containsPoint(corners, h))
    .map((h) => h.text)
    .join(' ')

export function rotationIn(source: Source, corners: Quad) {
  const counts = new Map<number, number>()
  for (const hint of source.hints) {
    if (!containsPoint(corners, hint)) continue
    const rotation = (360 - hint.angle) % 360
    counts.set(rotation, (counts.get(rotation) ?? 0) + hint.text.length)
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1])
  return ranked[0]?.[1] >= 8 && ranked[0][1] > (ranked[1]?.[1] ?? 0) * 1.5
    ? ranked[0][0]
    : 0
}
