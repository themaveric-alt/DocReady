import { sizeLabel } from './files'
import { pdfBlob } from './pdf-edit'
import { renderBlob, type RenderPDF } from './pdf-render'
import { searchQuality } from './compression-search'

export type PdfCompressionPreset = 'extreme' | 'recommended' | 'light'
export type PdfCompressionResult = {
  blob: Blob
  met: boolean
  original: boolean
  quality: number
  scale: number
}

const presetOptions: Record<PdfCompressionPreset, { quality: number; scale: number }> = {
  extreme: { quality: 0.34, scale: 0.8 },
  recommended: { quality: 0.64, scale: 1.2 },
  light: { quality: 0.84, scale: 1.65 },
}

async function rasterPdf(
  doc: RenderPDF,
  pages: number[],
  scale: number,
  quality: number,
  report?: (done: number, total: number) => void,
) {
  const worker = new Worker(new URL('./pdf-compression.worker.ts', import.meta.url), { type: 'module' })
  const send = (data: object) => new Promise<{ bytes?: Uint8Array }>((resolve, reject) => {
    worker.onmessage = ({ data }) => data.error ? reject(Error(data.error)) : resolve(data)
    worker.onerror = () => reject(Error('The PDF compression worker stopped. Try a smaller document.'))
    worker.postMessage(data)
  })
  try {
  await send({ type: 'start' })
  for (const [position, index] of pages.entries()) {
    const source = await doc.getPage(index + 1)
    const view = source.getViewport({ scale: 1 })
    const jpeg = await renderBlob(doc, index, scale, 'image/jpeg', quality)
    await send({ type: 'page', blob: jpeg, width: view.width, height: view.height })
    source.cleanup()
    report?.(position + 1, pages.length)
  }
  const result = await send({ type: 'finish' })
  if (!result.bytes) throw Error('The compressor returned no PDF bytes.')
  return pdfBlob(result.bytes)
  } finally { worker.terminate() }
}

/**
 * Raster compression is deliberately conservative: it never claims that every
 * PDF can shrink. Exact mode maximises JPEG quality below the requested byte
 * ceiling, then only lowers render scale when that quality search cannot meet
 * the size constraint.
 */
export async function compressPdfLocally(
  doc: RenderPDF,
  original: Blob,
  pages: number[],
  options: { preset: PdfCompressionPreset; targetBytes?: number },
  report?: (progress: number, stage: string) => void,
): Promise<PdfCompressionResult> {
  if (!pages.length) throw Error('Select at least one page.')
  const target = options.targetBytes
  if (target && original.size <= target)
    return { blob: original, met: true, original: true, quality: 1, scale: 1 }
  if (!target) {
    const current = presetOptions[options.preset]
    const blob = await rasterPdf(doc, pages, current.scale, current.quality, (done, total) =>
      report?.((done / total) * 92, 'Re-encoding pages'),
    )
    return blob.size >= original.size
      ? { blob: original, met: true, original: true, quality: 1, scale: 1 }
      : { blob, met: true, original: false, ...current }
  }
  // Start at readable document resolution, then step down only if needed.
  const scales = [1.8, 1.5, 1.25, 1, 0.85, 0.72, 0.6, 0.5]
  let smallest: { blob: Blob; quality: number; scale: number } | undefined
  const totalAttempts = scales.length * 10
  let attempt = 0
  for (const scale of scales) {
    const searched = await searchQuality(async (quality) => {
      const candidate = await rasterPdf(doc, pages, scale, quality)
      attempt++
      report?.((attempt / totalAttempts) * 96, `Searching quality at ${Math.round(scale * 100)}% render scale`)
      if (!smallest || candidate.size < smallest.blob.size)
        smallest = { blob: candidate, quality, scale }
      return candidate
    }, target)
    if (searched.met)
      return { blob: searched.value, met: true, original: false, quality: searched.quality, scale }
  }
  if (!smallest) throw Error('The local PDF compressor could not create an output.')
  report?.(100, `Could not reach ${sizeLabel(target)} safely`)
  return { ...smallest, met: false, original: false }
}
