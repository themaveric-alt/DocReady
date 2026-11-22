import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { IS_DESKTOP } from './environment'
export const desktop = () => IS_DESKTOP
export async function watchLaunchPdf(accept: (file: File) => void, failure: (message: string) => void) {
  if (!desktop()) return () => {}
  async function receive() {
    try {
      const input = await invoke<{ name: string; bytes: number[] } | null>('take_launch_pdf')
      if (input) {
        window.dispatchEvent(new Event('docready-open-file'))
        accept(new File([new Uint8Array(input.bytes)], input.name, { type: 'application/pdf' }))
      }
    } catch { failure('Could not open the launch PDF. Select it from the reader instead.') }
  }
  const stop = await listen('pdf-available', receive)
  await receive()
  return stop
}
export async function desktopSave(file: Blob, name: string) {
  return invoke<boolean>('save_pdf', { name, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) })
}
