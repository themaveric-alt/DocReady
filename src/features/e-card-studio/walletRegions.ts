import { bounds, boxQuad, compactPDFQuad, distance, validQuad, type Quad } from './geometry'
import type { PageAnalysis } from './documentRegions'

export const BOTTOM_CARD_START = .58

/** Rotate normalized preview coordinates clockwise; retains clockwise ordering. */
export function turnQuad(quad: Quad, degrees: number): Quad {
  const turns = ((degrees / 90) % 4 + 4) % 4
  const points = quad.map(p => turns === 1 ? { x: 1 - p.y, y: p.x }
    : turns === 2 ? { x: 1 - p.x, y: 1 - p.y }
      : turns === 3 ? { x: p.y, y: 1 - p.x } : { ...p })
  return Array.from({ length: 4 }, (_, i) => points[(i + 4 - turns) % 4]) as Quad
}

export function canonicalPage(page: PageAnalysis): PageAnalysis {
  const rotated = Math.abs(page.rotation ?? 0) % 180 === 90
  return { ...page, rotation: 0,
    width: rotated ? page.height : page.width,
    height: rotated ? page.width : page.height,
    anchors: page.anchors.map(a => bounds(turnQuad(boxQuad(a.left, a.top, a.right, a.bottom), -(page.rotation ?? 0)))),
  }
}

export function bottomWalletPage(page: PageAnalysis) {
  return page.lowerSection && page.height > page.width * 1.12
}

/** Ratio is width/height, NOT long/short: portrait receipts must fail. */
export function walletQuad(corners: Quad, page: PageAnalysis) {
  const [a,b,c,d] = corners.map(p => ({ x: p.x * page.width, y: p.y * page.height }))
  const width = (distance(a,b) + distance(d,c)) / 2
  const height = (distance(a,d) + distance(b,c)) / 2
  const ratio = width / height
  const box = bounds(corners)
  return validQuad(corners) && compactPDFQuad(corners, page.width, page.height)
    // Source designs/content envelopes vary. Do not manufacture ID-1 geometry
    // by trimming or expanding source pixels; the print frame is fitted later.
    && ratio >= 1.35 && ratio <= 1.95
    && (page.height <= page.width * 1.12 || width <= page.width * .53)
    && box.left >= .015 && box.right <= .985 && box.bottom <= .995
    && (!bottomWalletPage(page) || box.top >= BOTTOM_CARD_START - .002)
}

export function sourceWalletQuad(corners: Quad, page: PageAnalysis) {
  // Search prioritizes the bottom; validation must also accept a genuine compact
  // card found elsewhere by the fallback, without admitting an entire letter.
  return walletQuad(turnQuad(corners, -(page.rotation ?? 0)), {...canonicalPage(page),lowerSection:false})
}

/** Manual suggestion only. No authority-specific coordinates are calibrated.
 * It cannot become detected/ready until the user reviews the actual boundary. */
export function manualWalletSeed(width: number, height: number, side = 'front', rotation = 0): Quad {
  const swapped = Math.abs(rotation) % 180 === 90
  const w = swapped ? height : width, h = swapped ? width : height
  const cardWidth = Math.min(.40, (85.6 * 72 / 25.4) / w)
  const cardHeight = cardWidth * w / (1.586 * h)
  const left = side === 'back' ? .54 : .06
  const top = Math.max(BOTTOM_CARD_START, .93 - cardHeight)
  return turnQuad(boxQuad(left, top, left + cardWidth, Math.min(.99, top + cardHeight)), rotation)
}
