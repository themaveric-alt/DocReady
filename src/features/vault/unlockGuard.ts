// This session cooldown reduces rapid UI attempts. Browser-profile access can
// bypass client controls, so PBKDF2 remains the cryptographic defense.
let failures = 0
let nextAttempt = 0
let pending = false
export async function guardedUnlock<T>(unlock: () => Promise<T>, now = () => Date.now()): Promise<T> {
  if (pending) throw Error('An unlock attempt is already running.')
  if (now() < nextAttempt) throw Error(`Wait ${Math.ceil((nextAttempt - now()) / 1000)} seconds before trying again.`)
  pending = true
  try {
    const result = await unlock()
    failures = 0
    nextAttempt = 0
    return result
  } catch (error) {
    failures++
    if (failures >= 5) nextAttempt = now() + Math.min(300000, 5000 * 2 ** Math.min(6, failures - 5))
    throw error
  } finally { pending = false }
}
