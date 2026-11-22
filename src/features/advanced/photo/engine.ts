import { fileKind, type ImageMime } from '../../../lib/files'
import { canvasBlob, decodeImage, newCanvas } from '../../../lib/raster'
import { outfitPaths, outfits } from './outfits'
import {
  clamp,
  type ColorEdits,
  type PhotoAnalysis,
  type PhotoEdits,
  type Point,
  type PortraitAnchor,
  type Stroke,
} from './photoState'

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
const context = (canvas: ReturnType<typeof newCanvas>, frequent = false) => {
  const result = canvas.getContext('2d', {
    willReadFrequently: frequent,
  }) as Context | null
  if (!result) throw Error('This browser could not allocate a photo canvas.')
  return result
}
const lum = (r: number, g: number, b: number) =>
  r * 0.2126 + g * 0.7152 + b * 0.0722
const release = (canvas: ReturnType<typeof newCanvas>) => {
  canvas.width = canvas.height = 1
}
export function canvasLimit() {
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory
  return memory && memory <= 2 ? 6_000_000 : 16_000_000
}

async function exif(file: Blob) {
  const data = new DataView(await file.slice(0, 192 * 1024).arrayBuffer())
  try {
    if (data.getUint16(0) !== 0xffd8) return
    for (let i = 2; i + 12 < data.byteLength; ) {
      const segment = data.getUint16(i),
        length = data.getUint16(i + 2)
      if (segment === 0xffda || length < 2) return
      if (segment === 0xffe1 && data.getUint32(i + 4) === 0x45786966) {
        const base = i + 10,
          little = data.getUint16(base) === 0x4949
        const table = base + data.getUint32(base + 4, little)
        for (
          let n = 0;
          n < Math.min(256, data.getUint16(table, little));
          n++
        ) {
          const pos = table + 2 + n * 12
          if (data.getUint16(pos, little) === 0x0112) {
            const orientation = data.getUint16(pos + 8, little)
            return orientation >= 1 && orientation <= 8
              ? orientation
              : undefined
          }
        }
        return
      }
      i += 2 + length
    }
  } catch {
    // Orientation is optional metadata. Decoding still applies recognized EXIF.
  }
}
type Face = {
  boundingBox: DOMRectReadOnly
  landmarks?: { type: string; locations: Point[] }[]
}
async function faceAnchor(
  canvas: ReturnType<typeof newCanvas>,
): Promise<PortraitAnchor | undefined> {
  const Detector = (
    globalThis as {
      FaceDetector?: new (options: {
        maxDetectedFaces: number
        fastMode: boolean
      }) => { detect(image: ImageBitmap): Promise<Face[]> }
    }
  ).FaceDetector
  if (!Detector) return
  let sample: ImageBitmap | undefined
  try {
    sample = await createImageBitmap(canvas)
    const faces = (
      await new Detector({ maxDetectedFaces: 3, fastMode: false }).detect(
        sample,
      )
    ).sort(
      (a, b) =>
        b.boundingBox.width * b.boundingBox.height -
        a.boundingBox.width * a.boundingBox.height,
    )
    const face = faces[0]
    if (
      !face ||
      (faces[1] && faces[1].boundingBox.width > face.boundingBox.width * 0.65)
    )
      return
    const box = face.boundingBox
    const eyes = (face.landmarks ?? [])
      .filter((l) => l.type.toLowerCase() === 'eye')
      .flatMap((l) => l.locations.slice(0, 1))
      .sort((a, b) => a.x - b.x)
    return {
      x: (box.x + box.width / 2) / canvas.width,
      neck: clamp((box.y + box.height * 1.2) / canvas.height, 0.16, 0.86),
      width: clamp((box.width / canvas.width) * 2.8, 0.25, 1.6),
      angle:
        eyes.length === 2
          ? clamp(
              (Math.atan2(eyes[1].y - eyes[0].y, eyes[1].x - eyes[0].x) *
                180) /
                Math.PI,
              -12,
              12,
            )
          : 0,
      method: 'face',
    }
  } catch {
    return undefined
  } finally {
    sample?.close()
  }
}
export async function analyzePhoto(file: Blob): Promise<PhotoAnalysis> {
  const image = await decodeImage(file)
  const scale = Math.min(1, 420 / Math.max(image.width, image.height))
  const canvas = newCanvas(
    Math.max(2, Math.round(image.width * scale)),
    Math.max(2, Math.round(image.height * scale)),
  )
  try {
    const ctx = context(canvas, true),
      { width: w, height: h } = canvas
    ctx.drawImage(image, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    let transparent = false
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 255) continue
      transparent = true
      const alpha = data[i + 3] / 255
      for (let channel = 0; channel < 3; channel++)
        data[i + channel] = data[i + channel] * alpha + 255 * (1 - alpha)
    }
    let count = 0,
      sum = 0,
      square = 0,
      shadows = 0,
      highlights = 0,
      edges = 0,
      edgeCount = 0,
      noise = 0,
      low = 0,
      corners = 0,
      complexity = 0,
      temperature = 0,
      tint = 0,
      neutrals = 0
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = (x + y * w) * 4,
          [r, g, b] = [data[i], data[i + 1], data[i + 2]],
          l = lum(r, g, b)
        const near = (j: number) => lum(data[j], data[j + 1], data[j + 2])
        const opposite = [
          near(i - 4),
          near(i + 4),
          near(i - w * 4),
          near(i + w * 4),
        ]
        const edge =
          Math.abs(opposite[1] - opposite[0]) +
          Math.abs(opposite[3] - opposite[2])
        count++
        sum += l
        square += l * l
        shadows += Number(l < 28)
        highlights += Number(l > 247)
        edges += edge
        edgeCount += Number(edge > 10)
        if (edge < 14) {
          noise += Math.abs(l - opposite.reduce((a, b) => a + b, 0) / 4)
          low++
        }
        if (
          (x < w * 0.19 || x > w * 0.81) &&
          (y < h * 0.23 || y > h * 0.82)
        ) {
          corners++
          complexity += Number(edge > 22)
        }
        if (l > 70 && l < 225 && Math.max(r, g, b) - Math.min(r, g, b) < 30) {
          temperature += r - b
          tint += (r + b) / 2 - g
          neutrals++
        }
      }
    const mean = sum / Math.max(1, count)
    return {
      width: image.width,
      height: image.height,
      format: (await fileKind(file)) ?? '',
      orientation: await exif(file),
      transparent,
      brightness: mean,
      contrast: Math.sqrt(
        Math.max(0, square / Math.max(1, count) - mean * mean),
      ),
      shadows: shadows / Math.max(1, count),
      highlights: highlights / Math.max(1, count),
      sharpness:
        (edges / Math.max(1, edgeCount)) *
        Math.min(1, edgeCount / Math.max(1, count * 0.1)),
      noise: noise / Math.max(1, low),
      background: complexity / Math.max(1, corners),
      temperature: temperature / Math.max(1, neutrals),
      tint: tint / Math.max(1, neutrals),
      anchor: await faceAnchor(canvas),
    }
  } finally {
    image.close()
    release(canvas)
  }
}

