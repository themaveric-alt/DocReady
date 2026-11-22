import {
  CACHE,
  MODEL_ROOT,
  modelFiles,
  models,
  runtimeFiles,
} from './modelRegistry'
import type { JobProgress, Pair } from '../types'

const openCache = () =>
  typeof caches === 'undefined'
    ? Promise.resolve(undefined)
    : caches.open(CACHE).catch(() => undefined)

async function getAsset(
  path: string,
  bytes: number,
  signal: AbortSignal,
  cache?: Cache,
) {
  signal.throwIfAborted()
  const response =
    (await cache?.match(path, { ignoreVary: true })) ??
    (await fetch(path, {
      signal,
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
    }))
  if (
    !response.ok ||
    response.headers.get('content-type')?.includes('text/html') ||
    !response.body
  )
    throw Error(
      'A local model asset could not be loaded. Check the app connection and retry.',
    )
  const length = bytes || 24 * 1024 * 1024
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let lengthRead = 0
  const reader = response.body.getReader()
  try {
    while (true) {
      signal.throwIfAborted()
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(new Uint8Array(value))
      lengthRead += value.byteLength
      if (lengthRead > length)
        throw Error('The downloaded model asset exceeded its expected size.')
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  if (!lengthRead || (bytes && lengthRead !== bytes))
    throw Error(
      'A translation model asset is incomplete. Remove and re-download this model.',
    )
  return new Blob(chunks, {
    type: response.headers.get('content-type') || 'application/octet-stream',
  })
}

export async function modelInstalled(pair: Pair) {
  const cache = await openCache()
  if (!cache) return false
  for (const { path } of [...runtimeFiles, ...modelFiles(pair)]) {
    if (!(await cache.match(path, { ignoreVary: true }))) return false
  }
  return true
}

export async function removeModel(pair: Pair) {
  const cache = await openCache()
  await Promise.all(
    modelFiles(pair).map(({ path }) =>
      cache?.delete(path, { ignoreVary: true }),
    ),
  )
}

export async function installModel(
  pair: Pair,
  signal: AbortSignal,
  progress: (value: JobProgress) => void,
) {
  const cache = await openCache()
  if (!cache)
    throw Error(
      'This browser does not allow persistent model storage. You can still translate online without saving the model.',
    )
  const files = [...runtimeFiles, ...modelFiles(pair)]
  for (const [index, { path, bytes }] of files.entries()) {
    signal.throwIfAborted()
    progress({
      stage: 'Saving translation assets',
      done: index,
      total: files.length,
      unit: 'files',
    })
    if (await cache.match(path, { ignoreVary: true })) continue
    const blob = await getAsset(path, path.endsWith('.pack') ? 0 : bytes, signal)
    if (path.endsWith('.pack')) {
      const tail = new DataView(await blob.slice(-4).arrayBuffer())
      if (tail.byteLength !== 4 || tail.getUint32(0, true) !== bytes)
        throw Error('A compressed model part failed its integrity check.')
    }
    signal.throwIfAborted()
    await cache.put(
      path,
      new Response(blob, {
        headers: {
          'Content-Type': blob.type,
          'Content-Length': String(blob.size),
        },
      }),
    )
  }
}

export async function runtimeBinary(signal: AbortSignal) {
  const cache = await openCache()
  return (await getAsset(runtimeFiles[1].path, 0, signal, cache)).arrayBuffer()
}

export async function modelFetch(
  pair: Pair,
  request: RequestInfo | URL,
  signal: AbortSignal,
  report: (path: string, loaded: number) => void,
) {
  const url = new URL(
    typeof request === 'string' || request instanceof URL
      ? request
      : request.url,
    location.origin,
  )
  const prefix = MODEL_ROOT + models[pair].revision + '/'
  if (
    url.origin !== location.origin ||
    url.search ||
    !url.pathname.startsWith(prefix)
  )
    throw Error(
      'The translation runtime attempted to read an unapproved model asset.',
    )
  const files = modelFiles(pair).filter(
    ({ path }) =>
      path === url.pathname ||
      (url.pathname.endsWith('.onnx') && path.startsWith(url.pathname + '.')),
  )
  if (!files.length) return new Response(null, { status: 404 })
  const cache = await openCache()
  const responseBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const file = files.shift()
        if (!file) return controller.close()
        const compressed = file.path.endsWith('.pack')
        const blob = await getAsset(
          file.path,
          compressed ? 0 : file.bytes,
          signal,
          cache,
        )
        let raw: ArrayBuffer
        if (compressed) {
          if (typeof DecompressionStream !== 'function')
            throw Error(
              'This browser cannot decompress the local model. Try an up-to-date browser.',
            )
          raw = await new Response(
            blob.stream().pipeThrough(new DecompressionStream('gzip')),
          ).arrayBuffer()
        } else raw = await blob.arrayBuffer()
        if (raw.byteLength !== file.bytes)
          throw Error('A local model part has an incorrect size.')
        report(file.path, raw.byteLength)
        controller.enqueue(new Uint8Array(raw))
      } catch (error) {
        controller.error(error)
      }
    },
  })
  return new Response(responseBody, {
    headers: {
      'Content-Length': String(files.reduce((n, file) => n + file.bytes, 0)),
    },
  })
}
