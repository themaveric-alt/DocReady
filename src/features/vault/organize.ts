import { fileKind, images, PDF } from '../../lib/files'
import { MAX_TEXT, type Entry, type Folder } from './crypto'

const normalized = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()

const signals: [Folder, string[]][] = [
  [
    'Govt IDs',
    [
      'aadhaar',
      'aadhar',
      'uidai',
      'आधार',
      'passport',
      'voter id',
      'driving licence',
      'driving license',
      'permanent account number',
      'pan card',
      'identity card',
      'ration card',
      'मतदाता',
      'पहचान पत्र',
    ],
  ],
  [
    'Education',
    [
      'marksheet',
      'mark sheet',
      'transcript',
      'university',
      'semester',
      'degree certificate',
      'diploma',
      'result sheet',
      'school leaving certificate',
      'grade report',
      'academic record',
      'अंकसूची',
      'विद्यालय',
      'विश्वविद्यालय',
    ],
  ],
  [
    'Finance & Bills',
    [
      'invoice',
      'bank statement',
      'tax return',
      'payment receipt',
      'electricity bill',
      'account statement',
      'gstin',
      'amount due',
      'salary slip',
      'insurance premium',
      'बिजली बिल',
      'चालान',
      'बैंक',
    ],
  ],
  [
    'Medical',
    [
      'prescription',
      'lab report',
      'patient',
      'diagnosis',
      'hospital',
      'discharge summary',
      'blood test',
      'medical report',
      'vaccination',
      'रोगी',
      'अस्पताल',
      'चिकित्सा',
    ],
  ],
]

export function suggestFolder(title: string, content: string): Folder {
  const name = ' ' + normalized(title) + ' '
  const text = ' ' + normalized(content) + ' '
  let best: Folder = 'Personal'
  let bestScore = 0
  for (const [folder, phrases] of signals) {
    const score = phrases.reduce((score, phrase) => {
      const term = ' ' + phrase + ' '
      const weight = phrase.includes(' ') ? 3 : 1
      return (
        score +
        weight * (Number(text.includes(term)) + Number(name.includes(term)) * 2)
      )
    }, 0)
    if (score > bestScore) {
      best = folder
      bestScore = score
    }
  }
  return best
}

export const searchText = (entry: Entry) =>
  normalized([entry.name, entry.folder, ...entry.tags, entry.text].join(' '))
export const searchWords = (query: string) =>
  normalized(query).split(' ').filter(Boolean)

export async function inspectDocument(
  file: Blob,
  name: string,
  signal: AbortSignal,
) {
  const detected = await fileKind(file)
  const isText =
    !detected && (file.type === 'text/plain' || /\.txt$/i.test(name))
  const mime =
    detected ||
    (isText ? 'text/plain' : file.type || 'application/octet-stream')
  if (!isText && file.size > 20 * 1024 ** 2)
    return {
      mime,
      text: '',
      note: 'Large file. Text extraction was skipped to keep memory use low. You can still save and search by name or tag.',
    }
  let text = ''
  let note = ''
  let ocr:
    | Awaited<ReturnType<typeof import('../../lib/local-ocr').openLocalOCR>>
    | undefined
  let pdf: import('../../lib/pdf-render').RenderPDF | undefined

  async function readImage(blob: Blob) {
    const { openLocalOCR } = await import('../../lib/local-ocr')
    ocr ??= await openLocalOCR('eng+hin', signal)
    return (await ocr.recognize(blob)).text.trim()
  }

  try {
    signal.throwIfAborted()
    if (isText) text = (await file.slice(0, MAX_TEXT * 4).text()).trim()
    else if (detected === PDF) {
      const { loadRender, renderBlob } = await import('../../lib/pdf-render')
      pdf = await loadRender(file, { signal })
      for (
        let index = 0;
        index < Math.min(pdf.numPages, 12) && text.length < MAX_TEXT;
        index++
      ) {
        signal.throwIfAborted()
        const page = await pdf.getPage(index + 1)
        const native = (await page.getTextContent()).items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .trim()
        let pageText = native
        if (native.length < 20) {
          const { width, height } = page.getViewport({ scale: 1 })
          const scale = Math.min(2.1, 1800 / Math.max(width, height))
          pageText =
            (await readImage(await renderBlob(pdf, index, scale))) || native
        }
        text += pageText + '\n'
      }
    } else if ((images as readonly string[]).includes(detected)) {
      const { decodeImage, newCanvas, canvasBlob } =
        await import('../../lib/raster')
      const image = await decodeImage(file)
      try {
        const scale = Math.min(1, 2200 / Math.max(image.width, image.height))
        const canvas = newCanvas(
          Math.max(1, Math.round(image.width * scale)),
          Math.max(1, Math.round(image.height * scale)),
        )
        const ctx = canvas.getContext('2d') as
          CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
        if (!ctx) throw Error('Could not prepare this image for OCR.')
        try {
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
          text = await readImage(await canvasBlob(canvas, 'image/png'))
        } finally {
          canvas.width = canvas.height = 1
        }
      } finally {
        image.close()
      }
    }
  } catch {
    signal.throwIfAborted()
    note =
      'Some text could not be extracted. You can still organize and save this file.'
  } finally {
    await ocr?.close()
    await pdf?.dispose()
  }
  signal.throwIfAborted()
  return {
    mime,
    text: text
      .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ')
      .trim()
      .slice(0, MAX_TEXT),
    note,
  }
}
