import { expect, test } from 'vitest'
import { searchQuality } from '../src/lib/compression-search'

test('quality search measures an output just below the target', async () => {
  const result = await searchQuality(async (quality) => ({ size: Math.ceil(1000 + quality * 10000) }), 5000)
  expect(result.met).toBe(true)
  expect(result.value.size).toBeLessThanOrEqual(5000)
  expect(result.value.size).toBeGreaterThan(4950)
})
test('quality endpoints are checked and impossible ceilings are reported honestly', async () => {
  const qualities: number[] = []
  const result = await searchQuality(async (quality) => { qualities.push(quality); return { size: 2000 } }, 1000)
  expect(qualities).toEqual([0.98, 0.05])
  expect(result.met).toBe(false)
  expect(result.value.size).toBe(2000)
})
test('a small maximum-quality output is kept without unnecessary degradation', async () => {
  const result = await searchQuality(async () => ({ size: 1000 }), 5000)
  expect(result).toMatchObject({ quality: 0.98, met: true })
  await expect(searchQuality(async () => ({ size: 1000 }), NaN)).rejects.toThrow('Target')
})
