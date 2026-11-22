import { readFile, writeFile } from 'node:fs/promises'
import { adaptOpenCvGlue } from './opencv-csp.ts'

// Source: https://docs.opencv.org/4.12.0/opencv.js
// Pass the pinned upstream file to reproduce the vendored runtime.
const source = process.argv[2]
if (!source)
  throw Error('Pass the path to the official OpenCV.js 4.12.0 build.')
const original = await readFile(source, 'utf8')
const build = adaptOpenCvGlue(
  original,
  'c7d6967284acc7eb50897eeb4186690444396bbe834aeb7caf7a565285976829',
)
const inlineWasm =
  /wasmBinaryFile="data:application\/octet-stream;base64,([^"]+)"/
const match = inlineWasm.exec(build)
if (!match || !build.includes('}(this, function () {'))
  throw Error('The expected OpenCV worker wrapper or WASM is missing.')

const wasmName = 'opencv-4.12.0.wasm'
const moduleScript =
  '// OpenCV.js 4.12.0, adapted for module workers and a CSP without JavaScript eval.\n' +
  'var Module = { locateFile: (path) => new URL(path, import.meta.url).href };\n' +
  build
    .replace(inlineWasm, 'wasmBinaryFile="' + wasmName + '"')
    .replace('}(this, function () {', '}(globalThis, function () {') +
  '\nexport default globalThis.cv;\n'
await writeFile('public/libs/opencv.js', moduleScript)
await writeFile('public/libs/' + wasmName, Buffer.from(match[1], 'base64'))
