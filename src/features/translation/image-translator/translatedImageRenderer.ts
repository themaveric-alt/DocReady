import { decodeImage } from '../../../lib/raster'
import { ensureFonts, families } from '../fonts'
import { wrapText } from '../layoutText'
import type { Box, BoxStyle, TextBlock } from '../types'

export type ImageMode = 'replace' | 'overlay' | 'side' | 'stack' | 'captions'
export const defaultBoxStyle: BoxStyle = {
  color: '#17213a',
  background: '#ffffff',
  opacity: 0.95,
  size: 3.5,
  align: 'left',
  direction: 'auto',
  lineSpacing: 1.35,
  rotation: 0,
  font: 'sans',
}
export function overlayBox(box: Box, mode: ImageMode): Box {
  if (mode === 'replace') return box
  const width = Math.max(0.32, box.width),
    height = Math.max(0.09, box.height * 1.5)
  const below = box.y + box.height + 0.009
  return {
    x: Math.min(box.x, 1 - width),
    y: below + height < 1 ? below : Math.max(0, box.y - height - 0.009),
    width,
    height,
  }
}
export function clampBox(box: Box): Box {
  const width = Math.min(1, Math.max(0.035, box.width)),
    height = Math.min(1, Math.max(0.025, box.height))
  return {
    x: Math.max(0, Math.min(1 - width, box.x)),
    y: Math.max(0, Math.min(1 - height, box.y)),
    width,
    height,
  }
}

