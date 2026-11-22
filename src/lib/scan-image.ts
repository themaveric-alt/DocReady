import type * as OpenCV from '@techstark/opencv-js'
import { canvasBlob, decodeImage } from './raster'
import {
  orderScanCorners,
  scanDimensions,
  scanGeometry,
  type ScanCorners,
} from './scan-geometry'

type CV = typeof OpenCV
type Mat = OpenCV.Mat
export type ScanFilter = 'magic' | 'bw' | 'original'
export type ScanEdit = {
  corners: ScanCorners
  filter: ScanFilter
  rotation: 0 | 90 | 180 | 270
}
export type ScanJob =
  | { type: 'detect'; file: Blob }
  | {
      type: 'render'
      file: Blob
      edit: ScanEdit
      preview: boolean
      mime: 'image/jpeg' | 'image/png'
    }
export type ScanDetection = { corners?: ScanCorners }
export type ScanRender = { blob: Blob; width: number; height: number }
export type ScanRequest =
  | ScanJob
  | { type: 'pdf'; sources: Blob[]; paper: string }
export type ScanResult = ScanDetection | ScanRender | Blob
export type ScanReply =
  | { id: number; result: ScanResult }
  | { id: number; error: string }

function resources() {
  const handles: Array<{ delete(): void }> = []
  return {
    own<T extends { delete(): void }>(handle: T) {
      handles.push(handle)
      return handle
    },
    release() {
      while (handles.length) handles.pop()!.delete()
    },
  }
}

async function readPhoto(file: Blob, side: number, pixels: number) {
  const bitmap = await decodeImage(file)
  try {
    const { width, height } = scanDimensions(
      bitmap.width,
      bitmap.height,
      side,
      pixels,
    )
    if (width < 3 || height < 3) throw Error('The photo is too small to scan.')
    const canvas = new OffscreenCanvas(width, height)
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw Error('Canvas processing is unavailable.')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, width, height)
      return ctx.getImageData(0, 0, width, height)
    } finally {
      canvas.width = canvas.height = 1
    }
  } finally {
    bitmap.close()
  }
}

function detectCorners(cv: CV, photo: ImageData): ScanCorners | undefined {
  const memory = resources()
  try {
    const rgba = memory.own(cv.matFromImageData(photo))
    const gray = memory.own(new cv.Mat())
    const smooth = memory.own(new cv.Mat())
    const edges = memory.own(new cv.Mat())
    const hierarchy = memory.own(new cv.Mat())
    const polygon = memory.own(new cv.Mat())
    const kernel = memory.own(
      cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)),
    )
    const { width, height } = photo
    const frameArea = width * height
    let best: ScanCorners | undefined
    let bestArea = frameArea * 0.1

    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, smooth, new cv.Size(5, 5), 0)

    function collect() {
      const contours = new cv.MatVector()
      try {
        cv.findContours(
          edges,
          contours,
          hierarchy,
          cv.RETR_LIST,
          cv.CHAIN_APPROX_SIMPLE,
        )
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i)
          try {
            const area = cv.contourArea(contour)
            if (area <= bestArea || area >= frameArea * 0.985) continue
            const perimeter = cv.arcLength(contour, true)
            for (const tolerance of [0.015, 0.022, 0.033, 0.045]) {
              cv.approxPolyDP(contour, polygon, perimeter * tolerance, true)
              if (polygon.rows !== 4 || !cv.isContourConvex(polygon)) continue
              const coordinates = polygon.data32S
              const points = [0, 2, 4, 6].map((offset) => ({
                x: coordinates[offset] / (width - 1),
                y: coordinates[offset + 1] / (height - 1),
              })) as ScanCorners
              const ordered = orderScanCorners(points)
              const spans = ordered.map((point, index) => {
                const next = ordered[(index + 1) % 4]
                return Math.hypot(
                  (point.x - next.x) * width,
                  (point.y - next.y) * height,
                )
              })
              if (
                Math.min(...spans) < Math.min(width, height) * 0.13 ||
                Math.max(...spans) / Math.min(...spans) > 4.5
              )
                continue
              if (cv.contourArea(polygon) < area * 0.8) continue
              bestArea = area
              best = ordered
              break
            }
          } finally {
            contour.delete()
          }
        }
      } finally {
        contours.delete()
      }
    }

    for (const [low, high] of [
      [38, 112],
      [20, 60],
    ]) {
      cv.Canny(smooth, edges, low, high, 3, true)
      cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel)
      collect()
    }
    if (!best) {
      // A bright sheet on a dark surface may have incomplete Canny contours.
      cv.threshold(smooth, edges, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU)
      cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel)
      collect()
    }
    return best
  } finally {
    memory.release()
  }
}

function odd(value: number) {
  return Math.max(3, 2 * Math.floor(value / 2) + 1)
}

function normalizeLighting(cv: CV, light: Mat) {
  const memory = resources()
  try {
    const small = memory.own(new cv.Mat())
    const paper = memory.own(new cv.Mat())
    const background = memory.own(new cv.Mat())
    const { width, height } = scanDimensions(
      light.cols,
      light.rows,
      360,
      360 ** 2,
    )
    cv.resize(light, small, new cv.Size(width, height), 0, 0, cv.INTER_AREA)
    const span = odd(Math.min(59, Math.min(width, height) * 0.19))
    const kernel = memory.own(
      cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(span, span)),
    )
    cv.morphologyEx(small, paper, cv.MORPH_CLOSE, kernel)
    const smoothing = odd(span * 0.39)
    cv.GaussianBlur(paper, paper, new cv.Size(smoothing, smoothing), 0)
    cv.resize(
      paper,
      background,
      new cv.Size(light.cols, light.rows),
      0,
      0,
      cv.INTER_LINEAR,
    )
    const pixels = light.data
    const local = background.data
    for (let i = 0; i < pixels.length; i++) {
      const value = pixels[i]
      // Bound gain in very dark areas where the photograph has little detail.
      pixels[i] = Math.min(
        255,
        Math.round(value * (253 / Math.max(64, local[i]))),
      )
    }
  } finally {
    memory.release()
  }
}

