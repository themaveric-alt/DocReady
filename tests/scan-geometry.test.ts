import { describe, expect, it } from 'vitest'
import {
  fullScanFrame,
  orderScanCorners,
  scanDimensions,
  scanGeometry,
} from '../src/lib/scan-geometry'

describe('document scan geometry', () => {
  it('orders a tilted sheet clockwise from the top left', () => {
    const tl = { x: 0.12, y: 0.23 }
    const tr = { x: 0.8, y: 0.13 }
    const br = { x: 0.91, y: 0.87 }
    const bl = { x: 0.09, y: 0.8 }
    expect(orderScanCorners([br, tl, bl, tr])).toEqual([tl, tr, br, bl])
  })

  it('uses the exact pixel extent for a full photo and rejects crossed handles', () => {
    expect(scanGeometry(fullScanFrame, 1500, 2000)).toMatchObject({
      width: 1500,
      height: 2000,
      points: [
        { x: 0, y: 0 },
        { x: 1499, y: 0 },
        { x: 1499, y: 1999 },
        { x: 0, y: 1999 },
      ],
    })
    const [a, b, c, d] = fullScanFrame
    expect(() => scanGeometry([a, c, b, d], 1500, 2000)).toThrow(/clockwise/)
    expect(() => scanGeometry([{ x: NaN, y: 0 }, b, c, d], 1500, 2000)).toThrow(
      /inside/,
    )
  })

  it('retains smaller photos and bounds large export buffers', () => {
    expect(scanDimensions(800, 1200, 4000, 8_000_000)).toEqual({
      width: 800,
      height: 1200,
    })
    expect(scanDimensions(6000, 4000, 4000, 8_000_000)).toEqual({
      width: 3464,
      height: 2309,
    })
  })
})
