import type { JobProgress, Pair } from '../types'

export async function translateBlocks(
  pair: Pair,
  text: string[],
  glossary: [string, string][],
  signal: AbortSignal,
  progress: (progress: JobProgress) => void,
  result: (index: number, text: string) => void,
) {
  signal.throwIfAborted()
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined')
    throw Error(
      'This browser cannot run local neural translation. Try a current desktop browser with WebAssembly support.',
    )
  const worker = new Worker(
    new URL('../workers/translate.worker.ts', import.meta.url),
    { type: 'module' },
  )
  let abort: (() => void) | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      worker.onerror = () =>
        reject(
          Error(
            'The local translation worker stopped. Close other tabs or try fewer pages on a device with more memory.',
          ),
        )
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') progress(data)
        else if (data.type === 'block') result(data.index, data.translated)
        else if (data.type === 'done') resolve()
        else if (data.type === 'error') reject(Error(data.message))
      }
      worker.postMessage({ pair, text, glossary })
    })
  } finally {
    if (abort) signal.removeEventListener('abort', abort)
    worker.terminate()
  }
}
