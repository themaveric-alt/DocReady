import { expect, test } from 'vitest'
import { cardFilename, govtCards, layoutPrior } from '../src/features/e-card-studio/cardProfiles'
import { boxQuad } from '../src/features/e-card-studio/geometry'
import { mmToPoints, planSheets, defaultPrint } from '../src/features/e-card-studio/printLayout'

test('eight distinct presets supply safe dated card-specific filenames', () => {
  expect(govtCards).toHaveLength(8)
  expect(new Set(govtCards.map(card => card.id)).size).toBe(8)
  expect(cardFilename('aadhaar', new Date(2026, 10, 22))).toBe('Aadhaar_Card_2026-11-22.pdf')
  expect(cardFilename('pan', new Date(2026, 10, 22))).toBe('PAN_Card_2026-11-22.pdf')
  expect(cardFilename('apaar', new Date(2026, 10, 22))).toBe('APAAR_ID_Card_2026-11-22.pdf')
})
test('card priors only rank candidates containing contextual evidence', () => {
  const source = { hints: [{ x: .3, y: .8, text: 'Synthetic APAAR student record', angle: 0, box: { left: .2, top: .76, right: .4, bottom: .82 } }] }
  expect(layoutPrior('apaar', source, boxQuad(.1, .7, .5, .9))).toBe(.08)
  expect(layoutPrior('pan', source, boxQuad(.1, .7, .5, .9))).toBe(0)
  expect(layoutPrior('apaar', source, boxQuad(.6, .7, .9, .9))).toBe(0)
})
test('requested rounded ID-1 frames fit on A4 without overlap', () => {
  const sheets = planSheets([{ id: 'front', side: 'front', width: 85.6, height: 54 }, { id: 'back', side: 'back', width: 85.6, height: 54 }], { ...defaultPrint, marks: 'border' })
  expect(sheets).toHaveLength(1)
  expect(sheets[0].width).toBe(210)
  expect(sheets[0].height).toBe(297)
  expect(sheets[0].cards[1].x).toBeGreaterThan(sheets[0].cards[0].x + 85.6)
  expect(mmToPoints(85.6)).toBeCloseTo(242.645669, 5)
  expect(mmToPoints(54)).toBeCloseTo(153.070866, 5)
})
