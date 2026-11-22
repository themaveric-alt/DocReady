import type { Point } from '../../lib/perspective'

export type Quad = [Point, Point, Point, Point]
export const fullQuad: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y)
export function quadArea(points: Point[]) {
  return (
    Math.abs(
      points.reduce((sum, a, i) => {
        const b = points[(i + 1) % points.length]
        return sum + a.x * b.y - a.y * b.x
      }, 0),
    ) / 2
  )
}
export function validQuad(q: Quad) {
  return (
    quadArea(q) >= 0.001 &&
    q.every((a, i) => {
      const b = q[(i + 1) % 4],
        c = q[(i + 2) % 4]
      return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 0.00001
    })
  )
}
export function bounds(q: Quad) {
  return {
    left: Math.min(...q.map((p) => p.x)),
    right: Math.max(...q.map((p) => p.x)),
    top: Math.min(...q.map((p) => p.y)),
    bottom: Math.max(...q.map((p) => p.y)),
  }
}
export function quadSize(
  q: Quad,
  width: number,
  height: number,
  rotation = 0,
) {
  const [a, b, c, d] = q.map((p) => ({ x: p.x * width, y: p.y * height }))
  const w = Math.round(Math.max(distance(a, b), distance(d, c)))
  const h = Math.round(Math.max(distance(a, d), distance(b, c)))
  return rotation % 180 ? { width: h, height: w } : { width: w, height: h }
}
export function containsPoint(q: Quad, p: Point) {
  return q.every((a, i) => {
    const b = q[(i + 1) % 4]
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -0.0001
  })
}
export function groupOverlap(a: Quad, b: Quad) {
  const A = bounds(a),
    B = bounds(b)
  const shared =
    Math.max(0, Math.min(A.right, B.right) - Math.max(A.left, B.left)) *
    Math.max(0, Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top))
  return (
    shared /
    Math.min(
      (A.right - A.left) * (A.bottom - A.top),
      (B.right - B.left) * (B.bottom - B.top),
    )
  )
}

export function boxQuad(
  left: number,
  top: number,
  right: number,
  bottom: number,
): Quad {
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ]
}

export function paperLike(width: number, height: number) {
  return Math.min(width, height) >= 355 && Math.max(width, height) >= 500
}

export function compactPDFQuad(corners: Quad, width: number, height: number) {
  const box = bounds(corners)
  const w = (box.right - box.left) * width
  const h = (box.bottom - box.top) * height
  return (
    quadArea(corners) < 0.35 &&
    Math.max(w, h) >= 75 &&
    Math.max(w, h) <= 390 &&
    Math.min(w, h) <= 255 &&
    w < width * 0.86 &&
    h < height * 0.76
  )
}

type Viewport = {
  width: number
  height: number
  convertToPdfPoint(x: number, y: number): number[]
  convertToViewportPoint(x: number, y: number): number[]
}

/** Map the same normalized preview corners through native PDF coordinates into the export viewport. */
export function mapPDFCrop(
  corners: Quad,
  preview: Viewport,
  output: Viewport,
) {
  const native = corners.map(({ x, y }) =>
    preview.convertToPdfPoint(x * preview.width, y * preview.height),
  )
  const projected = native.map(([x, y]) => {
    const [px, py] = output.convertToViewportPoint(x, y)
    return { x: px, y: py }
  }) as Quad
  return { native, projected, region: bounds(projected) }
}
