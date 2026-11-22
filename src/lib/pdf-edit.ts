import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFImage,
} from 'pdf-lib'
import { PDF } from './files'
export const paperSizes: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  A5: [419.53, 595.28],
}
export async function openEdit(file: Blob) {
  try {
    const doc = await PDFDocument.load(await file.arrayBuffer(), {
      updateMetadata: false,
      throwOnInvalidObject: true,
    })
    if (!doc.getPageCount()) throw Error('No readable pages.')
    return doc
  } catch (e) {
    if (String(e).toLowerCase().includes('encrypt'))
      throw Error(
        'This PDF is password-protected. Open and unlock it before uploading.',
      )
    throw Error(
      'This PDF could not be read. Check that it opens in a PDF reader.',
    )
  }
}
export function pdfBlob(data: Uint8Array) {
  return new Blob([data.slice().buffer], { type: PDF })
}
export type PDFAction =
  | 'merge-pdf'
  | 'split-pdf'
  | 'rotate-pdf'
  | 'reorder-pdf'
  | 'watermark-pdf'
  | 'number-pdf'
  | 'annotate-pdf'
export type PDFOptions = {
  pages: number[]
  angle?: number
  text?: string
  size?: number
  color?: string
  opacity?: number
  position?: string
  start?: number
  shape?: string
  x?: number
  y?: number
  width?: number
  height?: number
  rotations?: Record<number, number>
}
export async function editPdf(
  action: PDFAction,
  files: Blob[],
  opts: PDFOptions,
) {
  const { pages } = opts
  if (
    action === 'merge-pdf' ||
    action === 'split-pdf' ||
    action === 'reorder-pdf'
  ) {
    const dest = await PDFDocument.create()
    for (const file of files) {
      const src = await openEdit(file)
      const indices = action === 'merge-pdf' ? src.getPageIndices() : pages
      const copied = await dest.copyPages(
        src,
        indices,
      )
      for (const [index, page] of copied.entries()) {
        const angle = opts.rotations?.[indices[index]] ?? 0
        if (angle) page.setRotation(degrees((page.getRotation().angle + angle) % 360))
        dest.addPage(page)
      }
    }
    if (!dest.getPageCount()) throw Error('Select at least one page.')
    return pdfBlob(await dest.save())
  }
  const doc = await openEdit(files[0])
  const type = await doc.embedFont(StandardFonts.Helvetica)
  const color = (opts.color ?? '#4c45b8').replace('#', '')
  const ink = rgb(
    ...([0, 2, 4].map((i) => parseInt(color.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ]),
  )
  const size = opts.size ?? 24
  if (!Number.isFinite(size) || size < 6 || size > 144)
    throw Error('Font size must be between 6 and 144 points.')
  const rect = opts.shape === 'rectangle' && action === 'annotate-pdf'
  for (const [index, number] of pages.entries()) {
    const page = doc.getPage(number)
    if (action === 'rotate-pdf') {
      page.setRotation(
        degrees((page.getRotation().angle + (opts.angle ?? 90)) % 360),
      )
      continue
    }
    const crop = page.getCropBox(),
      rotation = ((page.getRotation().angle % 360) + 360) % 360
    const width = rotation % 180 === 0 ? crop.width : crop.height,
      height = rotation % 180 === 0 ? crop.height : crop.width
    // Overlay coordinates use the visible page's bottom-left corner.
    const point = (x: number, y: number) => {
      const positions: Record<number, [number, number]> = {
        0: [x, y],
        90: [crop.width - y, x],
        180: [crop.width - x, crop.height - y],
        270: [y, crop.height - x],
      }
      const [px, py] = positions[rotation] ?? positions[0]
      return { x: px + crop.x, y: py + crop.y }
    }
    if (rect) {
      const w = opts.width ?? 120,
        h = opts.height ?? 60
      if (w < 1 || h < 1) throw Error('Rectangle dimensions must be positive.')
      page.drawRectangle({
        ...point(
          (width * (opts.x ?? 10)) / 100,
          (height * (opts.y ?? 80)) / 100,
        ),
        width: w,
        height: h,
        borderWidth: 2,
        borderColor: ink,
        rotate: degrees(rotation),
      })
      continue
    }
    let text = opts.text?.trim() ?? ''
    if (action === 'number-pdf')
      text = (text || '{n}')
        .replaceAll('{n}', String((opts.start ?? 1) + index))
        .replaceAll('{total}', String(pages.length))
    if (!text) throw Error('Enter the text to place on the PDF.')
    let w = 0
    try {
      w = type.widthOfTextAtSize(text, size)
    } catch {
      throw Error(
        'PDF overlays support the built-in Western font. Remove unsupported characters and try again.',
      )
    }
    const position = opts.position ?? 'center'
    const x =
      action === 'annotate-pdf'
        ? (width * (opts.x ?? 10)) / 100
        : position.includes('left')
          ? 24
          : position.includes('right')
            ? width - w - 24
            : (width - w) / 2
    const y =
      action === 'annotate-pdf'
        ? (height * (opts.y ?? 80)) / 100
        : position.includes('top')
          ? height - 24 - size
          : position.includes('bottom')
            ? 24
            : (height - size) / 2
    const angle = action === 'watermark-pdf' ? (opts.angle ?? 0) : 0
    const radians = (angle * Math.PI) / 180
    const anchor =
      action === 'watermark-pdf'
        ? point(
            x + w / 2 - (w / 2) * Math.cos(radians),
            y - (w / 2) * Math.sin(radians),
          )
        : point(x, y)
    page.drawText(text, {
      ...anchor,
      size,
      font: type,
      color: ink,
      opacity: opts.opacity ?? 1,
      rotate: degrees(rotation + angle),
    })
  }
  return pdfBlob(await doc.save())
}
export async function imagesPdf(
  sources: Blob[],
  options: { paper: string; landscape: boolean; fit: string; margin: number },
) {
  const doc = await PDFDocument.create()
  for (const blob of sources) {
    const data = await blob.arrayBuffer()
    const img: PDFImage =
      blob.type === 'image/jpeg'
        ? await doc.embedJpg(data)
        : await doc.embedPng(data)
    let [w, h] =
      options.paper === 'Image'
        ? [img.width, img.height]
        : (paperSizes[options.paper] ?? paperSizes.A4)
    if (options.landscape && w < h) [w, h] = [h, w]
    const margin = options.margin
    if (!Number.isFinite(margin) || margin < 0 || margin * 2 >= Math.min(w, h))
      throw Error('Choose a smaller non-negative margin.')
    const aw = w - 2 * margin,
      ah = h - 2 * margin
    const ratio = Math.min(aw / img.width, ah / img.height)
    const dw = options.fit === 'stretch' ? aw : img.width * ratio,
      dh = options.fit === 'stretch' ? ah : img.height * ratio
    doc
      .addPage([w, h])
      .drawImage(img, {
        x: (w - dw) / 2,
        y: (h - dh) / 2,
        width: dw,
        height: dh,
      })
  }
  if (!doc.getPageCount()) throw Error('Add at least one image.')
  return pdfBlob(await doc.save())
}
