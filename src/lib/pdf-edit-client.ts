import type { PDFAction, PDFOptions, imagesPdf as engineImagesPdf } from './pdf-edit'
async function run<T>(job: object, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted()
  const worker = new Worker(new URL('./pdf-edit.worker.ts', import.meta.url), { type: 'module' })
  try {
    return await new Promise<T>((resolve, reject) => {
      const abort = () => { worker.terminate(); reject(signal?.reason) }
      signal?.addEventListener('abort', abort, { once: true })
      worker.onmessage = ({ data }) => { signal?.removeEventListener('abort', abort); data.error ? reject(Error(data.error)) : resolve(data.result) }
      worker.onerror = () => { signal?.removeEventListener('abort', abort); reject(Error('The PDF worker stopped. Try a smaller batch.')) }
      worker.postMessage(job)
    })
  } finally { worker.terminate() }
}
export const editPdf = (action: PDFAction, files: Blob[], options: PDFOptions, signal?: AbortSignal) => run<Blob>({ kind: 'edit', action, files, options }, signal)
export const imagesPdf = (files: Blob[], options: Parameters<typeof engineImagesPdf>[1], signal?: AbortSignal) => run<Blob>({ kind: 'images', files, options }, signal)
export const pdfCounts = (files: Blob[]) => run<number[]>({ kind: 'counts', files })
