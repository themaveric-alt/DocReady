import { describe, expect, test } from 'vitest'
import {
  bounds,
  boxQuad,
  compactPDFQuad,
  mapPDFCrop,
  containsPoint,
  fullQuad,
  quadSize,
  validQuad,
  type Quad,
} from '../src/features/e-card-studio/geometry'
import {
  contain,
  defaultPrint,
  effectiveDpi,
  ID1,
  marksFor,
  mmToPixels,
  mmToPoints,
  planSheets,
  rulerFor,
  type PrintCard,
} from '../src/features/e-card-studio/printLayout'

const pair: PrintCard[] = [
  { id: 'f', side: 'front', ...ID1 },
  { id: 'b', side: 'back', ...ID1 },
]

describe('card geometry', () => {
  test('perspective corners are clockwise and disallow a crossing', () => {
    const quad: Quad = [
      { x: 0.1, y: 0.15 },
      { x: 0.87, y: 0.08 },
      { x: 0.81, y: 0.88 },
      { x: 0.15, y: 0.93 },
    ]
    expect(validQuad(quad)).toBe(true)
    expect(validQuad([quad[0], quad[2], quad[1], quad[3]])).toBe(false)
    expect(containsPoint(quad, { x: 0.5, y: 0.5 })).toBe(true)
    expect(containsPoint(quad, { x: 0.01, y: 0.01 })).toBe(false)
    expect(bounds(quad)).toEqual({
      left: 0.1,
      right: 0.87,
      top: 0.08,
      bottom: 0.93,
    })
    expect(quadSize(fullQuad, 1000, 630, 90)).toEqual({
      width: 630,
      height: 1000,
    })
  })
})
describe('card print layout', () => {
  test('an A4 sheet places both ID-1 cards using exact millimeters', () => {
    const [sheet] = planSheets([...pair].reverse(), defaultPrint)
    expect(sheet).toMatchObject({ width: 210, height: 297 })
    expect(sheet.cards.map((p) => p.id)).toEqual(['f', 'b'])
    expect(sheet.cards[0].width).toBe(85.6)
    expect(sheet.cards[0].height).toBe(53.98)
    expect(sheet.cards[1].x - sheet.cards[0].x).toBeCloseTo(93.6)
    expect(mmToPoints(25.4)).toBe(72)
    expect(mmToPixels(210, 600)).toBe(4961)
  })
  test('vertical and single layouts keep the correct ordering and card count', () => {
    const [stack] = planSheets(pair, { ...defaultPrint, mode: 'vertical' })
    expect(stack.cards[1].y - stack.cards[0].y).toBeCloseTo(61.98)
    expect(
      planSheets(pair, {
        ...defaultPrint,
        mode: 'single',
        single: 'b',
      })[0].cards.map((c) => c.id),
    ).toEqual(['b'])
  })
  test('grid paginates without overlap and custom placement rejects collisions', () => {
    const cards = Array.from({ length: 18 }, (_, i) => ({
      id: String(i),
      side: 'extra' as const,
      ...ID1,
    }))
    const sheets = planSheets(cards, { ...defaultPrint, mode: 'grid' })
    expect(sheets.length).toBeGreaterThan(1)
    expect(sheets.flatMap((s) => s.cards)).toHaveLength(18)
    for (const sheet of sheets)
      for (const [i, card] of sheet.cards.entries()) {
        expect(card.x).toBeGreaterThanOrEqual(10)
        expect(card.x + card.width).toBeLessThanOrEqual(200)
        expect(card.y + card.height).toBeLessThanOrEqual(287)
        expect(
          sheet.cards
            .slice(i + 1)
            .every(
              (b) =>
                card.x + card.width <= b.x ||
                b.x + b.width <= card.x ||
                card.y + card.height <= b.y ||
                b.y + b.height <= card.y,
            ),
        ).toBe(true)
      }
    expect(() =>
      planSheets(pair, {
        ...defaultPrint,
        mode: 'custom',
        positions: { f: { x: 30, y: 30 }, b: { x: 40, y: 30 } },
      }),
    ).toThrow(/overlap/)
  })
  test('duplex mirrors about the selected flip edge and requires matching faces', () => {
    const settings = {
      ...defaultPrint,
      mode: 'duplex',
      horizontal: 'left',
      vertical: 'top',
      ruler: true,
    } as const
    const [front, back] = planSheets(pair, settings)
    expect(
      back.cards[0].x + front.cards[0].x + front.cards[0].width,
    ).toBeCloseTo(front.width)
    expect(back.cards[0].y).toBe(front.cards[0].y)
    const [otherFront, otherBack] = planSheets(pair, {
      ...settings,
      flip: 'short',
    })
    expect(
      otherBack.cards[0].y +
        otherFront.cards[0].y +
        otherFront.cards[0].height,
    ).toBeCloseTo(otherFront.height)
    expect(() => planSheets([pair[0]], settings)).toThrow(
      /Front and one Back/,
    )
    expect(() =>
      planSheets([pair[0], { ...pair[1], width: 80 }], settings),
    ).toThrow(/matching/)
  })
  test('contain respects aspect ratio and rulers measure 50 mm', () => {
    expect(contain({ width: 100, height: 100 }, ID1)).toMatchObject({
      width: 53.98,
      height: 53.98,
      x: expect.closeTo(15.81),
    })
    expect(effectiveDpi({ width: 1200, height: 756 }, ID1)).toBe(356)
    const sheet = planSheets(pair, { ...defaultPrint, ruler: true })[0]
    const [rule] = rulerFor(sheet)
    expect(rule.x2 - rule.x1).toBe(50)
    expect(marksFor(sheet, 'none')).toEqual([])
    expect(marksFor(sheet, 'corners')).toHaveLength(16)
  })
})