export async function silhouette(
  mask: Blob,
): Promise<PortraitAnchor | undefined> {
  const img = await decodeImage(mask),
    canvas = newCanvas(100, 100)
  try {
    const ctx = context(canvas, true)
    ctx.drawImage(img, 0, 0, 100, 100)
    const data = ctx.getImageData(0, 0, 100, 100).data
    const spans: { left: number; right: number; y: number }[] = []
    for (let y = 0; y < 100; y++) {
      let left = 100,
        right = -1
      for (let x = 0; x < 100; x++)
        if (data[(x + y * 100) * 4 + 3] > 170) {
          left = Math.min(left, x)
          right = x
        }
      if (right - left >= 6) spans.push({ left, right, y })
    }
    if (spans.length < 22) return
    const top = spans[0].y,
      mid = spans[Math.floor(spans.length * 0.27)],
      lower = spans[Math.floor(spans.length * 0.71)]
    if (lower.right - lower.left < (mid.right - mid.left) * 1.15 || top > 60)
      return
    return {
      x: (mid.left + mid.right) / 200,
      neck: clamp((top + spans.length * 0.47) / 100, 0.17, 0.88),
      width: clamp(((lower.right - lower.left) / 100) * 1.13, 0.25, 1.3),
      angle: 0,
      method: 'silhouette',
    }
  } finally {
    release(canvas)
    img.close()
  }
}

