import {
  CHUNK_BYTES,
  MAX_META_BYTES,
  checkMetadata,
  encryptedSize,
  seal,
  sealJson,
  unseal,
  type Entry,
  type IndexRow,
  type Metadata,
} from './crypto'
import { beginStaging, readChunk, readContent, writeChunk } from './storage'

export type VaultProgress = (label: string, fraction: number) => void

function purpose(id: string, part: number) {
  return 'chunk:' + id + ':' + part
}

export async function openPart(
  key: CryptoKey,
  entry: Entry,
  part: number,
  cipher: Blob,
  chunked: boolean,
) {
  const expected = chunked
    ? Math.min(CHUNK_BYTES, entry.size - part * CHUNK_BYTES)
    : entry.size
  if (expected < 1 || cipher.size !== expected + 28)
    throw Error('An encrypted file chunk has an invalid length.')
  return new Uint8Array(
    await unseal(
      key,
      chunked ? purpose(entry.id, part) : 'file:' + entry.id,
      cipher,
    ),
  )
}

export function fileStream(
  key: CryptoKey,
  row: IndexRow,
  entry: Entry,
  signal: AbortSignal,
  encrypted = false,
) {
  const count = row.chunked ? Math.ceil(entry.size / CHUNK_BYTES) : 1
  let part = 0
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(sink) {
        signal.throwIfAborted()
        const stored = row.chunked
          ? await readChunk(entry.id, part, signal)
          : await readContent(entry.id, signal)
        if (
          encrypted &&
          stored.size !==
            (row.chunked
              ? Math.min(CHUNK_BYTES, entry.size - part * CHUNK_BYTES) + 28
              : row.size)
        )
          throw Error('An encrypted file has an invalid length.')
        const bytes = encrypted
          ? new Uint8Array(await stored.arrayBuffer())
          : await openPart(key, entry, part, stored, !!row.chunked)
        signal.throwIfAborted()
        sink.enqueue(bytes)
        if (++part === count) sink.close()
      },
    },
    { highWaterMark: 0 },
  )
}

export async function stageFile(
  key: CryptoKey,
  id: string,
  source: ReadableStream<Uint8Array>,
  metadata: Metadata,
  staged: Map<string, string>,
  signal: AbortSignal,
  advance?: (fraction: number) => void,
): Promise<IndexRow> {
  checkMetadata(metadata)
  const meta = await sealJson(key, 'meta:' + id, metadata)
  if (meta.size > MAX_META_BYTES)
    throw Error('This file has too much index text to save.')
  const token = crypto.randomUUID()
  await beginStaging(id, token, signal)
  staged.set(id, token)
  const input = source.getReader()
  const buffer = new Uint8Array(Math.min(metadata.size, CHUNK_BYTES))
  let used = 0,
    total = 0,
    part = 0
  const cancel = () => {
    void input.cancel().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    for (;;) {
      signal.throwIfAborted()
      const { value, done } = await input.read()
      if (done) break
      total += value.length
      if (total > metadata.size)
        throw Error('The file exceeds its declared length.')
      for (let offset = 0; offset < value.length;) {
        const length = Math.min(buffer.length - used, value.length - offset)
        buffer.set(value.subarray(offset, offset + length), used)
        used += length
        offset += length
        if (used === buffer.length) {
          const cipher = await seal(key, purpose(id, part), buffer)
          await writeChunk(id, token, part++, cipher, signal)
          used = 0
          advance?.(Math.min(1, (part * CHUNK_BYTES) / metadata.size))
        }
      }
    }
    signal.throwIfAborted()
    if (total !== metadata.size) throw Error('The file is incomplete.')
    if (used) {
      await writeChunk(
        id,
        token,
        part,
        await seal(key, purpose(id, part), buffer.subarray(0, used)),
        signal,
      )
      advance?.(1)
    }
    return { id, meta, size: encryptedSize(metadata.size, true), chunked: true }
  } finally {
    signal.removeEventListener('abort', cancel)
    buffer.fill(0)
    await input.cancel().catch(() => {})
    input.releaseLock()
  }
}

export async function boundedBlob(
  source: ReadableStream<Uint8Array<ArrayBuffer>>,
  type: string,
) {
  const pieces: Blob[] = []
  const reader = source.getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      pieces.push(new Blob([value]))
      value.fill(0)
    }
    return new Blob(pieces, { type })
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
