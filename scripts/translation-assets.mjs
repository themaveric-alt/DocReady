import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'

const registry = JSON.parse(
  await readFile('src/features/translation/models/model-lock.json', 'utf8'),
)
const root = 'public/translation-assets'
const chunkSize = 16 * 1024 * 1024

for (const [pair, definition] of Object.entries(registry)) {
  for (const [name, meta] of Object.entries(definition.files)) {
    const dest = join(root, definition.revision, name)
    const partCount = name.endsWith('.onnx')
      ? Math.ceil(meta.bytes / chunkSize)
      : 0
    const paths = partCount
      ? Array.from({ length: partCount }, (_, i) => dest + '.' + i + '.pack')
      : [dest]
    if (partCount)
      await Promise.all(
        paths.map((_, i) => rm(dest + '.' + i, { force: true })),
      )
    const installed = await Promise.all(
      paths.map((path) => readFile(path).catch(() => null)),
    )
    if (installed.every(Boolean)) {
      try {
        const hash = createHash('sha256')
        for (const part of installed)
          hash.update(partCount ? gunzipSync(part) : part)
        if (hash.digest('hex') === meta.sha256) continue
      } catch {
        // Rebuild a part with an invalid compressed stream from the pinned source.
      }
    }
    if (process.argv.includes('--verify'))
      throw Error(
        'Missing or invalid translation model files. Run npm run models:prepare before building.',
      )
    const staged = process.env.DOCREADY_MODEL_SOURCE
    const url = `https://huggingface.co/Xenova/opus-mt-${pair}/resolve/${definition.revision}/${name}`
    let data
    if (staged) data = await readFile(join(staged, pair, name))
    else {
      const response = await fetch(url, { signal: AbortSignal.timeout(240000) })
      if (!response.ok)
        throw Error(
          `Could not download model asset ${pair}/${name}: ${response.status}`,
        )
      data = Buffer.from(await response.arrayBuffer())
    }
    if (
      data.length !== meta.bytes ||
      createHash('sha256').update(data).digest('hex') !== meta.sha256
    )
      throw Error(`Integrity check failed for ${pair}/${name}`)
    await mkdir(dirname(dest), { recursive: true })
    for (const [i, path] of paths.entries())
      await writeFile(
        path,
        partCount
          ? gzipSync(data.subarray(i * chunkSize, (i + 1) * chunkSize))
          : data,
      )
  }
}
const runtime = join(root, 'ort-1.31')
await mkdir(runtime, { recursive: true })
for (const extension of ['mjs', 'wasm']) {
  const name = 'ort-wasm-simd-threaded.' + extension
  await copyFile(
    join('node_modules/onnxruntime-web/dist', name),
    join(runtime, name),
  )
}
