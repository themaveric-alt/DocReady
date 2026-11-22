import {
  getDocument,
  GlobalWorkerOptions,
  PasswordResponses,
  type PDFDocumentProxy,
} from 'pdfjs-dist'
import worker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import renderer from 'pdfjs-dist/legacy/build/pdf.renderer.min.mjs?url'
import { canvasBlob } from './raster'
GlobalWorkerOptions.workerSrc = worker
const origin = () => window.location.origin + '/pdf/'
export type PDFPasswordRequest = (incorrect: boolean) => Promise<string>
export async function loadRender(
  file: Blob,
  options?: {
    password?: PDFPasswordRequest
    signal?: AbortSignal
    workerRendering?: boolean
  },
) {
  options?.signal?.throwIfAborted()
  const base = origin()
  if (options?.workerRendering) GlobalWorkerOptions.rendererSrc = renderer
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/',
    wasmUrl: base + 'wasm/',
    iccUrl: base + 'iccs/',
    enableXfa: false,
    disableWorkerRendering: !options?.workerRendering,
  })
  const abort = () => {
    void task.destroy().catch(() => {})
  }
  options?.signal?.addEventListener('abort', abort, { once: true })
  let passwordFailure: Error | undefined
  const requestPassword = options?.password
  if (requestPassword) {
    task.onPassword = (
      supply: (password: string | Error) => void,
      reason: number,
    ) => {
      void requestPassword(
        reason === PasswordResponses.INCORRECT_PASSWORD,
      ).then(
        (password) => {
          if (!task.destroyed) supply(password)
        },
        (error) => {
          passwordFailure =
            error instanceof Error
              ? error
              : Error('Password entry cancelled.')
          if (!task.destroyed) supply(passwordFailure)
        },
      )
    }
  }
  try {
    if (options?.signal?.aborted) abort()
    return Object.assign(await task.promise, {
      dispose: async () => {
        options?.signal?.removeEventListener('abort', abort)
        await task.destroy().catch(() => {})
      },
    })
  } catch (e) {
    options?.signal?.removeEventListener('abort', abort)
    await task.destroy().catch(() => {})
    options?.signal?.throwIfAborted()
    if (passwordFailure) throw passwordFailure
    if ((e as Error).name === 'PasswordException')
      throw Error(
        'This PDF is password-protected. Unlock it before uploading.',
      )
    throw Error('Could not open this PDF. The file may be damaged.')
  }
}
export type RenderPDF = PDFDocumentProxy & { dispose: () => Promise<void> }
export async function renderPage(
  doc: PDFDocumentProxy,
  index: number,
  scale = 1,
  rotation = 0,
) {
  const page = await doc.getPage(index + 1)
  const viewport = page.getViewport({
    scale,
    rotation: (page.rotate + rotation) % 360,
  })
  if (
    viewport.width * viewport.height > 16_000_000 ||
    viewport.width > 10000 ||
    viewport.height > 10000
  )
    throw Error('This PDF page is too large at the selected scale.')
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvas, viewport }).promise
  return canvas
}
export async function renderBlob(
  doc: PDFDocumentProxy,
  index: number,
  scale = 1,
  mime = 'image/png',
  quality = 0.9,
  rot = 0,
) {
  const canvas = await renderPage(doc, index, scale, rot)
  try {
    return await canvasBlob(canvas, mime, quality)
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
