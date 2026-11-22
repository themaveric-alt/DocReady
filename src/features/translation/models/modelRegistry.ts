import lock from './model-lock.json'
import type { Pair } from '../types'

export const models = lock
export const PART_SIZE = 16 * 1024 * 1024
export const CACHE = 'docready-translation-assets-v2'
export const MODEL_ROOT = '/translation-assets/'
export const RUNTIME = MODEL_ROOT + 'ort-1.31/ort-wasm-simd-threaded'
export const runtimeAssets = { [RUNTIME + '.mjs']: 0, [RUNTIME + '.wasm']: 0 }
export const pairs = Object.keys(models) as Pair[]

export function modelFiles(pair: Pair) {
  const model = models[pair]
  return Object.entries(model.files).flatMap(([name, { bytes }]) => {
    const path = MODEL_ROOT + model.revision + '/' + name
    return name.endsWith('.onnx')
      ? Array.from({ length: Math.ceil(bytes / PART_SIZE) }, (_, i) => ({
          path: path + '.' + i + '.pack',
          bytes: Math.min(bytes - i * PART_SIZE, PART_SIZE),
        }))
      : [{ path, bytes }]
  })
}

export const runtimeFiles = Object.keys(runtimeAssets).map((path) => ({
  path,
  bytes: 0,
}))
export const modelBytes = (pair: Pair) =>
  modelFiles(pair).reduce((n, file) => n + file.bytes, 0)

export const estimatedDownload = (pair: Pair) =>
  Object.values(models[pair].files).reduce(
    (n, file) =>
      n + ('gzipBytes' in file ? Number(file.gzipBytes) : file.bytes),
    0,
  )
