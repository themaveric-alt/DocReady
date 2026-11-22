import { create } from 'zustand'
import type { ImageMime } from './files'
export type Preferences = {
  format: ImageMime
  quality: number
  paper: string
  motion: 'system' | 'reduced'
  theme: 'light' | 'dark'
  recent: boolean
}
export const defaults: Preferences = {
  format: 'image/jpeg',
  quality: 0.88,
  paper: 'A4',
  motion: 'system',
  theme: 'light',
  recent: false,
}
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem('docready:' + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
export function writeLocal(key: string, value: unknown) {
  localStorage.setItem('docready:' + key, JSON.stringify(value))
}
export function removeLocal(key: string) {
  localStorage.removeItem('docready:' + key)
}
export const usePrefs = create<{
  prefs: Preferences
  set: (p: Preferences) => void
  reset: () => void
}>((set) => ({
  prefs: { ...defaults, ...readLocal('preferences', {}) },
  set: (p) => {
    writeLocal('preferences', p)
    set({ prefs: p })
  },
  reset: () => {
    removeLocal('preferences')
    removeLocal('recent')
    set({ prefs: defaults })
  },
}))
