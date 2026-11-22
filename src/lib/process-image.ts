import { processRaster, type RasterOptions } from './raster'
export async function runRaster(blob: Blob, options: RasterOptions, signal?: AbortSignal) {
  signal?.throwIfAborted()
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined')
    return processRaster(blob, options)
  const worker = new Worker(new URL('./raster.worker.ts', import.meta.url), {
    type: 'module',
  })
  try {
    return await new Promise<Awaited<ReturnType<typeof processRaster>>>(
      (resolve, reject) => {
        const abort = () => { worker.terminate(); reject(signal?.reason) }
        signal?.addEventListener('abort', abort, { once: true })
        worker.onmessage = (event) =>
          { signal?.removeEventListener('abort', abort)
          event.data.error
            ? reject(Error(event.data.error))
            : resolve(event.data.result) }
        worker.onerror = () => {
          signal?.removeEventListener('abort', abort)
          reject(
            Error(
              'The image worker stopped. Try a smaller file or reload the app.',
            ),
          )
        }
        worker.postMessage({ blob, options })
      },
    )
  } finally {
    worker.terminate()
  }
}
