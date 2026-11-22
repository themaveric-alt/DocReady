import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
let model = await readFile('public/libs/u2netp.onnx').catch(() => null)
if (!model && !process.argv.includes('--verify')) {
  const response = await fetch('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx', { signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw Error('Small background model download failed.')
  model = Buffer.from(await response.arrayBuffer())
  if (createHash('sha256').update(model).digest('hex') !== '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8') throw Error('Downloaded model integrity check failed.')
  await writeFile('public/libs/u2netp.onnx', model)
}
if (!model) throw Error('Prepare the small background model before building.')
if (createHash('sha256').update(model).digest('hex') !== '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8') throw Error('Small background model integrity check failed.')
await mkdir('public/background-assets', { recursive: true })
await copyFile('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'public/background-assets/ort-wasm-simd-threaded.mjs')
