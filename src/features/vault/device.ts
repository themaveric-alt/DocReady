import { safeName } from '../../lib/files'

export type StorageStatus =
  'checking' | 'persistent' | 'best-effort' | 'unavailable'

export async function requestProtection(): Promise<StorageStatus> {
  const storage = navigator.storage
  if (!storage?.persisted) return 'unavailable'
  try {
    if (await storage.persisted()) return 'persistent'
    if (!storage.persist) return 'unavailable'
    return (await storage.persist()) ? 'persistent' : 'best-effort'
  } catch {
    return 'unavailable'
  }
}

export async function deviceEstimate() {
  const value = await navigator.storage?.estimate?.().catch(() => undefined)
  if (
    typeof value?.quota !== 'number' ||
    typeof value.usage !== 'number' ||
    !Number.isFinite(value.quota) ||
    !Number.isFinite(value.usage) ||
    value.quota <= 0
  )
    return null
  return {
    quota: value.quota,
    usage: value.usage,
    remaining: Math.max(0, value.quota - value.usage),
  }
}

type FilePicker = (options: { suggestedName: string }) => Promise<{
  createWritable: () => Promise<WritableStream<Uint8Array<ArrayBuffer>>>
}>

export async function chooseOutput(name: string) {
  const picker = (window as Window & { showSaveFilePicker?: FilePicker })
    .showSaveFilePicker
  if (!picker)
    throw Error(
      'Streaming this download requires a browser with a Save File picker, such as desktop Chrome or Edge.',
    )
  const handle = await picker.call(window, { suggestedName: safeName(name) })
  return handle.createWritable()
}

export function saveVaultDownload(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = safeName(name)
    document.body.append(anchor)
    try {
      anchor.click()
    } finally {
      anchor.remove()
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
