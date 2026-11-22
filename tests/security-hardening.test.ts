import { describe, it, expect } from 'vitest'
import { smartCutout } from '../src/lib/smart-cutout'
import { guardedUnlock } from '../src/features/vault/unlockGuard'
describe('security and low-memory fallback regressions', () => {
  it('removes only connected border colors while retaining the subject', () => {
    const data = new Uint8ClampedArray(10 * 10 * 4).fill(255)
    for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) {
      const i = (y * 10 + x) * 4
      data[i] = 200; data[i + 1] = 0; data[i + 2] = 0
    }
    expect(smartCutout(data, 10, 10)).toBe(84)
    expect(data[3]).toBe(0)
    expect(data[(4 * 10 + 4) * 4 + 3]).toBe(255)
  })
  it('blocks rapid unlock guesses and permits a correct key after cooldown', async () => {
    let time = 1000
    for (let i = 0; i < 5; i++) await expect(guardedUnlock(() => Promise.reject(Error('Wrong password')), () => time)).rejects.toThrow('Wrong password')
    let called = false
    await expect(guardedUnlock(async () => { called = true }, () => time)).rejects.toThrow('Wait')
    expect(called).toBe(false)
    time += 5000
    expect(await guardedUnlock(async () => 'key', () => time)).toBe('key')
  })
})
