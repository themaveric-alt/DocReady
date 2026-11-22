import { expect, test } from 'vitest'
import { bicubicGray, enhanceOCR, otsuThreshold } from '../src/lib/ocr-pixels'

test('Otsu separates two measured intensity populations', () => {
  const hist = new Uint32Array(256)
  hist[30] = 40; hist[225] = 100
  const threshold = otsuThreshold(hist, 140)
  expect(threshold).toBeGreaterThanOrEqual(30)
  expect(threshold).toBeLessThan(225)
})
test('adaptive cleanup preserves dark strokes across uneven paper lighting', () => {
  const width = 100, height = 80
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4
    const value = x >= 48 && x < 51 ? 25 : 130 + x
    pixels[p] = pixels[p + 1] = pixels[p + 2] = value; pixels[p + 3] = 255
  }
  enhanceOCR(pixels, width, height, 'adaptive')
  expect(pixels[(40 * width + 49) * 4]).toBe(0)
  expect(pixels[(40 * width + 20) * 4]).toBe(255)
  expect(pixels[(40 * width + 80) * 4]).toBe(255)
})
test('bicubic upscaling doubles dimensions and preserves uniform gray', () => {
  const input = new Uint8ClampedArray(6 * 4 * 4).fill(170)
  const output = bicubicGray(input, 6, 4, 12, 8)
  expect(output.length).toBe(12 * 8 * 4)
  for (let i = 0; i < output.length; i += 4) {
    expect(output[i]).toBe(170)
    expect(output[i + 3]).toBe(255)
  }
})
test('grayscale cleanup retains intermediate intensities for faint ink', () => {
  const input = new Uint8ClampedArray([10, 10, 10, 255, 80, 80, 80, 255, 120, 120, 120, 255, 240, 240, 240, 255])
  enhanceOCR(input, 4, 1, 'contrast')
  expect(input[4]).toBeGreaterThan(0)
  expect(input[4]).toBeLessThan(255)
  expect(input[0]).toBe(0)
  expect(input[12]).toBe(255)
})
