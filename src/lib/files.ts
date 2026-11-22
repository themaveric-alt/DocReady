export const PDF = 'application/pdf'
export const images = ['image/jpeg', 'image/png', 'image/webp'] as const
export type ImageMime = (typeof images)[number]
export const imageAccept = images.join(',')
export type Output = { name: string; blob: Blob; detail?: string; vaultFolder?: string }
export function safeName(value: string) {
  const clean = value
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '_')
    .trim()
    .replace(/^\.+|[ .]+$/g, '')
  const usable = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(clean)
    ? '_' + clean
    : clean || 'file'
  if (usable.length <= 126) return usable
  const suffix = usable.match(/\.[a-z0-9]{1,10}$/i)?.[0] ?? ''
  return usable.slice(0, 126 - suffix.length) + suffix
}
export const stem = (value: string) => safeName(value).replace(/\.[^.]+$/, '')
export const extension = (mime: string) =>
  mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]
export const sizeLabel = (n: number) =>
  n < 1024
    ? n + ' B'
    : n < 1048576
      ? (n / 1024).toFixed(1) + ' KB'
      : (n / 1048576).toFixed(2) + ' MB'
export const pageCountLabel = (count: number) =>
  count + (count === 1 ? ' page' : ' pages')
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : String(e)
export async function fileKind(file: Blob) {
  const h = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
  const txt = (a: number, b: number) => String.fromCharCode(...h.subarray(a, b))
  if (h[0] === 255 && h[1] === 216 && h[2] === 255) return 'image/jpeg'
  if (h[0] === 137 && txt(1, 8) === 'PNG\r\n\x1a\n') return 'image/png'
  if (txt(0, 4) === 'RIFF' && txt(8, 12) === 'WEBP') return 'image/webp'
  if (/%PDF-\d\.\d/.test(txt(0, h.length))) return PDF
  return ''
}
export async function validateFiles(files: File[], accepted: string[]) {
  if (files.length > 40) throw Error('Choose up to 40 files at a time.')
  if (files.reduce((n, f) => n + f.size, 0) > 180 * 1024 * 1024)
    throw Error('Choose a batch smaller than 180 MB.')
  for (const file of files) {
    if (!file.size) throw Error(file.name + ' is empty.')
    if (file.size > 80 * 1024 * 1024)
      throw Error(file.name + ' exceeds the 80 MB file limit.')
    if (accepted.length && !accepted.includes(await fileKind(file)))
      throw Error(
        file.name +
          ' is not a supported file for this tool. Check the actual file format.',
      )
  }
}
export function saveFile(item: Output) {
  const url = URL.createObjectURL(item.blob)
  const el = document.createElement('a')
  el.href = url
  el.download = safeName(item.name)
  el.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
export async function zipFiles(
  items: Output[],
  name = 'docready-files.zip',
): Promise<Output> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip(),
    used = new Set<string>()
  for (const item of items) {
    const base = safeName(item.name),
      dot = base.lastIndexOf('.')
    let key = base,
      count = 2
    while (used.has(key.toLowerCase())) {
      key =
        dot > 0
          ? base.slice(0, dot) + '-' + count + base.slice(dot)
          : base + '-' + count
      count++
    }
    used.add(key.toLowerCase())
    zip.file(key, await item.blob.arrayBuffer())
  }
  return {
    name,
    blob: await zip.generateAsync({
      type: 'blob',
      compression: 'STORE',
      mimeType: 'application/zip',
    }),
  }
}
export async function sha256(file: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('')
}
export function parsePages(input: string, count: number) {
  if (!input.trim()) return Array.from({ length: count }, (_, i) => i)
  const out = new Set<number>()
  for (const entry of input.split(',')) {
    const match = entry.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!match)
      throw Error('Use page numbers or ranges such as 1, 3–5 (type a hyphen).')
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1])
    if (start < 1 || start > end || end > count)
      throw Error('Every page must be between 1 and ' + count + '.')
    for (let n = start; n <= end; n++) out.add(n - 1)
  }
  return [...out]
}