function applyMagicColor(cv: CV, source: Mat) {
  const memory = resources()
  try {
    const rgb = memory.own(new cv.Mat())
    const lab = memory.own(new cv.Mat())
    const light = memory.own(new cv.Mat(source.rows, source.cols, cv.CV_8UC1))
    const contrast = memory.own(new cv.Mat())
    const blur = memory.own(new cv.Mat())
    const clahe = memory.own(new cv.CLAHE(2.0, new cv.Size(8, 8)))
    cv.cvtColor(source, rgb, cv.COLOR_RGBA2RGB)
    cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab)
    const labPixels = lab.data
    const luminance = light.data
    for (let i = 0; i < luminance.length; i++) luminance[i] = labPixels[i * 3]
    normalizeLighting(cv, light)
    clahe.apply(light, contrast)
    cv.addWeighted(light, 0.78, contrast, 0.22, 0, light)
    cv.GaussianBlur(light, blur, new cv.Size(3, 3), 0.8)
    cv.addWeighted(light, 1.34, blur, -0.34, 0, light)
    const enhanced = light.data
    const merged = lab.data
    for (let i = 0; i < enhanced.length; i++) merged[i * 3] = enhanced[i]
    cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB)
    cv.cvtColor(rgb, source, cv.COLOR_RGB2RGBA)
  } finally {
    memory.release()
  }
}

function applyBlackAndWhite(cv: CV, source: Mat) {
  const memory = resources()
  try {
    const light = memory.own(new cv.Mat())
    const binary = memory.own(new cv.Mat())
    const closed = memory.own(new cv.Mat())
    const kernel = memory.own(
      cv.getStructuringElement(cv.MORPH_CROSS, new cv.Size(3, 3)),
    )
    cv.cvtColor(source, light, cv.COLOR_RGBA2GRAY)
    normalizeLighting(cv, light)
    const window = odd(
      Math.min(119, Math.max(19, Math.min(light.cols, light.rows) * 0.075)),
    )
    cv.adaptiveThreshold(
      light,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      window,
      12,
    )
    cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, kernel)
    const mask = binary.data
    const cleaned = closed.data
    const width = binary.cols
    for (let y = 1; y < binary.rows - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x
        if (
          !mask[i] &&
          cleaned[i] &&
          mask[i - width - 1] &&
          mask[i - width] &&
          mask[i - width + 1] &&
          mask[i - 1] &&
          mask[i + 1] &&
          mask[i + width - 1] &&
          mask[i + width] &&
          mask[i + width + 1]
        ) {
          mask[i] = 255
        }
      }
    }
    cv.cvtColor(binary, source, cv.COLOR_GRAY2RGBA)
  } finally {
    memory.release()
  }
}

async function renderScan(
  cv: CV,
  photo: ImageData,
  job: Extract<ScanJob, { type: 'render' }>,
): Promise<ScanRender> {
  const memory = resources()
  try {
    const { points, width, height } = scanGeometry(
      job.edit.corners,
      photo.width,
      photo.height,
    )
    const size = scanDimensions(
      width,
      height,
      job.preview ? 1050 : 4000,
      job.preview ? 1_102_500 : 8_000_000,
    )
    const input = memory.own(cv.matFromImageData(photo))
    const from = memory.own(
      cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        points.flatMap(({ x, y }) => [x, y]),
      ),
    )
    const to = memory.own(
      cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        size.width - 1,
        0,
        size.width - 1,
        size.height - 1,
        0,
        size.height - 1,
      ]),
    )
    const homography = memory.own(cv.getPerspectiveTransform(from, to))
    const output = memory.own(new cv.Mat())
    cv.warpPerspective(
      input,
      output,
      homography,
      new cv.Size(size.width, size.height),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
    )

    if (job.edit.filter === 'magic') applyMagicColor(cv, output)
    if (job.edit.filter === 'bw') applyBlackAndWhite(cv, output)
    const rotation = {
      0: undefined,
      90: cv.ROTATE_90_CLOCKWISE,
      180: cv.ROTATE_180,
      270: cv.ROTATE_90_COUNTERCLOCKWISE,
    }[job.edit.rotation]
    const page = rotation === undefined ? output : memory.own(new cv.Mat())
    if (rotation !== undefined) cv.rotate(output, page, rotation)
    const canvas = new OffscreenCanvas(page.cols, page.rows)
    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) throw Error('Canvas processing is unavailable.')
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(page.data), page.cols, page.rows),
        0,
        0,
      )
      const blob = await canvasBlob(canvas, job.mime, 0.96)
      return { blob, width: page.cols, height: page.rows }
    } finally {
      canvas.width = canvas.height = 1
    }
  } finally {
    memory.release()
  }
}

export async function processScan(
  cv: CV,
  job: ScanJob,
): Promise<ScanDetection | ScanRender> {
  if (job.type === 'detect') {
    const photo = await readPhoto(job.file, 950, 950 ** 2)
    return { corners: detectCorners(cv, photo) }
  }
  const photo = await readPhoto(
    job.file,
    job.preview ? 1350 : 4000,
    job.preview ? 1_800_000 : 8_000_000,
  )
  return renderScan(cv, photo, job)
}
