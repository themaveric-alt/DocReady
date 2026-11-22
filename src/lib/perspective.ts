export type Point = { x: number; y: number }
export const defaultCorners: Point[] = [
  { x: 0.06, y: 0.06 },
  { x: 0.94, y: 0.06 },
  { x: 0.94, y: 0.94 },
  { x: 0.06, y: 0.94 },
]
export function warpRgba(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  points: Point[],
  maxSide = 2200,
) {
  if (
    points.length !== 4 ||
    points.some((p) => p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1)
  )
    throw Error('Move all four corners inside the image.')
  const p = points.map((x) => ({ x: x.x * (sw - 1), y: x.y * (sh - 1) }))
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
  if (p.some((a, i) => cross(a, p[(i + 1) % 4], p[(i + 2) % 4]) <= 1))
    throw Error(
      'Arrange the corners clockwise: top left, top right, bottom right, bottom left.',
    )
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
  const [a, b, c, d] = p
  const width = Math.max(distance(a, b), distance(d, c)) + 1,
    height = Math.max(distance(a, d), distance(b, c)) + 1
  if (width < 3 || height < 3) throw Error('The selected scan is too small.')
  const scale = Math.min(1, maxSide / Math.max(width, height)),
    w = Math.max(2, Math.round(width * scale)),
    h = Math.max(2, Math.round(height * scale))
  const dx1 = b.x - c.x,
    dx2 = d.x - c.x,
    dx3 = a.x - b.x + c.x - d.x,
    dy1 = b.y - c.y,
    dy2 = d.y - c.y,
    dy3 = a.y - b.y + c.y - d.y
  const det = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / det,
    k = (dx1 * dy3 - dx3 * dy1) / det
  if (!Number.isFinite(g) || !Number.isFinite(k))
    throw Error('Could not straighten those corners. Spread the handles apart.')
  const x1 = b.x - a.x + g * b.x,
    x2 = d.x - a.x + k * d.x,
    y1 = b.y - a.y + g * b.y,
    y2 = d.y - a.y + k * d.y
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1),
        v = y / (h - 1),
        z = g * u + k * v + 1
      const sx = Math.max(0, Math.min(sw - 1, (x1 * u + x2 * v + a.x) / z)),
        sy = Math.max(0, Math.min(sh - 1, (y1 * u + y2 * v + a.y) / z))
      const ix = Math.floor(sx),
        iy = Math.floor(sy),
        fx = sx - ix,
        fy = sy - iy
      const p0 = (iy * sw + ix) * 4,
        p1 = (iy * sw + Math.min(sw - 1, ix + 1)) * 4,
        p2 = (Math.min(sh - 1, iy + 1) * sw + ix) * 4,
        p3 = p2 + p1 - p0
      const dest = (y * w + x) * 4
      for (let j = 0; j < 4; j++)
        data[dest + j] =
          (src[p0 + j] * (1 - fx) + src[p1 + j] * fx) * (1 - fy) +
          (src[p2 + j] * (1 - fx) + src[p3 + j] * fx) * fy
    }
  return { data, width: w, height: h }
}
