import { canvasBlob } from '../../lib/raster'
import { runRaster } from '../../lib/process-image'
import { warpRgba } from '../../lib/perspective'
import { imageCanvas, release, type Source } from './cardInput'
import {
  bounds,
  mapPDFCrop,
  quadSize,
  type Quad,
  validQuad,
} from './geometry'
import { contain, mmToPixels, type Side, type Size } from './printLayout'

export type Cropped = Size & { blob: Blob }
export type Card = {
  id: string
  source: Source
  corners: Quad
  original: Quad
  rotation: number
  preview: Cropped
  side: Side
  confidence: 'high' | 'uncertain' | 'unknown' | 'manual'
  detected: boolean
  accepted: boolean
  physical?: Size
  clarity?: boolean
  walletOnly?: boolean
}
type Pixels = ReturnType<typeof warpRgba>
export function rectangle(q: Quad) {
  const [a, b, c, d] = q
  return (
    Math.abs(a.y - b.y) +
      Math.abs(c.y - d.y) +
      Math.abs(a.x - d.x) +
      Math.abs(b.x - c.x) <
    0.0000001
  )
}
function warp(
  image: ImageData,
  corners: Quad,
  maxSide: number,
  signal?: AbortSignal,
): Promise<Pixels> {
  signal?.throwIfAborted()
  if (typeof Worker === 'undefined')
    return Promise.resolve(
      warpRgba(image.data, image.width, image.height, corners, maxSide),
    )
  const worker = new Worker(
    new URL('./cardCrop.worker.ts', import.meta.url),
    {
      type: 'module',
    },
  )
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener('abort', abort)
      worker.terminate()
    }
    const abort = () => {
      cleanup()
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({
      data,
    }: MessageEvent<Pixels | { error: string }>) => {
      cleanup()
      if ('error' in data) reject(Error(data.error))
      else resolve(data)
    }
    worker.onerror = () => {
      cleanup()
      reject(Error('The browser could not straighten this crop.'))
    }
    worker.postMessage({ rgba: image, corners, maxSide }, [image.data.buffer])
  })
}
function drawCrop(
  target: HTMLCanvasElement,
  source: CanvasImageSource,
  src: [number, number, number, number],
  size: Size,
  rotation: number,
) {
  const turned = rotation % 180 !== 0
  target.width = turned ? size.height : size.width
  target.height = turned ? size.width : size.height
  const ctx = target.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, target.width, target.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(target.width / 2, target.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(
    source,
    ...src,
    -size.width / 2,
    -size.height / 2,
    size.width,
    size.height,
  )
}
async function crop(
  source: HTMLCanvasElement,
  corners: Quad,
  rotation: number,
  maxSide: number,
  signal?: AbortSignal,
): Promise<Cropped> {
  if (!validQuad(corners))
    throw Error('Move the corners into a clockwise, non-crossing shape.')
  signal?.throwIfAborted()
  const target = document.createElement('canvas')
  let warped: HTMLCanvasElement | undefined
  try {
    if (rectangle(corners)) {
      const { left, right, top, bottom } = bounds(corners)
      const w = (right - left) * source.width,
        h = (bottom - top) * source.height
      const scale = Math.min(1, maxSide / Math.max(w, h))
      drawCrop(
        target,
        source,
        [left * source.width, top * source.height, w, h],
        {
          width: Math.max(3, Math.round(w * scale)),
          height: Math.max(3, Math.round(h * scale)),
        },
        rotation,
      )
    } else {
      const ctx = source.getContext('2d', { willReadFrequently: true })!
      const pixels = await warp(
        ctx.getImageData(0, 0, source.width, source.height),
        corners,
        maxSide,
        signal,
      )
      warped = document.createElement('canvas')
      warped.width = pixels.width
      warped.height = pixels.height
      warped
        .getContext('2d')!
        .putImageData(
          new ImageData(
            pixels.data as Uint8ClampedArray<ArrayBuffer>,
            pixels.width,
            pixels.height,
          ),
          0,
          0,
        )
      drawCrop(
        target,
        warped,
        [0, 0, pixels.width, pixels.height],
        pixels,
        rotation,
      )
    }
    return {
      blob: await canvasBlob(target, 'image/png'),
      width: target.width,
      height: target.height,
    }
  } finally {
    release(target)
    if (warped) release(warped)
  }
}
export async function previewCrop(
  source: Source,
  corners: Quad,
  rotation: number,
  signal?: AbortSignal,
  clarity = false,
) {
  if (source.pdf) return sharpenCrop(await rawFinalCrop({ source, corners, rotation }, { width: 85.6, height: 54 }, 300, signal), clarity, signal)
  const { canvas } = await imageCanvas(source.thumb, 1180)
  try {
    return await sharpenCrop(await crop(canvas, corners, rotation, 780, signal), clarity, signal)
  } finally {
    release(canvas)
  }
}
export function intrinsic(card: Pick<Card, 'source' | 'corners' | 'rotation'>) {
  return quadSize(
    card.corners,
    card.source.width,
    card.source.height,
    card.rotation,
  )
}
async function rawFinalCrop(
  card: Pick<Card, 'source' | 'corners' | 'rotation'>,
  slot: Size,
  dpi: number,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const { source, corners, rotation } = card
  let canvas: HTMLCanvasElement
  let limit = 5000
  if (source.pdf) {
    const raw = intrinsic(card)
    const frame = contain(raw, slot)
    const required = Math.max(
      mmToPixels(frame.width, dpi || 600),
      mmToPixels(frame.height, dpi || 600),
    )
    const page = await source.pdf.getPage(source.page! + 1)
    const preview = page.getViewport({ scale: 1 })
    const initial = mapPDFCrop(corners, preview, preview).region
    const width = initial.right - initial.left,
      height = initial.bottom - initial.top
    const scale = Math.min(
      required / Math.max(raw.width, raw.height),
      5500 / Math.max(width, height),
      Math.sqrt(9_000_000 / (width * height)),
    )
    const viewport = page.getViewport({ scale })
    const { projected, region } = mapPDFCrop(corners, preview, viewport)
    const regionWidth = region.right - region.left,
      regionHeight = region.bottom - region.top
    canvas = document.createElement('canvas')
    canvas.width = Math.max(3, Math.ceil(regionWidth))
    canvas.height = Math.max(3, Math.ceil(regionHeight))
    const sx = canvas.width / regionWidth,
      sy = canvas.height / regionHeight
    const task = page.render({
      canvas,
      viewport,
      transform: [sx, 0, 0, sy, -region.left * sx, -region.top * sy],
    })
    const cancel = () => task.cancel()
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      if (signal?.aborted) cancel()
      await task.promise
      const local = projected.map((point) => ({
        x: Math.max(0, Math.min(1, (point.x - region.left) / regionWidth)),
        y: Math.max(0, Math.min(1, (point.y - region.top) / regionHeight)),
      })) as Quad
      return await crop(
        canvas,
        local,
        rotation,
        Math.max(3, required),
        signal,
      )
    } finally {
      signal?.removeEventListener('abort', cancel)
      release(canvas)
      page.cleanup()
    }
  } else {
    const raw = intrinsic(card),
      frame = contain(raw, slot)
    if (dpi)
      limit = Math.max(
        mmToPixels(frame.width, dpi),
        mmToPixels(frame.height, dpi),
      )
    const decoded = await imageCanvas(source.file, 9800)
    canvas = decoded.canvas
  }
  try {
    return await crop(canvas, corners, rotation, limit, signal)
  } finally {
    release(canvas)
  }
}
export async function sharpenCrop(crop: Cropped, enabled: boolean, signal?: AbortSignal): Promise<Cropped> {
  if (!enabled) return crop
  const result = await runRaster(crop.blob, { format: 'image/png', quality: 1, sharp: true, contrast: 104 }, signal)
  return { blob: result.blob, width: result.width, height: result.height }
}
export async function finalCrop(card: Card, slot: Size, dpi: number, signal?: AbortSignal) {
  return sharpenCrop(await rawFinalCrop(card, slot, dpi, signal), Boolean(card.clarity), signal)
}
