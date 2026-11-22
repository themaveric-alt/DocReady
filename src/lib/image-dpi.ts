export async function withDPI(blob: Blob, dpi: number) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (
    blob.type === 'image/jpeg' &&
    bytes[2] === 255 &&
    bytes[3] === 224 &&
    String.fromCharCode(...bytes.slice(6, 11)) === 'JFIF\0'
  ) {
    const view = new DataView(bytes.buffer)
    view.setUint8(13, 1)
    view.setUint16(14, dpi)
    view.setUint16(16, dpi)
    return new Blob([bytes], { type: blob.type })
  }
  if (blob.type !== 'image/png') return blob
  const chunk = new Uint8Array(21),
    view = new DataView(chunk.buffer)
  const ppm = Math.round(dpi / 0.0254)
  view.setUint32(0, 9)
  chunk.set([112, 72, 89, 115], 4)
  view.setUint32(8, ppm)
  view.setUint32(12, ppm)
  chunk[16] = 1
  let crc = 0xffffffff
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  view.setUint32(17, ~crc)
  const segments: Uint8Array<ArrayBuffer>[] = [bytes.slice(0, 33), chunk]
  for (let at = 33; at + 12 <= bytes.length;) {
    const size = new DataView(bytes.buffer, at).getUint32(0)
    const end = at + size + 12
    if (end > bytes.length) throw Error('Invalid browser PNG export.')
    if (String.fromCharCode(...bytes.subarray(at + 4, at + 8)) !== 'pHYs')
      segments.push(bytes.slice(at, end))
    at = end
  }
  return new Blob(segments, { type: blob.type })
}
