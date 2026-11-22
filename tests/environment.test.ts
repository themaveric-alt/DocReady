import { describe, expect, it } from 'vitest'
import { detectDesktop } from '../src/lib/environment'
describe('web and native runtime boundary', () => {
  it('keeps ordinary and server-side contexts in web mode', () => {
    expect(detectDesktop(undefined)).toBe(false)
    expect(detectDesktop({})).toBe(false)
  })
  it('recognizes both supported Tauri runtime markers', () => {
    expect(detectDesktop({ __TAURI__: {} })).toBe(true)
    expect(detectDesktop({ __TAURI_INTERNALS__: {} })).toBe(true)
  })
})
