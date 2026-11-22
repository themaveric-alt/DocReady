import { fileKind, PDF } from '../../lib/files'
import { openLocalOCR, type OCRLanguage } from '../../lib/local-ocr'
import { loadRender, renderBlob } from '../../lib/pdf-render'
import { blankRequirement, type Requirement } from '../../lib/requirements'

export async function localDocumentText(
  file: File,
  signal: AbortSignal,
  report: (s: string) => void,
  lang: OCRLanguage = 'eng',
  maxPages = 6,
) {
  signal.throwIfAborted()
  if (file.size > 36 * 1024 * 1024)
    throw Error('Choose a document under 36 MB.')
  const kind = await fileKind(file)
  if (!kind) throw Error('Choose a valid PDF, PNG, JPEG or WebP.')
  let ocr: Awaited<ReturnType<typeof openLocalOCR>> | undefined
  async function recognize(input: Blob) {
    report('Recognizing text locally')
    ocr ??= await openLocalOCR(lang, signal)
    return (await ocr.recognize(input)).text
  }
  try {
    if (kind !== PDF) return { text: await recognize(file), truncated: false }
    const doc = await loadRender(file, { signal, workerRendering: true })
    try {
      const pages = []
      for (let i = 0; i < Math.min(maxPages, doc.numPages); i++) {
        signal.throwIfAborted()
        report(
          'Reading page ' +
            (i + 1) +
            ' of ' +
            Math.min(maxPages, doc.numPages),
        )
        const page = await doc.getPage(i + 1),
          pageText = await page.getTextContent()
        let text = ''
        for (const item of pageText.items)
          if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ')
        if (text.trim().length < 30) {
          const { width, height } = page.getViewport({ scale: 1 })
          text = await recognize(
            await renderBlob(
              doc,
              i,
              Math.min(2, 1700 / Math.max(width, height)),
            ),
          )
        }
        pages.push(text.trim())
        page.cleanup()
      }
      return { text: pages.join('\n\n'), truncated: doc.numPages > maxPages }
    } finally {
      await doc.dispose()
    }
  } finally {
    await ocr?.close()
  }
}
const labels = [
  {
    name: 'Photograph',
    match:
      /\b(?:passport\s+(?:size\s+)?photo|photo(?:graph)?)\b|फोटो|तस्वीर/iu,
    types: ['image/jpeg', 'image/png'],
  },
  {
    name: 'Signature',
    match: /\bsignature\b|हस्ताक्षर/iu,
    types: ['image/jpeg', 'image/png'],
  },
  {
    name: 'Supporting certificate',
    match: /\b(?:certificate|marksheet|mark sheet)\b|प्रमाणपत्र|अंकसूची/iu,
    types: [PDF, 'image/jpeg', 'image/png'],
  },
  {
    name: 'Identity document',
    match: /\b(?:identity proof|identity document|ID proof)\b|पहचान\s*पत्र/iu,
    types: [PDF, 'image/jpeg', 'image/png'],
  },
  {
    name: 'Resume',
    match: /\b(?:resume|curriculum vitae|cv)\b|बायोडाटा/iu,
    types: [PDF],
  },
]
export type Suggested = {
  rule: Requirement
  evidence: string
  selected: boolean
}
export function identifyRules(text: string): Suggested[] {
  const lines = text
    .replaceAll('\r', '')
    .split(/\n+|(?<=[.;])\s+(?=[A-Z\u0900-\u097F])/u)
    .map((l) => l.trim())
    .filter(Boolean)
  return labels.flatMap(({ name, match, types }) => {
    const index = lines.findIndex((l) => match.test(l))
    if (index < 0) return []
    const line = lines[index]
    const continuation = lines[index + 1]
    const evidence = (
      line +
      (continuation &&
      !labels.some((l) => l.match.test(continuation)) &&
      /\d+\s*(px|pixels?|kb|mb)|\b(jpg|jpeg|png|pdf|webp)\b/i.test(
        continuation,
      )
        ? ' ' + continuation
        : '')
    ).slice(0, 310)
    const own =
      evidence
        .split(/(?=\b(?:signature|photograph|photo|certificate|resume)\b)/i)
        .find((part) => match.test(part)) ?? evidence
    const visible = own.trim().length > 12 ? own : evidence
    const limits = visible.match(/(\d{1,4})\s*[-–]\s*(\d{1,4})\s*(KB|MB)\b/i)
    const max = visible.match(
      /(?:\bmax(?:imum)?\s*[:–-]?|up to|under|not exceed|less than|≤|size\s*:?)\s*(\d+(?:\.\d+)?)\s*(KB|MB)\b/i,
    )
    const min = visible.match(
      /(?:minimum|min\.?|at least|≥)\s*:?\s*(\d+(?:\.\d+)?)\s*(KB|MB)\b/i,
    )
    const px = visible.match(
      /(\d{2,4})\s*(?:px\s*)?[x×]\s*(\d{2,4})\s*(?:pixels?|px)\b/i,
    )
    const accepted = [...visible.matchAll(/\b(pdf|jpe?g|png|webp)\b/gi)]
      .map((m) => m[1].toLowerCase())
      .map((m) =>
        m === 'pdf' ? PDF : 'image/' + (m.startsWith('jp') ? 'jpeg' : m),
      )
    const kb = (n: string, u: string) =>
      String(Math.round(+n * (u.toLowerCase() === 'mb' ? 1024 : 1)))
    return [
      {
        rule: {
          ...blankRequirement(
            name,
            accepted.length ? [...new Set(accepted)] : types,
          ),
          width: px?.[1] ?? '',
          height: px?.[2] ?? '',
          min: limits
            ? kb(limits[1], limits[3])
            : min
              ? kb(min[1], min[2])
              : '',
          max: limits
            ? kb(limits[2], limits[3])
            : max
              ? kb(max[1], max[2])
              : '',
          required: !/\boptional\b/i.test(visible),
        },
        evidence,
        selected: true,
      },
    ]
  })
}
