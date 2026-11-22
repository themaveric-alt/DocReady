export const PDF_UNLOCK_LIMIT = 40 * 1024 * 1024

type Result = {
  kind: 'unlocked'
  bytes: Uint8Array<ArrayBuffer>
  pages: number
  hasWarnings: boolean
}
export type UnlockRequest = { file: File; password: string }
export type UnlockResponse =
  | Result
  | { kind: 'already-open' | 'permissions-only' }
  | { kind: 'error'; message: string }

export function unlockPdf(file: File, password: string, signal: AbortSignal) {
  return new Promise<Exclude<UnlockResponse, { kind: 'error' }>>(
    (resolve, reject) => {
      signal.throwIfAborted()
      const worker = new Worker(
        new URL('./pdf-unlock.worker.ts', import.meta.url),
        { type: 'module' },
      )
      const cleanup = () => {
        signal.removeEventListener('abort', abort)
        worker.terminate()
      }
      const abort = () => {
        cleanup()
        reject(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
      worker.onmessage = ({ data }: MessageEvent<UnlockResponse>) => {
        cleanup()
        if (data.kind === 'error') reject(Error(data.message))
        else resolve(data)
      }
      worker.onerror = worker.onmessageerror = () => {
        cleanup()
        reject(
          Error(
            'The local PDF engine could not run. Try reloading or using a smaller PDF.',
          ),
        )
      }
      worker.postMessage({ file, password } satisfies UnlockRequest)
    },
  )
}
