export function detectDesktop(scope: { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown } | undefined) {
  return Boolean(scope?.__TAURI__ || scope?.__TAURI_INTERNALS__)
}
export const IS_DESKTOP = detectDesktop(typeof window === 'undefined' ? undefined : window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown })
