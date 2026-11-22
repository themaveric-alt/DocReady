type Cutout = { type: 'result'; image: Blob; width: number; height: number; notice?: string }
export type BackgroundProgress = {
  type: 'progress'
  key: string
  current: number
  total: number
}
export type BackgroundRequest =
  | { type: 'remove'; image: Blob; limit?: number; smart?: boolean }
  | { type: 'paint'; image: Blob; color: string }
export type BackgroundResponse =
  Cutout | BackgroundProgress | { type: 'error'; message: string; recoverable?: boolean }

function singleBackgroundJob(
  request: BackgroundRequest,
  signal: AbortSignal,
  report?: (message: BackgroundProgress) => void,
) {
  signal.throwIfAborted()
  return new Promise<Cutout>((resolve, reject) => {
    const worker = new Worker(
      new URL('./background-removal.worker.ts', import.meta.url),
      { type: 'module' },
    )
    const timeout = setTimeout(() => {
      cleanup()
      reject(Object.assign(Error('The image worker exceeded the device time budget.'), { recoverable: true }))
    }, 120000)
    const cleanup = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      worker.terminate()
    }
    const abort = () => {
      cleanup()
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }: MessageEvent<BackgroundResponse>) => {
      if (data.type === 'progress') {
        report?.(data)
        return
      }
      cleanup()
      if (data.type === 'result') resolve(data)
      else reject(Object.assign(Error(data.message), { recoverable: data.recoverable }))
    }
    worker.onerror = worker.onmessageerror = () => {
      cleanup()
      reject(
        Object.assign(Error('The image worker stopped.'), { recoverable: true }),
      )
    }
    worker.postMessage(request)
  })
}

export async function runBackgroundJob(request: BackgroundRequest, signal: AbortSignal, report?: (message: BackgroundProgress) => void) {
  if (request.type === 'paint' || request.smart) return singleBackgroundJob(request, signal, report)
  for (const limit of [1024, 512]) {
    try { return await singleBackgroundJob({ ...request, limit }, signal, report) }
    catch (error) {
      signal.throwIfAborted()
      if (!(error as { recoverable?: boolean }).recoverable) throw error
    }
  }
  report?.({ type: 'progress', key: 'compute:smart', current: 0, total: 1 })
  return singleBackgroundJob({ ...request, limit: 512, smart: true }, signal, report)
}
