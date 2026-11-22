import type { Candidate, PageAnalysis } from './documentRegions'
export type { Candidate } from './documentRegions'
let nextId = 0
export function openDetector(signal: AbortSignal) {
  const worker = new Worker(
    new URL('./cardDetection.worker.ts', import.meta.url),
    { type: 'module' },
  )
  const stop = () => worker.terminate()
  signal.addEventListener('abort', stop, { once: true })
  return {
    close() {
      signal.removeEventListener('abort', stop)
      stop()
    },
    detect(
      canvas: HTMLCanvasElement,
      ratio: number,
      page?: PageAnalysis,
    ): Promise<Candidate[]> {
      signal.throwIfAborted()
      const id = ++nextId
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height)
      return new Promise((resolve, reject) => {
        const finish = () => {
          signal.removeEventListener('abort', abort)
          worker.removeEventListener('error', failed)
          worker.removeEventListener('message', message)
          clearTimeout(timeout)
        }
        const abort = () => {
          finish()
          reject(signal.reason)
        }
        const failed = () => {
          finish()
          reject(
            Error(
              'Automatic detection could not start. Use the manual crop.',
            ),
          )
        }
        const message = ({
          data,
        }: MessageEvent<{
          id: number
          candidates?: Candidate[]
          error?: string
        }>) => {
          if (data.id !== id) return
          finish()
          if (data.candidates) resolve(data.candidates)
          else reject(Error(data.error || 'Automatic detection failed.'))
        }
        const timeout = window.setTimeout(failed, 22000)
        signal.addEventListener('abort', abort, { once: true })
        worker.addEventListener('error', failed)
        worker.addEventListener('message', message)
        worker.postMessage({ id, rgba, ratio, page }, [rgba.data.buffer])
      })
    },
  }
}
