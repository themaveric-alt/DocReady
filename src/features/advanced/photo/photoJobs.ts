import type { PhotoJob } from './photo.worker'
import type { PhotoAnalysis } from './photoState'
import type { renderPhoto } from './engine'
type Return<J extends PhotoJob> = J['kind'] extends 'analysis'
  ? PhotoAnalysis
  : Awaited<ReturnType<typeof renderPhoto>>
export async function photoJob<J extends PhotoJob>(
  job: J,
  signal: AbortSignal,
): Promise<Return<J>> {
  signal.throwIfAborted()
  if (
    typeof Worker === 'undefined' ||
    typeof OffscreenCanvas === 'undefined'
  ) {
    const { analyzePhoto, renderPhoto } = await import('./engine')
    const result =
      job.kind === 'analysis'
        ? await analyzePhoto(job.file)
        : await renderPhoto(job.file, job.edit, {
            ...job.options,
            limit: Math.min(job.options.limit, 4_000_000),
          })
    signal.throwIfAborted()
    return result as Return<J>
  }
  const worker = new Worker(new URL('./photo.worker.ts', import.meta.url), {
    type: 'module',
  })
  return new Promise((resolve, reject) => {
    function close() {
      signal.removeEventListener('abort', abort)
      worker.terminate()
    }
    function abort() {
      close()
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }) => {
      close()
      if (data.error) reject(Error(data.error))
      else resolve(data.result)
    }
    worker.onerror = () => {
      close()
      reject(Error('Photo processing stopped. Try a smaller image.'))
    }
    worker.postMessage(job)
  })
}
