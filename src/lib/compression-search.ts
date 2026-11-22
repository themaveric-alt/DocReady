/** Return the highest tested quality under a byte ceiling. Encoders may be
 * non-monotonic, so only an actually measured candidate can be returned. */
export async function searchQuality<T extends { size: number }>(
  encode: (quality: number) => Promise<T>,
  target: number,
  maximum = 0.98,
) {
  if (!Number.isFinite(target) || target < 1) throw Error('Target must be at least one byte.')
  const top = await encode(maximum)
  if (top.size <= target) return { value: top, quality: maximum, met: true }
  let low = Math.min(0.05, maximum), high = maximum
  let value = await encode(low), quality = low
  if (value.size > target) return { value: value.size < top.size ? value : top, quality, met: false }
  for (let pass = 0; pass < 8; pass++) {
    const mid = (low + high) / 2
    const candidate = await encode(mid)
    if (candidate.size <= target) {
      value = candidate
      quality = low = mid
    } else high = mid
  }
  return { value, quality, met: true }
}