test('maps a rotated viewport with MediaBox and CropBox offsets into native PDF points', async () => {
  const { PDFDocument, degrees } = await import('pdf-lib')
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await PDFDocument.create()
  const page = doc.addPage([650, 900])
  page.setMediaBox(-30, -50, 650, 900)
  page.setCropBox(20, 30, 520, 760)
  page.setRotation(degrees(90))
  const task = getDocument({ data: await doc.save() })
  try {
    const loaded = await (await task.promise).getPage(1)
    const view = loaded.getViewport({ scale: 1.3 })
    expect([view.width, view.height]).toEqual([988, 676])
    const full = mapPDFCrop(fullQuad, view, loaded.getViewport({ scale: 2 }))
    expect(full.native).toEqual([
      [20, 30],
      [20, 790],
      [540, 790],
      [540, 30],
    ])
    const crop = mapPDFCrop(
      boxQuad(0.2, 0.3, 0.55, 0.62),
      view,
      loaded.getViewport({ scale: 2 }),
    )
    expect(crop.region.left).toBeCloseTo(304)
    expect(crop.region.top).toBeCloseTo(312)
    expect(crop.region.right).toBeCloseTo(836)
    expect(crop.region.bottom).toBeCloseTo(644.8)
    expect(compactPDFQuad(fullQuad, view.width, view.height)).toBe(false)
    expect(
      compactPDFQuad(boxQuad(0.07, 0.72, 0.47, 0.9), 595.28, 841.89),
    ).toBe(true)
  } finally {
    await task.destroy()
  }
})

test('PVC ignores sheet settings and places the front and back on exact ID-1 pages', () => {
  const [front, back] = planSheets([...pair].reverse(), {
    ...defaultPrint,
    mode: 'pvc',
    paper: 'Letter',
    orientation: 'portrait',
    marginX: 99,
    ruler: true,
  })
  expect(front).toEqual({ ...ID1, cards: [{ id: 'f', ...ID1, x: 0, y: 0 }] })
  expect(back).toEqual({ ...ID1, cards: [{ id: 'b', ...ID1, x: 0, y: 0 }] })
  expect(
    planSheets([pair[0]], { ...defaultPrint, mode: 'pvc' }),
  ).toHaveLength(1)
})
