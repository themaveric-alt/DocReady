import type { ImageLike, LoggerMessage, Worker } from 'tesseract.js'
import { errorText } from './files'

export type OCRLanguage = 'eng' | 'hin' | 'eng+hin' | 'hin+eng' | 'spa' | 'fra' | 'deu'

/** One local worker per job. User inputs are passed only through worker messages. */
export async function openLocalOCR(
  language: OCRLanguage,
  signal: AbortSignal,
  logger?: (message: LoggerMessage) => void,
) {
  signal.throwIfAborted()
  const { createWorker, OEM } = await import('tesseract.js')
  signal.throwIfAborted()
  let worker: Worker | undefined
  let closed = false
  let rejectFailure!: (error: unknown) => void
  const failure = new Promise<never>((_, reject) => {
    rejectFailure = reject
  })
  void failure.catch(() => {})
  const close = async () => {
    if (closed) return
    closed = true
    signal.removeEventListener('abort', abort)
    await worker?.terminate().catch(() => {})
  }
  const abort = () => {
    rejectFailure(signal.reason)
    void close()
  }
  signal.addEventListener('abort', abort, { once: true })
  const base = location.origin + '/ocr'
  const start = createWorker(language, OEM.LSTM_ONLY, {
    workerPath: base + '/worker.min.js',
    corePath: base + '/core',
    langPath: base,
    workerBlobURL: false,
    cacheMethod: 'write',
    errorHandler: (error) => rejectFailure(Error(errorText(error))),
    logger: (message) => {
      if (!closed) logger?.(message)
    },
  }).then(async (instance) => {
    if (closed) {
      await instance.terminate().catch(() => {})
      throw Error('OCR was cancelled.')
    }
    worker = instance
    return instance
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            Error(
              'Local OCR could not initialize. Load its language assets online and try again.',
            ),
          ),
        45000,
      )
    })
    const instance = await Promise.race([start, failure, timeout])
    return {
      recognize: async (source: ImageLike, regions = false) => {
        signal.throwIfAborted()
        if (closed) throw Error('The local OCR worker has closed.')
        const result = await Promise.race([
          instance.recognize(source, {}, { text: true, blocks: regions }),
          failure,
        ])
        return result.data
      },
      close,
    }
  } catch (error) {
    await close()
    throw error
  } finally {
    clearTimeout(timer)
  }
}
