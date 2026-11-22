import createQpdf from '@soulehshaikh99/qpdf-wasm'
import wasmUrl from '@soulehshaikh99/qpdf-wasm/dist/qpdf.wasm?url'
import type { ProtectRequest, ProtectResponse } from './pdf-protect'

function send(response: ProtectResponse) {
  if (response.kind === 'protected')
    self.postMessage(response, { transfer: [response.bytes.buffer] })
  else self.postMessage(response)
}

self.onmessage = async ({ data }: MessageEvent<ProtectRequest>) => {
  const input = '/input.pdf'
  const output = '/protected.pdf'
  let printed = ''
  const originalLog = console.log
  const originalError = console.error
  console.log = (value) => { printed = String(value).slice(-200) }
  console.error = () => {}
  try {
    const engine = await createQpdf({ locateFile: () => wasmUrl })
    engine.FS.writeFile(input, new Uint8Array(await data.file.arrayBuffer()))
    const argumentsList = [
      input,
      '--encrypt',
      `--user-password=${data.userPassword}`,
      `--owner-password=${data.ownerPassword}`,
      '--bits=256',
    ]
    if (data.restrict)
      argumentsList.push('--print=none', '--modify=none', '--extract=n')
    argumentsList.push('--', output)
    const status = engine.callMain(argumentsList)
    if (status !== 0 && status !== 3) {
      send({ kind: 'error', message: 'The local engine could not protect this PDF.' })
      return
    }
    printed = ''
    const checked = engine.callMain([
      `--password=${data.userPassword}`,
      '--check',
      output,
    ])
    if (checked !== 0 && checked !== 3) {
      send({ kind: 'error', message: 'The protected copy could not be verified.' })
      return
    }
    printed = ''
    const pagesResult = engine.callMain(['--password=' + data.userPassword, '--show-npages', output])
    const pages = Number(printed.trim())
    if (pagesResult !== 0 || !Number.isInteger(pages) || pages < 1) {
      send({ kind: 'error', message: 'The protected copy has no verifiable pages.' })
      return
    }
    const bytes = engine.FS.readFile(output) as Uint8Array<ArrayBuffer>
    engine.FS.unlink(input)
    engine.FS.unlink(output)
    send({ kind: 'protected', bytes, pages })
  } catch {
    send({ kind: 'error', message: 'The local PDF protection engine could not read this file.' })
  } finally {
    console.log = originalLog
    console.error = originalError
    data.userPassword = ''
    data.ownerPassword = ''
    printed = ''
  }
}
