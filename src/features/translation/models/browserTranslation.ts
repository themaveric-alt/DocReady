import type { JobProgress, Language } from '../types'
import { translateParagraph } from './segments'

type ProgressEvent = Event & { loaded: number; total: number }
type TranslatorSession = {
  translate(text: string, options: { signal: AbortSignal }): Promise<string>
  destroy(): void
}
type LocalTranslator = {
  availability(options: {
    sourceLanguage: Language
    targetLanguage: Language
  }): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>
  create(options: {
    sourceLanguage: Language
    targetLanguage: Language
    signal: AbortSignal
    monitor(target: EventTarget): void
  }): Promise<TranslatorSession>
}

const localTranslator = () =>
  (globalThis as { Translator?: LocalTranslator }).Translator
export const browserTranslationAvailable = () => !!localTranslator()

async function wait(delay: number, signal: AbortSignal) {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, delay)
    signal.addEventListener('abort', abort, { once: true })
  })
}
async function translateWithRetry(
  session: TranslatorSession,
  text: string,
  signal: AbortSignal,
) {
  for (const delay of [180, 540, 0]) {
    signal.throwIfAborted()
    try {
      return await session.translate(text, { signal })
    } catch (error) {
      if (
        !delay ||
        !['OperationError', 'QuotaExceededError', 'NetworkError'].includes(
          (error as Error)?.name,
        )
      )
        throw error
      await wait(delay, signal)
    }
  }
  throw Error(
    'On-device translation did not finish. Try translating the remaining text again.',
  )
}
export async function translateWithBrowser(
  sourceLanguage: Language,
  targetLanguage: Language,
  blocks: string[],
  glossary: [string, string][],
  signal: AbortSignal,
  report: (progress: JobProgress) => void,
  result: (index: number, text: string) => void,
) {
  const Translator = localTranslator()
  if (!Translator)
    throw Error(
      'This language pair requires Chrome’s on-device Translator on a supported desktop. The bundled English ↔ Hindi models work independently.',
    )
  const pair = { sourceLanguage, targetLanguage }
  report({ stage: 'Checking the browser’s local language pack' })
  if ((await Translator.availability(pair)) === 'unavailable')
    throw Error(
      'This language pair is unavailable on this device. Choose another pair or use the bundled English ↔ Hindi models.',
    )
  const session = await Translator.create({
    ...pair,
    signal,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        const { loaded, total } = event as ProgressEvent
        report({
          stage:
            total > 0
              ? 'Installing the browser’s local language pack · ' +
                Math.round((loaded / total) * 100) +
                '%'
              : 'Installing the browser’s local language pack',
        })
      })
    },
  }).catch((error: Error) => {
    if (error.name === 'NotAllowedError')
      throw Error(
        'Click Translate again to allow the browser to install its local language pack.',
      )
    throw error
  })
  try {
    for (const [index, text] of blocks.entries()) {
      signal.throwIfAborted()
      report({
        stage: 'Translating on your device',
        done: index,
        total: blocks.length,
        unit: 'blocks',
      })
      result(
        index,
        await translateParagraph(text, sourceLanguage, glossary, (part) =>
          translateWithRetry(session, part, signal),
        ),
      )
    }
  } finally {
    session.destroy()
  }
}
