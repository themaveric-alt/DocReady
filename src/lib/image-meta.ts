import { fileKind } from './files'
export async function inspectImage(file: Blob) {
  const b = new Uint8Array(await file.slice(0, 4 * 1024 * 1024).arrayBuffer()),
    markers: string[] = []
  const tag = (i: number, count: number) =>
    String.fromCharCode(...b.subarray(i, i + count))
  const view = new DataView(b.buffer)
  const type = await fileKind(file)
  if (type === 'image/png') {
    for (let i = 8; i + 12 <= b.length; ) {
      const size = view.getUint32(i),
        name = tag(i + 4, 4)
      if (
        ['tEXt', 'zTXt', 'iTXt', 'iCCP', 'eXIf', 'pHYs', 'tIME'].includes(name)
      )
        markers.push(name)
      i += size + 12
    }
  }
  if (type === 'image/jpeg') {
    for (let i = 2; i + 4 <= b.length && b[i] === 255; ) {
      const id = b[i + 1],
        size = view.getUint16(i + 2)
      if (id === 0xda || id === 0xd9 || size < 2) break
      if (id === 0xe1)
        markers.push(tag(i + 4, 4) === 'Exif' ? 'EXIF' : 'APP1 / XMP')
      if (id === 0xe2) markers.push('APP2 / ICC')
      if (id === 0xed) markers.push('APP13 / IPTC')
      if (id === 0xfe) markers.push('Comment')
      i += size + 2
    }
  }
  if (type === 'image/webp') {
    for (let i = 12; i + 8 <= b.length; ) {
      const name = tag(i, 4),
        size = view.getUint32(i + 4, true)
      if (['ICCP', 'EXIF', 'XMP '].includes(name)) markers.push(name.trim())
      i += 8 + size + (size % 2)
    }
  }
  return [...new Set(markers)]
}
