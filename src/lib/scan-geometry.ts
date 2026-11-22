import type { Point } from './perspective'

export type ScanCorners = [Point, Point, Point, Point]
export const fullScanFrame: ScanCorners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

export function orderScanCorners(points: ScanCorners): ScanCorners {
  const x = points.reduce((sum, point) => sum + point.x, 0) / 4
  const y = points.reduce((sum, point) => sum + point.y, 0) / 4
  const ordered = [...points].sort(
    (a, b) => Math.atan2(a.y - y, a.x - x) - Math.atan2(b.y - y, b.x - x),
  )
  const first = ordered.reduce(
    (best, point, index) =>
      point.x + point.y < ordered[best].x + ordered[best].y ? index : best,
    0,
  )
  return [
    ordered[first],
    ordered[(first + 1) % 4],
    ordered[(first + 2) % 4],
    ordered[(first + 3) % 4],
  ]
}

export function scanGeometry(
  corners: ScanCorners,
  width: number,
  height: number,
) {
  if (
    corners.some(
      ({ x, y }) => !Number.isFinite(x + y) || x < 0 || y < 0 || x > 1 || y > 1,
    )
  )
    throw Error('Move all four corners inside the photo.')
  const points = corners.map(({ x, y }) => ({
    x: x * (width - 1),
    y: y * (height - 1),
  }))
  for (const [i, a] of points.entries()) {
    const b = points[(i + 1) % 4]
    const c = points[(i + 2) % 4]
    const turn = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (turn <= 1)
      throw Error('Arrange the corners clockwise, starting at the top left.')
  }
  const [tl, tr, br, bl] = points
  const length = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
  const w = Math.round(1 + Math.max(length(tl, tr), length(bl, br)))
  const h = Math.round(1 + Math.max(length(tl, bl), length(tr, br)))
  if (w < 3 || h < 3) throw Error('Move the handles farther apart.')
  return { points, width: w, height: h }
}

export function scanDimensions(
  width: number,
  height: number,
  maxSide: number,
  maxPixels: number,
) {
  const scale = Math.min(
    1,
    maxSide / Math.max(width, height),
    Math.sqrt(maxPixels / (width * height)),
  )
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}
