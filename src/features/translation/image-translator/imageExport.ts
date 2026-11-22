import { PDFDocument } from 'pdf-lib'
import { canvasBlob } from '../../../lib/raster'
import { pdfBlob } from '../../../lib/pdf-edit'
import {
  extension,
  stem,
  type ImageMime,
  type Output,
} from '../../../lib/files'

import { withDPI } from '../../../lib/image-dpi'

export async function exportImage(
  canvas: HTMLCanvasElement,
  name: string,
  mime: ImageMime | 'application/pdf',
  quality: number,
  dpi: number,
): Promise<Output> {
  const suffix = mime === 'application/pdf' ? 'pdf' : extension(mime)
  let blob
  if (mime === 'application/pdf') {
    const pdf = await PDFDocument.create()
    const bitmap = await pdf.embedPng(
      await (await canvasBlob(canvas, 'image/png')).arrayBuffer(),
    )
    const size = [(canvas.width * 72) / dpi, (canvas.height * 72) / dpi] as [
      number,
      number,
    ]
    const page = pdf.addPage(size)
    page.drawImage(bitmap, { x: 0, y: 0, width: size[0], height: size[1] })
    blob = pdfBlob(await pdf.save())
  } else {
    blob = await canvasBlob(canvas, mime, quality)
    if (mime !== 'image/webp') blob = await withDPI(blob, dpi)
  }
  return {
    name: stem(name) + '-translated.' + suffix,
    blob,
    detail: `${canvas.width} × ${canvas.height} px · ${(canvas.width / dpi).toFixed(2)} × ${(canvas.height / dpi).toFixed(2)} in at ${dpi} pixels/in${mime === 'image/webp' ? ' (print calculation only)' : ''}`,
  }
}
