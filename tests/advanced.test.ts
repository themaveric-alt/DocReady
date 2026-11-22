import { expect, test } from 'vitest'
import {
  outfitPaths,
  groups,
  outfits,
} from '../src/features/advanced/photo/outfits'
import {
  cropRatio,
  initialEdits,
  photoHistory,
} from '../src/features/advanced/photo/photoState'
import {
  defaultPhotoSheet,
  photoPlan,
} from '../src/features/advanced/printPhotos'
import { identifyRules } from '../src/features/advanced/documentInput'

test('40 distinct authored templates use the same geometry for compositing and thumbnails', () => {
  expect(groups.map((g) => g.list.length)).toEqual([10, 10, 10, 10])
  expect(
    new Set(outfits.map((o) => JSON.stringify(outfitPaths(o)))).size,
  ).toBe(40)
  expect(new Set(outfits.map((o) => o.id)).size).toBe(40)
  for (const outfit of outfits)
    expect(outfitPaths(outfit).length).toBeGreaterThan(2)
})
test('a change after undo drops redo without altering earlier photo edit state', () => {
  const start = { past: [], current: initialEdits, future: [] }
  const one = photoHistory(start, { ...initialEdits, rotation: 90 })
  const two = photoHistory(one, { ...one.current, zoom: 1.2 })
  const prior = photoHistory(two, 'undo')
  expect(prior.current.zoom).toBe(1)
  expect(photoHistory(prior, 'redo').current.zoom).toBe(1.2)
  expect(
    photoHistory(prior, { ...prior.current, rotation: 180 }).future,
  ).toEqual([])
  expect(cropRatio(500, 400, 0.8)).toMatchObject({
    width: 0.64,
    height: 1,
    x: 0.18,
  })
})
test('exact print settings create no overlapping copies or mixed requirements', () => {
  const plan = photoPlan(2, { ...defaultPhotoSheet, copies: 6 })
  expect(plan.flatMap((s) => s.cards)).toHaveLength(12)
  expect(plan[0].cards[0]).toMatchObject({ width: 35, height: 45 })
  expect(() => photoPlan(5, { ...defaultPhotoSheet, copies: 27 })).toThrow(
    /120/,
  )
  const suggestions = identifyRules(
    'Photograph: JPEG, 240 x 160 px, max 200 KB.\nSignature: PNG, 95 x 35 px, 20-50 KB.',
  )
  expect(suggestions.map((e) => e.rule)).toMatchObject([
    { width: '240', height: '160', max: '200', types: ['image/jpeg'] },
    { width: '95', height: '35', min: '20', max: '50', types: ['image/png'] },
  ])
})
