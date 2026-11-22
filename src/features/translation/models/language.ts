import { francAll } from 'franc-min'
import type { Language, Pair } from '../types'
export const languageNames: Record<Language, string> = {
  en: 'English',
  hi: 'Hindi — हिंदी',
  es: 'Spanish — Español',
  fr: 'French — Français',
  de: 'German — Deutsch',
}
export function pairFor(from: Language, to: Language): Pair | undefined {
  if (from === 'en' && to === 'hi') return 'en-hi'
  if (from === 'hi' && to === 'en') return 'hi-en'
}
const francLanguages: Partial<Record<string, Language>> = {
  eng: 'en',
  hin: 'hi',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
}
export function detectLanguage(text: string) {
  const cleaned = text
    .replace(/(?:https?:\/\/|www\.)\S+|\S+@\S+/giu, '')
    .slice(0, 5000)
  const results = francAll(cleaned, { minLength: 16 })
  const [best, second] = results
  const margin = best && second ? best[1] - second[1] : 0
  const language = francLanguages[best?.[0]]
  return {
    language: margin >= 0.035 ? language : undefined,
    candidate: language,
    margin,
  }
}
