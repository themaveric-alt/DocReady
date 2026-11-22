export const PDF_PROTECT_LIMIT = 40 * 1024 * 1024

export type ProtectRequest = {
  file: File
  userPassword: string
  ownerPassword: string
  restrict: boolean
}

export type ProtectResponse =
  | { kind: 'protected'; bytes: Uint8Array<ArrayBuffer>; pages: number }
  | { kind: 'error'; message: string }

export function protectPdf(
  request: ProtectRequest,
  signal: AbortSignal,
): Promise<Exclude<ProtectResponse, { kind: 'error' }>> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const worker = new Worker(new URL('./pdf-protect.worker.ts', import.meta.url), {
      type: 'module',
    })
    const cleanup = () => {
      signal.removeEventListener('abort', abort)
      worker.terminate()
    }
    const abort = () => {
      cleanup()
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }: MessageEvent<ProtectResponse>) => {
      cleanup()
      if (data.kind === 'error') reject(Error(data.message))
      else resolve(data)
    }
    worker.onerror = worker.onmessageerror = () => {
      cleanup()
      reject(Error('The local PDF protection engine could not run. Try reloading.'))
    }
    worker.postMessage(request)
  })
}
