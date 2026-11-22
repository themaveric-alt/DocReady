import {
  LEGACY_RECORD_MAX_BYTES,
  LEGACY_RECORD_COUNT,
  MAX_META_BYTES,
  LEGACY_VAULT_MAX_BYTES,
  encryptRecord,
  openJson,
  openMetadata,
  readHeader,
  sealJson,
  unlockKey,
  unseal,
  validId,
  type Header,
  type IndexRow,
  type RecordRow,
} from './crypto'

const MAGIC = 'DRVAULT1'
const PREFIX = 16
const MAX_HEADER = 1024
const MAX_MANIFEST = 64 * 1024

export async function makeBackup(
  header: Header,
  key: CryptoKey,
  records: RecordRow[],
) {
  const config = new TextEncoder().encode(JSON.stringify(header))
  const manifest = await sealJson(
    key,
    'backup',
    records.map(({ id, size, meta }) => ({
      id,
      size,
      metadataBytes: meta.size,
    })),
  )
  const prefix = new Uint8Array(PREFIX)
  prefix.set(new TextEncoder().encode(MAGIC))
  const lengths = new DataView(prefix.buffer)
  lengths.setUint32(8, config.byteLength)
  lengths.setUint32(12, manifest.size)
  return new Blob(
    [
      prefix,
      config,
      manifest,
      ...records.flatMap((row) => [row.meta, row.content]),
    ],
    {
      type: 'application/octet-stream',
    },
  )
}

type ManifestEntry = { id: string; size: number; metadataBytes: number }

function readManifest(input: unknown): ManifestEntry[] {
  if (!Array.isArray(input) || input.length > LEGACY_RECORD_COUNT)
    throw Error('Invalid backup manifest.')
  const ids = new Set<string>()
  return input.map((candidate: Partial<ManifestEntry> | null) => {
    if (
      !candidate ||
      !validId(candidate.id) ||
      ids.has(candidate.id) ||
      typeof candidate.size !== 'number' ||
      !Number.isSafeInteger(candidate.size) ||
      candidate.size < 29 ||
      candidate.size > LEGACY_RECORD_MAX_BYTES + 28 ||
      typeof candidate.metadataBytes !== 'number' ||
      !Number.isSafeInteger(candidate.metadataBytes) ||
      candidate.metadataBytes < 28 ||
      candidate.metadataBytes > MAX_META_BYTES
    )
      throw Error('Invalid backup record.')
    ids.add(candidate.id)
    return {
      id: candidate.id,
      size: candidate.size,
      metadataBytes: candidate.metadataBytes,
    }
  })
}

export async function readBackup(
  archive: Blob,
  password: string,
  signal: AbortSignal,
  destination?: CryptoKey,
  existing: Set<string> = new Set(),
) {
  if (
    archive.size < PREFIX ||
    archive.size > LEGACY_VAULT_MAX_BYTES + MAX_HEADER + MAX_MANIFEST + PREFIX
  )
    throw Error(
      'Choose a supported DocReady .vault backup smaller than 257 MB.',
    )
  const raw = await archive.slice(0, PREFIX).arrayBuffer()
  const lengths = new DataView(raw)
  const headerLength = lengths.getUint32(8)
  const manifestLength = lengths.getUint32(12)
  const manifestStart = PREFIX + headerLength
  const payloadStart = manifestStart + manifestLength
  if (
    new TextDecoder().decode(raw.slice(0, 8)) !== MAGIC ||
    headerLength < 1 ||
    headerLength > MAX_HEADER ||
    manifestLength < 28 ||
    manifestLength > MAX_MANIFEST ||
    payloadStart > archive.size ||
    archive.size - payloadStart > LEGACY_VAULT_MAX_BYTES
  )
    throw Error('This is not a supported DocReady .vault backup.')
  const header = readHeader(
    JSON.parse(await archive.slice(PREFIX, manifestStart).text()),
  )
  const key = await unlockKey(header, password)
  signal.throwIfAborted()
  try {
    const layout = readManifest(
      await openJson(
        key,
        'backup',
        archive.slice(manifestStart, payloadStart),
      ),
    )
    const end = layout.reduce(
      (sum, item) => sum + item.size + item.metadataBytes,
      payloadStart,
    )
    if (end !== archive.size) throw Error('Invalid backup payload length.')
    const records: RecordRow[] = []
    let offset = payloadStart
    for (const item of layout) {
      signal.throwIfAborted()
      const meta = archive.slice(offset, offset + item.metadataBytes)
      offset += item.metadataBytes
      const content = archive.slice(offset, offset + item.size)
      offset += item.size
      const row: IndexRow = { id: item.id, meta, size: item.size }
      const metadata = await openMetadata(key, row)
      const plain = await unseal(key, 'file:' + item.id, content)
      try {
        signal.throwIfAborted()
        if (destination && !existing.has(item.id))
          records.push(
            await encryptRecord(
              destination,
              item.id,
              new Blob([plain]),
              metadata,
            ),
          )
        else if (!destination) records.push({ ...row, content })
      } finally {
        new Uint8Array(plain).fill(0)
      }
    }
    signal.throwIfAborted()
    return { header, key, records, skipped: layout.length - records.length }
  } catch (error) {
    signal.throwIfAborted()
    if ((error as Error).name === 'OperationError')
      throw Error(
        'This backup failed its integrity check. No files were imported.',
      )
    throw error
  }
}
