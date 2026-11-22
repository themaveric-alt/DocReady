const protectedText =
  /(?:https?:\/\/|www\.)[^\s<>]+[\p{L}\p{N}/#%=]|[\p{L}\p{N}._+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|(?:[A-Za-z]:\\|\.{0,2}\/)[^\s<>]+|\b[A-Z][A-Z0-9-]*[-_/]\d[\w/-]*\b|\b(?=[A-Za-z]*\d)[A-Za-z]{1,8}\d+[A-Za-z0-9-]*\b|[+−-]?\p{Nd}+(?:[.,:/-]\p{Nd}+)*(?:[%°])?|\x60+[^\x60]+\x60+/gu

export function parseGlossary(value: string) {
  const entries: [string, string][] = []
  for (const line of value.trim().split('\n')) {
    if (!line.trim()) continue
    const at = line.indexOf('=')
    if (at < 1 || !line.slice(at + 1).trim())
      throw Error(
        'Use one glossary entry per line, like DocReadyApp = DocReadyApp.',
      )
    entries.push([line.slice(0, at).trim(), line.slice(at + 1).trim()])
  }
  if (entries.length > 50) throw Error('Use up to 50 glossary entries.')
  return entries.sort((a, b) => b[0].length - a[0].length)
}

export function isTechnical(text: string) {
  const trimmed = text.trim()
  return /^(?:```|(?:const|let|return|def|import|SELECT)\s|[\p{L}\p{N}()+−^/*= ._-]+\s*=\s*[\p{L}\p{N}()+−^/* ._-]+$)/u.test(
    trimmed,
  )
}

function sentences(value: string, locale: string) {
  const sentence = new Intl.Segmenter(locale, { granularity: 'sentence' })
  const grapheme = new Intl.Segmenter(locale, { granularity: 'grapheme' })
  const parts: string[] = []
  let chunk = ''
  for (const { segment } of sentence.segment(value)) {
    if (chunk && chunk.length + segment.length > 380) {
      parts.push(chunk)
      chunk = ''
    }
    let rest = segment
    while (rest.length > 380) {
      const space = rest.lastIndexOf(' ', 365)
      const fallback =
        rest.charCodeAt(379) >= 0xd800 && rest.charCodeAt(379) <= 0xdbff
          ? 379
          : 380
      const index =
        space > 20
          ? space
          : grapheme.segment(rest).containing(379)?.index || fallback
      parts.push(rest.slice(0, index))
      rest = rest.slice(index)
    }
    chunk += rest
  }
  if (chunk) parts.push(chunk)
  return parts
}

export function normalizeEnglishHeading(text: string) {
  // Scanned titles and labels are often all caps. Keep acronyms and avoid recasing prose.
  if (/[a-z]/.test(text) || (text.match(/\b[A-Z]{5,}\b/g)?.length ?? 0) < 2)
    return text
  return text.replace(
    /\b[A-Z]{5,}\b/g,
    (word, offset: number) =>
      (offset === 0 ? word[0] : word[0].toLowerCase()) +
      word.slice(1).toLowerCase(),
  )
}

export async function translateParagraph(
  source: string,
  locale: string,
  glossary: [string, string][],
  infer: (text: string) => Promise<string>,
) {
  if (isTechnical(source) || !/[\p{L}]/u.test(source)) return source
  const substitutions = new Map(glossary)
  const escaped = glossary.map(([term]) =>
    term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  )
  const pattern = new RegExp(
    [...escaped, protectedText.source].join('|'),
    'gu',
  )
  const result: string[] = []
  let start = 0
  async function translateFree(text: string) {
    for (const fragment of sentences(text, locale)) {
      if (!/\p{L}/u.test(fragment)) {
        result.push(fragment)
        continue
      }
      const left = fragment.match(/^\s*/u)?.[0] ?? ''
      const right = fragment.match(/\s*$/u)?.[0] ?? ''
      const clean = fragment.trim()
      const translated = (
        await infer(locale === 'en' ? normalizeEnglishHeading(clean) : clean)
      ).trim()
      if (!translated || /\uFFFD|[□�]{2,}/u.test(translated))
        throw Error(
          'The local translator returned unreadable text. Check the extracted text and source language, then translate the remaining blocks again.',
        )
      result.push(left + translated + right)
    }
  }
  for (const match of source.matchAll(pattern)) {
    await translateFree(source.slice(start, match.index))
    result.push(substitutions.get(match[0]) ?? match[0])
    start = match.index + match[0].length
  }
  await translateFree(source.slice(start))
  return result.join('').trim()
}