function makeCanvas(width: number, height: number) {
  if (width * height > 24_000_000 || width > 10_000 || height > 10_000)
    throw Error(
      'The output is larger than this editor supports. Reduce the export scale.',
    )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function backgroundFromEdges(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const { width: w, height: h } = ctx.canvas
  const points: [number, number][] = []
  const gap = Math.max(2, Math.round(height * 0.09))
  for (const fraction of [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.92]) {
    points.push(
      [x + width * fraction, y - gap],
      [x + width * fraction, y + height + gap],
    )
  }
  for (const fraction of [0.2, 0.5, 0.8]) {
    points.push(
      [x - gap, y + height * fraction],
      [x + width + gap, y + height * fraction],
    )
  }
  const colors = points
    .filter(([px, py]) => px >= 0 && py >= 0 && px < w && py < h)
    .map(
      ([px, py]) =>
        ctx.getImageData(Math.floor(px), Math.floor(py), 1, 1).data,
    )
    .filter((color) => color[3] >= 250)
  if (colors.length < 4) return undefined
  const median = [0, 1, 2].map(
    (channel) =>
      colors.map((color) => color[channel]).sort((a, b) => a - b)[
        Math.floor(colors.length / 2)
      ],
  )
  const agrees = colors.filter((color) =>
    median.every((value, channel) => Math.abs(value - color[channel]) <= 36),
  )
  return agrees.length >= colors.length * 0.66
    ? 'rgb(' + median.join(',') + ')'
    : undefined
}
function drawBox(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  box: Box,
  replacement: boolean,
) {
  const style = block.style ?? defaultBoxStyle
  const canvas = ctx.canvas
  const { width, height } = canvas
  const [x, y, w, h] = [
    box.x * width,
    box.y * height,
    box.width * width,
    box.height * height,
  ]
  const text = block.translated
  const pad = Math.max(1, Math.min(w, h) * (replacement ? 0.035 : 0.08))
  const family = families[style.font]
  const sourceHeight = Math.max(
    ...(block.sourceLines ?? [block.box]).map((line) => line.height),
  )
  let size =
    replacement && block.sourceLines && style.size === defaultBoxStyle.size
      ? sourceHeight * height
      : (style.size * Math.min(width, height)) / 100
  let lines: string[] | undefined
  let ascent = 0,
    lineHeight = 0,
    totalHeight = 0
  ctx.save()
  try {
    const floor = Math.min(
      size,
      replacement ? 5 : Math.max(7, Math.min(width, height) * 0.011),
    )
    for (;;) {
      ctx.font = `${size}px ${family}`
      lines = wrapText(
        text,
        w - pad * 2,
        (value) => ctx.measureText(value).width,
      )
      if (lines) {
        const measurements = lines.map((line) => ctx.measureText(line))
        ascent = Math.max(
          ...measurements.map((m) => m.actualBoundingBoxAscent),
        )
        const descent = Math.max(
          ...measurements.map((m) => m.actualBoundingBoxDescent),
        )
        lineHeight = Math.max(ascent + descent, size * style.lineSpacing)
        totalHeight = ascent + descent + (lines.length - 1) * lineHeight
        if (totalHeight + pad * 2 <= h) break
      }
      lines = undefined
      if (size <= floor) break
      size = Math.max(floor, size * 0.91)
    }
    if (!lines)
      throw Error(
        'Translation box ' +
          (block.id.split('-').at(-1) ?? '') +
          ' is too small. Resize the box or shorten its text.',
      )
    let fallbackPanel = false
    if (replacement && block.original) {
      const masks = (block.sourceLines ?? [block.box]).map((source) => {
        const rx = Math.floor(source.x * width),
          ry = Math.floor(source.y * height)
        const rw = Math.ceil((source.x + source.width) * width) - rx
        const rh = Math.ceil((source.y + source.height) * height) - ry
        return {
          rx,
          ry,
          rw,
          rh,
          sample: backgroundFromEdges(ctx, rx, ry, rw, rh),
        }
      })
      fallbackPanel = masks.some((mask) => !mask.sample)
      for (const { rx, ry, rw, rh, sample } of masks) {
        ctx.fillStyle = sample ?? style.background
        ctx.fillRect(rx, ry, rw, rh)
      }
    }
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.translate(x + w / 2, y + h / 2)
    ctx.rotate((style.rotation * Math.PI) / 180)
    if (!replacement || fallbackPanel) {
      ctx.globalAlpha = style.opacity
      ctx.fillStyle = style.background
      ctx.fillRect(-w / 2, -h / 2, w, h)
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = style.color
    ctx.textAlign = style.align
    ctx.textBaseline = 'alphabetic'
    ctx.direction =
      style.direction === 'auto'
        ? /^[^\p{L}]*[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(text)
          ? 'rtl'
          : 'ltr'
        : style.direction
    const at =
      style.align === 'left'
        ? -w / 2 + pad
        : style.align === 'right'
          ? w / 2 - pad
          : 0
    lines.forEach((line, index) =>
      ctx.fillText(line, at, -totalHeight / 2 + ascent + index * lineHeight),
    )
  } finally {
    ctx.restore()
  }
}

export async function renderTranslatedImage(
  file: File,
  blocks: TextBlock[],
  mode: ImageMode,
  scale: number,
  positions: Record<string, Box>,
) {
  await ensureFonts()
  const image = await decodeImage(file)
  let work: HTMLCanvasElement | undefined
  try {
    const width = Math.max(1, Math.round(image.width * scale)),
      height = Math.max(1, Math.round(image.height * scale))
    if (mode === 'captions') {
      const captions = blocks
        .filter((b) => b.translated)
        .map((b, index) => `${index + 1}. ${b.translated}`)
      const layout = document.createElement('canvas').getContext('2d')!
      const size = Math.max(14, Math.min(42, width / 40)),
        padding = Math.round(size * 1.4)
      layout.font = `${size}px ${families.sans}`
      const lines = captions.flatMap(
        (c) =>
          wrapText(
            c,
            width - 2 * padding,
            (t) => layout.measureText(t).width,
          ) ?? [c],
      )
      const result = makeCanvas(
        width,
        height + Math.ceil(lines.length * size * 1.45 + padding * 2),
      )
      const ctx = result.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, result.width, result.height)
      ctx.drawImage(image, 0, 0, width, height)
      ctx.font = layout.font
      ctx.fillStyle = '#17213a'
      ctx.textBaseline = 'alphabetic'
      lines.forEach((line, index) =>
        ctx.fillText(
          line,
          padding,
          height + padding + size + index * size * 1.45,
        ),
      )
      return result
    }
    work = makeCanvas(width, height)
    const ctx = work.getContext('2d', {
      willReadFrequently: mode === 'replace',
    })!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)
    for (const block of blocks.filter((b) => b.translated))
      drawBox(
        ctx,
        block,
        positions[block.id] ?? overlayBox(block.box, mode),
        mode === 'replace',
      )
    if (mode !== 'side' && mode !== 'stack') {
      const result = work
      work = undefined
      return result
    }
    const side = mode === 'side'
    const result = makeCanvas(width * (side ? 2 : 1), height * (side ? 1 : 2))
    const composite = result.getContext('2d')!
    composite.fillStyle = '#ffffff'
    composite.fillRect(0, 0, result.width, result.height)
    composite.drawImage(image, 0, 0, width, height)
    composite.drawImage(work, side ? width : 0, side ? 0 : height)
    return result
  } finally {
    image.close()
    if (work) work.width = work.height = 0
  }
}
