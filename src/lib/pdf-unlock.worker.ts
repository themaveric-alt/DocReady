import createQpdf from '@soulehshaikh99/qpdf-wasm'
import wasmUrl from '@soulehshaikh99/qpdf-wasm/dist/qpdf.wasm?url'
import type { UnlockRequest, UnlockResponse } from './pdf-unlock'

function send(result: UnlockResponse) {
  if (result.kind === 'unlocked')
    self.postMessage(result, { transfer: [result.bytes.buffer] })
  else self.postMessage(result)
}
self.onmessage = async ({ data }: MessageEvent<UnlockRequest>) => {
  const folder = '/source',
    input = folder + '/input.pdf',
    output = '/unlocked.pdf'
  let diagnostic = '',
    printed = ''
  // The bundled CLI binds these when instantiated. Capture text in this
  // dedicated worker so file diagnostics never appear in the browser console.
  const { log, error } = console
  console.log = (line) => {
    printed = String(line).slice(0, 256)
  }
  console.error = (line) => {
    diagnostic = (diagnostic + '\n' + String(line)).slice(-1500)
  }
  try {
    const engine = await createQpdf({ locateFile: () => wasmUrl })
    engine.FS.mkdir(folder)
    engine.FS.mount(
      engine.WORKERFS,
      { blobs: [{ name: 'input.pdf', data: data.file }] },
      folder,
    )
    try {
      const protection = engine.callMain(['--requires-password', input])
      if (protection === 3) {
        send({ kind: 'permissions-only' })
        return
      }
      if (protection === 2) {
        const check = engine.callMain(['--check', input])
        if (check === 0 || check === 3) {
          send({ kind: 'already-open' })
          return
        }
        send({
          kind: 'error',
          message:
            'This PDF is damaged or uses an unsupported protection method.',
        })
        return
      }
      diagnostic = ''
      const status = engine.callMain([
        '--password=' + data.password,
        '--decrypt',
        '--stream-data=preserve',
        input,
        output,
      ])
      if (status !== 0 && status !== 3) {
        send({
          kind: 'error',
          message: /invalid password/i.test(diagnostic)
            ? 'Incorrect password. Enter the password that opens this PDF.'
            : 'This PDF could not be unlocked. It may be damaged or use an unsupported protection method.',
        })
        return
      }
      printed = ''
      const verified =
        engine.callMain(['--requires-password', output]) === 2 &&
        engine.callMain(['--show-npages', output]) === 0
      const pages = Number(printed.trim())
      if (!verified || !Number.isInteger(pages) || pages < 1) {
        send({
          kind: 'error',
          message: 'The unlocked copy could not be verified.',
        })
        return
      }
      const bytes = engine.FS.readFile(output) as Uint8Array<ArrayBuffer>
      engine.FS.unlink(output)
      send({ kind: 'unlocked', bytes, pages, hasWarnings: status === 3 })
    } finally {
      engine.FS.unmount(folder)
    }
  } catch {
    send({
      kind: 'error',
      message:
        'The local PDF engine could not read this file. Try reloading or using a smaller PDF.',
    })
  } finally {
    console.log = log
    console.error = error
    data.password = ''
    diagnostic = ''
    printed = ''
  }
}
