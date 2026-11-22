export type OCRFilter = 'adaptive' | 'otsu' | 'contrast'
export function bicubicGray(source: Uint8ClampedArray, sw: number, sh: number, width: number, height: number) {
  const gray = new Uint8Array(sw * sh)
  for (let i = 0; i < gray.length; i++) gray[i] = (54 * source[i * 4] + 183 * source[i * 4 + 1] + 19 * source[i * 4 + 2]) >> 8
  const output = new Uint8ClampedArray(width * height * 4)
  const weight = (value: number) => {
    const x = Math.abs(value)
    return x <= 1 ? 1.5 * x ** 3 - 2.5 * x ** 2 + 1 : x < 2 ? -.5 * x ** 3 + 2.5 * x ** 2 - 4 * x + 2 : 0
  }
  for (let y = 0; y < height; y++) {
    const sy = (y + .5) * sh / height - .5, iy = Math.floor(sy)
    for (let x = 0; x < width; x++) {
      const sx = (x + .5) * sw / width - .5, ix = Math.floor(sx)
      let value = 0
      for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
        const row = Math.max(0, Math.min(sh - 1, iy + dy))
        const col = Math.max(0, Math.min(sw - 1, ix + dx))
        value += gray[row * sw + col] * weight(sy - iy - dy) * weight(sx - ix - dx)
      }
      const p = (y * width + x) * 4
      output[p] = output[p + 1] = output[p + 2] = value
      output[p + 3] = 255
    }
  }
  return output
}
export function otsuThreshold(hist: Uint32Array, count: number) {
  let total = 0
  for (let i = 0; i < 256; i++) total += i * hist[i]
  let background = 0, sum = 0, best = -1, threshold = 127
  for (let i = 0; i < 256; i++) {
    background += hist[i]
    if (!background) continue
    const foreground = count - background
    if (!foreground) break
    sum += i * hist[i]
    const delta = sum / background - (total - sum) / foreground
    const score = background * foreground * delta * delta
    if (score > best) { best = score; threshold = i }
  }
  return threshold
}

/** Contrast stretch with optional local mean threshold. All loops run inside
 * the preparation worker; the integral image makes adaptive threshold O(n). */
export function enhanceOCR(data: Uint8ClampedArray, width: number, height: number, filter: OCRFilter) {
  const hist = new Uint32Array(256)
  const gray = new Uint8Array(width * height)
  for (let p = 0; p < gray.length; p++) {
    const i = p * 4
    gray[p] = (54 * data[i] + 183 * data[i + 1] + 19 * data[i + 2]) >> 8
    hist[gray[p]]++
  }
  let low = 0, high = 255, accumulated = 0
  while (low < 255 && accumulated + hist[low] < gray.length * .01) accumulated += hist[low++]
  accumulated = 0
  while (high > 0 && accumulated + hist[high] < gray.length * .005) accumulated += hist[high--]
  const scale = high - low >= 12 ? 255 / (high - low) : 1
  hist.fill(0)
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.max(0, Math.min(255, (gray[i] - (scale === 1 ? 0 : low)) * scale))
    hist[gray[i]]++
  }
  const threshold = otsuThreshold(hist, gray.length)
  const stride = width + 1
  const integral = filter === 'adaptive' ? new Float64Array(stride * (height + 1)) : undefined
  if (integral) for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x]
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row
    }
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x
    let value = gray[p]
    if (filter === 'otsu') value = value <= threshold ? 0 : 255
    else if (integral) {
      const x0 = Math.max(0, x - 20), x1 = Math.min(width, x + 21)
      const y0 = Math.max(0, y - 20), y1 = Math.min(height, y + 21)
      const mean = (integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0))
      value = value < mean - 10 ? 0 : 255
    }
    data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = value
    data[p * 4 + 3] = 255
  }
}
