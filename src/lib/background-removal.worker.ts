// SPDX-License-Identifier: AGPL-3.0-only
import { smartCutout } from './smart-cutout'
import type { BackgroundRequest, BackgroundResponse } from './background-removal'
self.onmessage = async ({ data }: MessageEvent<BackgroundRequest>) => {
  const report = (message: BackgroundResponse) => self.postMessage(message)
  let bitmap: ImageBitmap | undefined
  const canvases: OffscreenCanvas[] = []
  function canvas(width: number, height: number) {
    const value = new OffscreenCanvas(width, height)
    canvases.push(value)
    return value
  }
  try {
    if (typeof OffscreenCanvas !== 'function') throw Error('This browser needs OffscreenCanvas support for this tool. Try an updated browser.')
    bitmap = await createImageBitmap(data.image)
    const { width, height } = bitmap
    if (width * height > 8_000_000 || Math.max(width, height) > 6000) throw Error('Choose an image up to 8 megapixels and 6,000 pixels per side.')
    const output = canvas(width, height)
    const out = output.getContext('2d')!
    if (data.type === 'paint') {
      out.fillStyle = data.color
      out.fillRect(0, 0, width, height)
      out.drawImage(bitmap, 0, 0)
    } else {
      const limit = data.limit ?? 1024
      const scale = Math.min(1, limit / Math.max(width, height))
      const preview = canvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
      const context = preview.getContext('2d', { willReadFrequently: true })!
      context.drawImage(bitmap, 0, 0, preview.width, preview.height)
      let mask: ImageBitmap
      if (data.smart) {
        report({ type: 'progress', key: 'compute:smart', current: 0, total: 1 })
        const pixels = context.getImageData(0, 0, preview.width, preview.height)
        smartCutout(pixels.data, pixels.width, pixels.height)
        context.putImageData(pixels, 0, 0)
        mask = await createImageBitmap(preview)
      } else {
        const { segmentSmall } = await import('./segment-small')
        mask = await segmentSmall(preview, (key, current, total) => report({ type: 'progress', key, current, total }))
      }
      try {
        out.drawImage(bitmap, 0, 0)
        out.globalCompositeOperation = 'destination-in'
        out.imageSmoothingEnabled = true
        out.imageSmoothingQuality = 'high'
        out.drawImage(mask, 0, 0, width, height)
      } finally { mask.close() }
    }
    report({ type: 'result', image: await output.convertToBlob({ type: 'image/png' }), width, height,
      notice: data.type === 'remove' && data.smart ? 'Smart Cutout used border-connected color removal. Review hair and foreground edges, especially on complex backgrounds.' : undefined })
  } catch (error) {
    const memory = /allocat|memory|buffer|session|wasm|webassembly|runtime/i.test(String(error))
    report({ type: 'error', recoverable: memory, message: memory ? 'The local AI model could not initialize within this browser’s resources.' : error instanceof Error ? error.message : 'Image processing stopped.' })
  } finally {
    bitmap?.close()
    for (const item of canvases) item.width = item.height = 0
  }
}