function adjust(ctx: Context, w: number, h: number, e: ColorEdits) {
  if (!Object.values(e).some(Boolean)) return
  const image = ctx.getImageData(0, 0, w, h),
    data = image.data
  const scale = 2 ** e.exposure,
    contrast = 1 + e.contrast / 100,
    gamma = 2 ** (-e.gamma / 100)
  const saturation = 1 + e.saturation / 100,
    vibrance = e.vibrance / 100
  const lut = Array.from(
    { length: 256 },
    (_, i) =>
      Math.pow(
        clamp(
          ((i * scale - 127) * contrast + 127 + e.brightness * 1.45) / 255,
          0,
          1,
        ),
        gamma,
      ) * 255,
  )
  const smooth = Math.max(0, e.noise) / 105,
    sharp = Math.max(0, e.sharpness) / 100
  const original = smooth || sharp ? new Uint8ClampedArray(data) : undefined
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (x + y * w) * 4
      const l = lum(data[i], data[i + 1], data[i + 2])
      const tone =
        (e.shadows * (1 - l / 255) ** 2 + e.highlights * (l / 255) ** 2) *
        0.84
      const texture = original && x && y && x < w - 1 && y < h - 1
      const chroma =
        (Math.max(data[i], data[i + 1], data[i + 2]) -
          Math.min(data[i], data[i + 1], data[i + 2])) /
        255
      for (let channel = 0; channel < 3; channel++) {
        const j = i + channel,
          raw = data[j]
        let v = raw
        if (texture && original) {
          const space =
            (original[j - 4] +
              original[j + 4] +
              original[j - w * 4] +
              original[j + w * 4]) /
            4
          const detail = raw - space
          v = clamp(
            raw +
              detail * (sharp * 0.7 - (Math.abs(detail) < 36 ? smooth : 0)),
            0,
            255,
          )
        }
        const balance =
          channel === 0
            ? e.temperature * 0.8 + e.tint * 0.22
            : channel === 1
              ? e.tint * -0.62
              : e.temperature * -0.8 + e.tint * 0.22
        const neutral = lut[Math.round(l)] + tone
        data[j] = e.grayscale
          ? neutral
          : neutral +
            (lut[Math.round(v)] - lut[Math.round(l)]) *
              Math.max(0, saturation + vibrance * (1 - chroma)) +
            balance
      }
    }
  ctx.putImageData(image, 0, 0)
}
function brush(
  ctx: Context,
  stroke: Stroke,
  w: number,
  h: number,
  source?: ReturnType<typeof newCanvas>,
) {
  const r = Math.max(1, stroke.radius * Math.min(w, h)),
    points = stroke.points
  if (!points.length) return
  ctx.save()
  ctx.globalCompositeOperation =
    stroke.action === 'erase' ? 'destination-out' : 'source-over'
  const stamp = (x: number, y: number) => {
    if (stroke.action === 'restore' && source) {
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2)
      ctx.clip()
      const spot = clamp(x + r * 2.6, r, w - r)
      ctx.drawImage(
        source,
        spot - r,
        clamp(y - r, 0, h - r * 2),
        r * 2,
        r * 2,
        x - r,
        y - r,
        r * 2,
        r * 2,
      )
      ctx.restore()
    } else {
      const color = ctx.createRadialGradient(
        x,
        y,
        r * (1 - stroke.softness),
        x,
        y,
        r,
      )
      color.addColorStop(0, '#fff')
      color.addColorStop(1, '#ffffff00')
      ctx.fillStyle = color
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r)
    }
  }
  let previous = points[0]
  stamp(previous.x * w, previous.y * h)
  for (const point of points.slice(1)) {
    const count = Math.max(
      1,
      Math.ceil(
        Math.hypot((point.x - previous.x) * w, (point.y - previous.y) * h) /
          (r * 0.36),
      ),
    )
    for (let k = 1; k <= count; k++)
      stamp(
        (previous.x + ((point.x - previous.x) * k) / count) * w,
        (previous.y + ((point.y - previous.y) * k) / count) * h,
      )
    previous = point
  }
  ctx.restore()
}
function paintOutfit(ctx: Context, edit: PhotoEdits, w: number, h: number) {
  const fit = edit.outfit,
    item = outfits.find((o) => o.id === fit?.id)
  if (!fit || !item) return
  ctx.save()
  ctx.translate(fit.x * w, fit.neck * h)
  ctx.rotate((fit.angle * Math.PI) / 180)
  ctx.scale((fit.width * w) / 180, (fit.height * h) / 92)
  ctx.translate(-100, -36)
  for (const itemPath of outfitPaths(item)) {
    const path = new Path2D(itemPath.d)
    ctx.globalAlpha = itemPath.opacity ?? 1
    if (itemPath.fill !== 'none') {
      ctx.fillStyle = itemPath.fill
      ctx.fill(path)
    }
    if (itemPath.stroke) {
      ctx.strokeStyle = itemPath.stroke
      ctx.lineWidth = itemPath.weight ?? 1
      ctx.stroke(path)
    }
  }
  ctx.restore()
}
export function cropPixels(width: number, height: number, edit: PhotoEdits) {
  const cw = width * edit.crop.width,
    ch = height * edit.crop.height
  const radians = (edit.rotation * Math.PI) / 180,
    cos = Math.abs(Math.cos(radians)),
    sin = Math.abs(Math.sin(radians))
  return {
    width: Math.max(1, Math.round(cw * cos + ch * sin)),
    height: Math.max(1, Math.round(ch * cos + cw * sin)),
  }
}
export type RenderChoice = {
  limit: number
  format: ImageMime
  quality: number
  width?: number
  height?: number
}
export async function renderPhoto(
  input: Blob,
  edit: PhotoEdits,
  options: RenderChoice,
) {
  const image = await decodeImage(input)
  const canvasLimitPx = Math.min(options.limit, canvasLimit())
  const allocated: ReturnType<typeof newCanvas>[] = []
  const make = (w: number, h: number) => {
    const c = newCanvas(w, h)
    allocated.push(c)
    return c
  }
  try {
    const crop = cropPixels(image.width, image.height, edit)
    const outScale = Math.min(
      1,
      Math.sqrt(canvasLimitPx / (crop.width * crop.height)),
      5000 / Math.max(crop.width, crop.height),
    )
    const width =
        options.width ?? Math.max(1, Math.round(crop.width * outScale)),
      height =
        options.height ?? Math.max(1, Math.round(crop.height * outScale))
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 7000 ||
      height > 7000 ||
      width * height > canvasLimitPx
    )
      throw Error('Choose smaller output dimensions for this device.')
    const needed = Math.max(width / crop.width, height / crop.height)
    const workingScale = Math.min(
      1,
      Math.max(0.08, needed * 1.18),
      Math.sqrt(canvasLimitPx / (image.width * image.height)),
    )
    const w = Math.max(1, Math.round(image.width * workingScale)),
      h = Math.max(1, Math.round(image.height * workingScale))
    const layer = make(w, h),
      front = context(layer, true)
    front.drawImage(image, 0, 0, w, h)
    const repairs = edit.strokes.filter((s) => s.action === 'restore')
    if (repairs.length) {
      const raw = make(w, h)
      context(raw).drawImage(layer, 0, 0)
      for (const stroke of repairs) brush(front, stroke, w, h, raw)
      release(raw)
    }
    adjust(front, w, h, edit.color)
    let mask: ReturnType<typeof newCanvas> | undefined
    const masks = edit.strokes.filter(
      (s) => s.action === 'add' || s.action === 'erase',
    )
    if (edit.mask || masks.length) {
      mask = make(w, h)
      const m = context(mask)
      if (edit.mask) {
        const bitmap = await decodeImage(edit.mask)
        try {
          m.drawImage(bitmap, 0, 0, w, h)
        } finally {
          bitmap.close()
        }
      } else {
        m.fillStyle = '#fff'
        m.fillRect(0, 0, w, h)
      }
      for (const stroke of masks) brush(m, stroke, w, h)
    }
    const protects = edit.outfit
      ? edit.strokes.filter((stroke) => stroke.action === 'protect')
      : []
    if (protects.length) {
      const saved = make(w, h),
        savedCtx = context(saved)
      savedCtx.drawImage(layer, 0, 0)
      const cover = make(w, h),
        pen = context(cover)
      for (const stroke of protects) brush(pen, stroke, w, h)
      savedCtx.globalCompositeOperation = 'destination-in'
      savedCtx.drawImage(cover, 0, 0)
      paintOutfit(front, edit, w, h)
      front.drawImage(saved, 0, 0)
      release(cover)
      release(saved)
    } else paintOutfit(front, edit, w, h)
    const composite = make(w, h),
      c = context(composite)
    if (mask && edit.background !== 'original') {
      front.save()
      front.globalCompositeOperation = 'destination-in'
      if (edit.feather && 'filter' in front)
        front.filter =
          'blur(' + ((edit.feather * Math.max(w, h)) / 900).toFixed(2) + 'px)'
      front.drawImage(mask, 0, 0)
      front.restore()
    }
    if (
      edit.background === 'solid' ||
      (edit.background === 'blur' && !('filter' in c))
    ) {
      c.fillStyle = edit.fill
      c.fillRect(0, 0, w, h)
    }
    if (edit.background === 'blur' && 'filter' in c) {
      c.save()
      c.filter =
        'blur(' +
        (edit.blur * Math.max(w, h)) / 850 +
        'px) brightness(' +
        edit.backgroundLight +
        '%)'
      const pad = Math.max(12, (edit.blur / 650) * Math.max(w, h))
      c.drawImage(image, -pad, -pad, w + pad * 2, h + pad * 2)
      c.restore()
    }
    c.drawImage(layer, 0, 0)
    release(layer)
    if (mask) release(mask)
    const out = make(width, height),
      target = context(out)
    const edgeUnit = Math.min(width, height) / 100
    if (options.format === 'image/jpeg' || edit.background === 'solid') {
      target.fillStyle = edit.background === 'solid' ? edit.fill : '#ffffff'
      target.fillRect(0, 0, width, height)
    }
    const border = edit.border * edgeUnit,
      margin = edit.margin * edgeUnit,
      radius = edit.corners * edgeUnit
    const frameWidth = width - 2 * margin,
      frameHeight = height - 2 * margin
    target.save()
    target.beginPath()
    target.roundRect(
      margin,
      margin,
      frameWidth,
      frameHeight,
      Math.min(radius, frameWidth / 2, frameHeight / 2),
    )
    if (edit.shadow) {
      target.shadowColor = '#23334788'
      target.shadowBlur = edgeUnit * 2
      target.shadowOffsetY = edgeUnit
      target.fillStyle = '#ffffff'
      target.fill()
      target.shadowBlur = 0
      target.shadowColor = '#00000000'
    }
    target.clip()
    const region = edit.crop,
      sx = region.x * w,
      sy = region.y * h,
      sw = region.width * w,
      sh = region.height * h
    const frameScale =
      Math.min(frameWidth / crop.width, frameHeight / crop.height) * edit.zoom
    const dw = region.width * image.width * frameScale,
      dh = region.height * image.height * frameScale
    target.translate(
      width / 2 + edit.offsetX * width,
      height / 2 + edit.offsetY * height,
    )
    target.rotate((edit.rotation * Math.PI) / 180)
    target.scale(edit.flipH ? -1 : 1, edit.flipV ? -1 : 1)
    target.imageSmoothingQuality = 'high'
    target.drawImage(composite, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh)
    target.restore()
    if (border > 0) {
      target.strokeStyle = edit.borderColor
      target.lineWidth = border
      target.beginPath()
      target.roundRect(
        margin + border / 2,
        margin + border / 2,
        frameWidth - border,
        frameHeight - border,
        radius,
      )
      target.stroke()
    }
    return {
      blob: await canvasBlob(out, options.format, options.quality),
      width,
      height,
      sourceWidth: crop.width,
      sourceHeight: crop.height,
    }
  } finally {
    image.close()
    for (const canvas of allocated) release(canvas)
  }
}
