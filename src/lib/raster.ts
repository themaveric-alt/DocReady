import { fileKind, images, type ImageMime } from './files'
import { searchQuality } from './compression-search'
export type Crop = { x: number; y: number; width: number; height: number }
export type RasterOptions = {
  width?: number
  height?: number
  crop?: Crop
  rotation?: number
  flipH?: boolean
  flipV?: boolean
  brightness?: number
  contrast?: number
  saturation?: number
  grayscale?: boolean
  threshold?: number
  transparent?: boolean
  white?: boolean
  sharp?: boolean
  format: ImageMime
  quality: number
  target?: number
  /** Internal safeguard for local target-size retries. */
  targetPass?: number
}
export const fullCrop: Crop = { x: 0, y: 0, width: 1, height: 1 }
type Canvas = HTMLCanvasElement | OffscreenCanvas
export function canvasBlob(
  canvas: Canvas,
  format: string,
  quality = 0.9,
): Promise<Blob> {
  const pending =
    'convertToBlob' in canvas
      ? canvas.convertToBlob({ type: format, quality })
      : new Promise<Blob>((ok, fail) =>
          canvas.toBlob(
            (b) =>
              b
                ? ok(b)
                : fail(Error('The browser could not encode this image.')),
            format,
            quality,
          ),
        )
  return pending.then((b) => {
    if (b.type !== format)
      throw Error(
        'This browser cannot export ' +
          format.split('/')[1].toUpperCase() +
          '.',
      )
    return b
  })
}
export async function decodeImage(blob: Blob) {
  const format = await fileKind(blob)
  if (!format || !(images as readonly string[]).includes(format))
    throw Error('Choose a valid JPEG, PNG or WebP image.')
  try {
    const image = await createImageBitmap(blob)
    if (image.width * image.height > 40_000_000) {
      image.close()
      throw Error('Image exceeds 40 megapixels.')
    }
    return image
  } catch (e) {
    if (String(e).includes('megapixels')) throw e
    throw Error('Could not decode the image. Try another JPEG, PNG or WebP.')
  }
}
export async function imageSize(blob: Blob) {
  const image = await decodeImage(blob)
  const { width, height } = image
  image.close()
  return { width, height }
}
export function resizeAspect(
  axis: 'width' | 'height',
  value: number,
  original: { width: number; height: number },
) {
  return axis === 'width'
    ? {
        width: value,
        height: Math.max(
          1,
          Math.round((value * original.height) / original.width),
        ),
      }
    : {
        width: Math.max(
          1,
          Math.round((value * original.width) / original.height),
        ),
        height: value,
      }
}
export function newCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}
export async function processRaster(blob: Blob, options: RasterOptions) {
  const img = await decodeImage(blob)
  try {
    const crop = options.crop ?? fullCrop
    const sx = Math.max(0, Math.floor(img.width * crop.x)),
      sy = Math.max(0, Math.floor(img.height * crop.y))
    const sw = Math.min(img.width - sx, Math.round(img.width * crop.width)),
      sh = Math.min(img.height - sy, Math.round(img.height * crop.height))
    if (sw < 1 || sh < 1) throw Error('Select a crop inside the image.')
    const rot = (options.rotation ?? 0) % 360,
      swap = Math.abs(rot) % 180 === 90
    const w = options.width ?? (swap ? sh : sw),
      h = options.height ?? (swap ? sw : sh)
    if (
      !Number.isInteger(w) ||
      !Number.isInteger(h) ||
      w < 1 ||
      h < 1 ||
      w * h > 16_000_000 ||
      w > 10000 ||
      h > 10000
    )
      throw Error(
        'Output must use whole pixels, up to 10,000 per side and 16 megapixels total.',
      )
    const canvas = newCanvas(w, h)
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!ctx) throw Error('Canvas processing is unavailable.')
    const flatten =
      options.white || options.transparent || options.format === 'image/jpeg'
    const brightness = (options.brightness ?? 100) / 100
    const contrast = (options.contrast ?? 100) / 100
    const saturation = options.grayscale ? 0 : (options.saturation ?? 100) / 100
    const useFallback =
      typeof ctx.filter !== 'string' &&
      (brightness !== 1 || contrast !== 1 || saturation !== 1)
    if (flatten && !useFallback) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.scale(options.flipH ? -1 : 1, options.flipV ? -1 : 1)
    const dw = swap ? h : w,
      dh = swap ? w : h
    if (!useFallback && typeof ctx.filter === 'string')
      ctx.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh)
    ctx.restore()
    if (useFallback) {
      const pixels = ctx.getImageData(0, 0, w, h)
      const channel = (value: number) =>
        Math.max(
          0,
          Math.min(255, (value * brightness - 127.5) * contrast + 127.5),
        )
      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = channel(pixels.data[i]),
          g = channel(pixels.data[i + 1]),
          b = channel(pixels.data[i + 2])
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
        pixels.data[i] = gray + (r - gray) * saturation
        pixels.data[i + 1] = gray + (g - gray) * saturation
        pixels.data[i + 2] = gray + (b - gray) * saturation
      }
      ctx.putImageData(pixels, 0, 0)
      if (flatten) {
        ctx.save()
        ctx.globalCompositeOperation = 'destination-over'
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
      }
    }
    if (options.threshold || options.transparent || options.sharp) {
      const pixels = ctx.getImageData(0, 0, w, h),
        d = pixels.data,
        source = options.sharp ? d.slice() : d
      for (let i = 0; i < d.length; i += 4) {
        const x = (i / 4) % w,
          y = Math.floor(i / 4 / w)
        if (options.sharp && x > 0 && x < w - 1 && y > 0 && y < h - 1)
          for (let c = 0; c < 3; c++)
            d[i + c] =
              3 * source[i + c] -
              0.5 *
                (source[i + c - 4] +
                  source[i + c + 4] +
                  source[i + c - w * 4] +
                  source[i + c + w * 4])
        const luma = Math.round(
          0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2],
        )
        if (options.threshold)
          d[i] = d[i + 1] = d[i + 2] = luma >= options.threshold ? 255 : 0
        if (options.transparent && options.format !== 'image/jpeg') {
          const opacity = options.threshold
            ? luma >= options.threshold
              ? 0
              : 255
            : 255 - luma
          d[i] = d[i + 1] = d[i + 2] = 0
          d[i + 3] = Math.min(d[i + 3], opacity)
        }
      }
      ctx.putImageData(pixels, 0, 0)
    }
    const result = await canvasBlob(canvas, options.format, options.quality)
    const target = options.target ?? 0
    if (!target || result.size <= target || options.format === 'image/png')
      return {
        blob: result,
        width: w,
        height: h,
        met: !target || result.size <= target,
      }
    // Canvas encoders are not required to hit an exact byte count. Search for
    // the highest useful lossy quality below the requested ceiling first.
    const searched = await searchQuality(
      (quality) => canvasBlob(canvas, options.format, quality), target, options.quality,
    )
    const best = searched.value
    if (!searched.met) {
      const pass = options.targetPass ?? 0
      const nextWidth = Math.max(1, Math.floor(w * 0.9))
      const nextHeight = Math.max(1, Math.floor(h * 0.9))
      // A bounded 10% downscale ladder keeps target compression predictable
      // on low-memory devices while allowing genuinely smaller output.
      if (
        pass < 10 &&
        nextWidth < w &&
        nextHeight < h &&
        nextWidth * nextHeight >= 2_500
      ) {
        // Release the current decoded bitmap and canvas before the next pass.
        // Otherwise recursive retries retain a full-resolution copy per pass.
        img.close()
        canvas.width = 0
        canvas.height = 0
        return processRaster(blob, {
          ...options,
          width: nextWidth,
          height: nextHeight,
          targetPass: pass + 1,
        })
      }
      return { blob: best, width: w, height: h, met: false }
    }
    return { blob: best, width: w, height: h, met: true }
  } finally {
    img.close()
  }
}
