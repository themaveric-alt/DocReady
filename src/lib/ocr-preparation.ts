type Requests = {
  prepare: { image: Blob; filter?: import('./ocr-pixels').OCRFilter }
  docx: { text: string }
}

type Answers = {
  prepare: Blob
  docx: Blob
}

export type OCRPreparationRequest = {
  [K in keyof Requests]: { type: K } & Requests[K]
}[keyof Requests]

export type OCRPreparationResponse =
  { value: Answers[keyof Answers] } | { error: string }

export function openOCRPreparation(signal: AbortSignal) {
  signal.throwIfAborted()
  const worker = new Worker(
    new URL('./ocr-preparation.worker.ts', import.meta.url),
    { type: 'module' },
  )
  const close = () => worker.terminate()
  return {
    close,
    request<K extends keyof Requests>(type: K, args: Requests[K]) {
      signal.throwIfAborted()
      return new Promise<Answers[K]>((resolve, reject) => {
        const cleanup = () => {
          signal.removeEventListener('abort', abort)
          worker.onmessage = null
          worker.onerror = null
        }
        const abort = () => {
          cleanup()
          close()
          reject(signal.reason)
        }
        signal.addEventListener('abort', abort, { once: true })
        worker.onmessage = ({ data }: MessageEvent<OCRPreparationResponse>) => {
          cleanup()
          if ('error' in data) reject(Error(data.error))
          else resolve(data.value as Answers[K])
        }
        worker.onerror = () => {
          cleanup()
          reject(
            Error(
              'The document worker could not start. Try a current browser.',
            ),
          )
        }
        worker.postMessage({ type, ...args })
      })
    },
  }
}
