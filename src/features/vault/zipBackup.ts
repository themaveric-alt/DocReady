import {
  BlobReader,
  ZipReader,
  ZipWriter,
  type FileEntry,
} from '@zip.js/zip.js'
import { safeName } from '../../lib/files'
import {
  CHUNK_BYTES,
  LEGACY_RECORD_MAX_BYTES,
  checkFolder,
  checkMetadata,
  createKey,
  encryptedSize,
  folderMap,
  folderTrail,
  folders,
  isCustomId,
  openJson,
  readHeader,
  sealJson,
  unlockKey,
  validId,
  type CustomFolder,
  type Entry,
  type Folder,
  type Header,
  type IndexRow,
} from './crypto'
import {
  boundedBlob,
  fileStream,
  openPart,
  stageFile,
  type VaultProgress,
} from './chunks'
import { readIndexRow } from './storage'

type JSZipConstructor = typeof import('jszip')
let localZip: Promise<JSZipConstructor> | undefined

function loadLocalZip() {
  localZip ??= new Promise<JSZipConstructor>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/libs/jszip.min.js'
    script.onload = () => {
      script.remove()
      const JSZip = (window as Window & { JSZip?: JSZipConstructor }).JSZip
      if (JSZip) resolve(JSZip)
      else reject(Error('The local ZIP library did not initialize.'))
    }
    script.onerror = () => {
      script.remove()
      reject(
        Error(
          'The local ZIP library could not load. Open DocReady online once to cache it.',
        ),
      )
    }
    document.head.append(script)
  }).catch((error) => {
    localZip = undefined
    throw error
  })
  return localZip
}

const MAX_MANIFEST_BYTES = LEGACY_RECORD_MAX_BYTES
const FORMAT = 'docready-vault-zip-v1'
type BackupFile = Entry & { path: string; chunked?: true }
type Manifest = {
  format: typeof FORMAT
  folders: CustomFolder[]
  files: BackupFile[]
}

function buildPaths(custom: CustomFolder[], root: string, encrypted: boolean) {
  const details = folderMap(custom)
  const paths = new Map<Folder, string>()
  const reserved = new Set<string>()
  function unique(parent: string, name: string) {
    const slug = safeName(name)
    const suffix = slug.match(/\.[^.]{1,12}$/)?.[0] ?? ''
    const stem = suffix ? slug.slice(0, -suffix.length) : slug
    let path = parent + '/' + slug
    let i = 1
    while (reserved.has(path.toLowerCase()))
      path = parent + '/' + stem + ' (' + ++i + ')' + suffix
    reserved.add(path.toLowerCase())
    return path
  }
  function pathFor(folder: Folder): string {
    const cached = paths.get(folder)
    if (cached) return cached
    folderTrail(folder, details)
    const item = details.get(folder)
    const parent = item?.parent ? pathFor(item.parent) : root
    const tag = isCustomId(folder)
      ? folder.slice(7)
      : 'default-' + folders.indexOf(folder)
    const path = unique(parent, encrypted ? tag : (item?.name ?? folder))
    paths.set(folder, path)
    return path
  }
  for (const category of folders) pathFor(category)
  for (const folder of custom) pathFor(folder.id)
  return {
    paths,
    filePath: (entry: Entry) =>
      unique(pathFor(entry.folder), encrypted ? entry.id + '.enc' : entry.name),
  }
}

export async function writeZip(
  header: Header,
  key: CryptoKey,
  entries: Entry[],
  custom: CustomFolder[],
  encrypted: boolean,
  signal: AbortSignal,
  progress: VaultProgress,
  writable?: WritableStream<Uint8Array<ArrayBuffer>>,
) {
  const root = 'DocReady_Backup_' + new Date().toISOString().slice(0, 10)
  const { paths, filePath } = buildPaths(custom, root, encrypted)
  const streaming =
    writable &&
    new ZipWriter(writable, {
      useWebWorkers: false,
      level: 0,
      preventClose: true,
    })
  const JSZip = streaming ? undefined : await loadLocalZip()
  const zip = JSZip && new JSZip()
  const manifest: Manifest = { format: FORMAT, folders: custom, files: [] }
  const addBlob = async (path: string, content: Blob) => {
    signal.throwIfAborted()
    if (streaming)
      await streaming.add(path, new BlobReader(content), { signal, level: 0 })
    else zip!.file(path, content, { compression: 'STORE' })
  }
  for (const path of paths.values()) {
    signal.throwIfAborted()
    if (streaming)
      await streaming.add(path + '/', undefined, { directory: true, signal })
    else zip!.folder(path)
  }
  for (const [index, entry] of entries.entries()) {
    const row = await readIndexRow(entry.id, signal)
    const path = filePath(entry)
    const stream = fileStream(key, row, entry, signal, encrypted)
    const label = 'Packaging file ' + (index + 1) + ' of ' + entries.length
    const total = encrypted ? row.size : entry.size
    progress(label, (index / Math.max(1, entries.length)) * 0.95)
    if (streaming) {
      await streaming.add(
        path,
        { readable: stream, size: total },
        {
          signal,
          level: 0,
          onprogress: (loaded) =>
            progress(
              label,
              ((index + Math.min(1, loaded / total)) /
                Math.max(1, entries.length)) *
                0.95,
            ),
        },
      )
    } else {
      await addBlob(path, await boundedBlob(stream, 'application/octet-stream'))
    }
    manifest.files.push({
      ...entry,
      path,
      ...(encrypted && row.chunked ? { chunked: true } : {}),
    })
  }
  const data = encrypted
    ? await sealJson(key, 'zip-manifest', manifest)
    : new Blob([JSON.stringify(manifest)], { type: 'application/json' })
  if (data.size > MAX_MANIFEST_BYTES)
    throw Error('This archive has too much metadata to export as one ZIP.')
  if (encrypted) {
    await addBlob(root + '/manifest.enc', data)
    await addBlob(
      root + '/manifest.json',
      new Blob(
        [
          JSON.stringify({
            format: FORMAT,
            encrypted: true,
            header,
          }),
        ],
        { type: 'application/json' },
      ),
    )
  } else await addBlob(root + '/manifest.json', data)
  progress('Finalizing the ZIP archive', 0.96)
  if (streaming) {
    await streaming.close()
    signal.throwIfAborted()
    await writable!.close()
    progress('Backup prepared', 1)
    return
  }
  return zip!.generateAsync(
    { type: 'blob', compression: 'STORE', streamFiles: true },
    ({ percent }) => {
      signal.throwIfAborted()
      progress('Finalizing the ZIP archive', 0.96 + percent * 0.0004)
    },
  )
}

function validateManifest(
  value: unknown,
  root: string,
  existing: CustomFolder[],
): Manifest {
  const input = value as Partial<Manifest> | null
  if (
    !input ||
    input.format !== FORMAT ||
    !Array.isArray(input.folders) ||
    !Array.isArray(input.files)
  )
    throw Error('This ZIP does not contain a supported DocReady manifest.')
  const custom = input.folders.map(checkFolder)
  const ids = new Set<Folder>()
  for (const folder of custom) {
    if (ids.has(folder.id))
      throw Error('The backup lists a folder more than once.')
    ids.add(folder.id)
  }
  const map = folderMap([...custom, ...existing])
  for (const folder of custom) folderTrail(folder.id, map)
  const claimed = new Set<string>()
  const usedPaths = new Set<string>()
  const files = input.files.map((item) => {
    const entry = checkMetadata(item)
    if (
      !validId(item.id) ||
      claimed.has(item.id) ||
      typeof item.path !== 'string' ||
      !item.path.startsWith(root + '/') ||
      usedPaths.has(item.path.toLowerCase()) ||
      item.path
        .split('/')
        .some(
          (piece) =>
            !piece || piece === '.' || piece === '..' || piece.includes('\\'),
        ) ||
      item.path === root + '/manifest.json' ||
      item.path === root + '/manifest.enc' ||
      (item.chunked !== undefined && item.chunked !== true)
    )
      throw Error('The backup contains an invalid file reference.')
    folderTrail(entry.folder, map)
    claimed.add(item.id)
    usedPaths.add(item.path.toLowerCase())
    return { ...entry, id: item.id, path: item.path, chunked: item.chunked }
  })
  return { format: FORMAT, folders: custom, files }
}

const openOptions = { useWebWorkers: false, checkSignature: true }

function entryStream(entry: FileEntry, signal: AbortSignal) {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const task = entry.getData(writable, { ...openOptions, signal })
  void task.catch(() => {})
  return { readable, task }
}

async function readControl(
  entry: FileEntry,
  limit: number,
  signal: AbortSignal,
) {
  if (entry.uncompressedSize > limit)
    throw Error('The ZIP manifest exceeds the safe metadata size.')
  const { readable, task } = entryStream(entry, signal)
  const reader = readable.getReader()
  const parts: Blob[] = []
  let size = 0
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      size += item.value.length
      if (size > limit || size > entry.uncompressedSize)
        throw Error('The ZIP manifest has an invalid length.')
      parts.push(new Blob([new Uint8Array(item.value)]))
    }
    await task
    if (size !== entry.uncompressedSize)
      throw Error('The ZIP manifest is incomplete.')
    return new Blob(parts)
  } finally {
    await reader.cancel().catch(() => {})
    await task.catch(() => {})
    reader.releaseLock()
  }
}

function decryptBackupStream(
  input: ReadableStream<Uint8Array>,
  item: BackupFile,
  key: CryptoKey,
  signal: AbortSignal,
) {
  const reader = input.getReader()
  let remaining = item.size
  let carry: Uint8Array | undefined
  let offset = 0
  let part = 0
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(controller) {
        try {
          signal.throwIfAborted()
          const plainSize = item.chunked
            ? Math.min(CHUNK_BYTES, remaining)
            : remaining
          if (!plainSize) {
            if ((carry && offset < carry.length) || !(await reader.read()).done)
              throw Error('An encrypted backup file has trailing data.')
            controller.close()
            return
          }
          const bytes = new Uint8Array(plainSize + 28)
          for (let written = 0; written < bytes.length;) {
            if (!carry || offset === carry.length) {
              const next = await reader.read()
              if (next.done)
                throw Error('An encrypted backup file is incomplete.')
              carry = next.value
              offset = 0
            }
            const length = Math.min(
              carry.length - offset,
              bytes.length - written,
            )
            bytes.set(carry.subarray(offset, offset + length), written)
            offset += length
            written += length
          }
          const plain = await openPart(
            key,
            item,
            part++,
            new Blob([bytes]),
            !!item.chunked,
          )
          remaining -= plainSize
          controller.enqueue(plain)
        } catch (error) {
          await reader.cancel(error).catch(() => {})
          throw error
        }
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => {})
      },
    },
    { highWaterMark: 0 },
  )
}

export async function readZip(
  archive: Blob,
  password: string,
  signal: AbortSignal,
  staged: Map<string, string>,
  existingIds: Set<string>,
  existingFolders: CustomFolder[],
  destination?: { key: CryptoKey; header: Header },
  progress?: VaultProgress,
) {
  const reader = new ZipReader(new BlobReader(archive), {
    useWebWorkers: false,
  })
  try {
    const entries = new Map<string, FileEntry>()
    let control: FileEntry | undefined
    for await (const entry of reader.getEntriesGenerator()) {
      signal.throwIfAborted()
      if (entry.directory) continue
      if (entries.has(entry.filename) || entry.encrypted)
        throw Error(
          'This ZIP has duplicate paths or uses an unsupported ZIP password.',
        )
      entries.set(entry.filename, entry)
      if (
        /^DocReady_Backup_\d{4}-\d{2}-\d{2}\/manifest\.json$/.test(
          entry.filename,
        )
      ) {
        if (control)
          throw Error('This ZIP contains more than one DocReady manifest.')
        control = entry
      }
    }
    if (!control) throw Error('Choose a ZIP backup exported by DocReady.')
    const root = control.filename.slice(0, -'/manifest.json'.length)
    const envelope = JSON.parse(
      await (await readControl(control, MAX_MANIFEST_BYTES, signal)).text(),
    ) as {
      encrypted?: boolean
      format?: string
      header?: unknown
    } | null
    if (envelope?.format !== FORMAT)
      throw Error('This ZIP has an unsupported manifest.')
    let source: { key: CryptoKey; header: Header } | undefined
    let raw: unknown = envelope
    if (envelope.encrypted === true) {
      const header = readHeader(envelope.header)
      const key = await unlockKey(header, password)
      const protectedIndex = entries.get(root + '/manifest.enc')
      if (!protectedIndex)
        throw Error('The encrypted backup manifest is missing.')
      raw = await openJson(
        key,
        'zip-manifest',
        await readControl(protectedIndex, MAX_MANIFEST_BYTES, signal),
      )
      source = { header, key }
    }
    const layout = validateManifest(raw, root, existingFolders)
    const target = destination ?? source ?? (await createKey(password))
    const records: IndexRow[] = []
    let skipped = 0
    for (const [index, item] of layout.files.entries()) {
      signal.throwIfAborted()
      const archived = entries.get(item.path)
      if (
        !archived ||
        (!source && item.chunked) ||
        (source && !item.chunked && item.size > LEGACY_RECORD_MAX_BYTES) ||
        archived.uncompressedSize !==
          (source ? encryptedSize(item.size, !!item.chunked) : item.size)
      )
        throw Error('A backup file is missing or has an invalid length.')
      if (existingIds.has(item.id)) {
        skipped++
        continue
      }
      const label =
        'Restoring file ' + (index + 1) + ' of ' + layout.files.length
      progress?.(label, (index / layout.files.length) * 0.95)
      const { readable, task } = entryStream(archived, signal)
      const stream = source
        ? decryptBackupStream(readable, item, source.key, signal)
        : readable
      const { id, path: _path, chunked: _chunked, ...details } = item
      try {
        records.push(
          await stageFile(
            target.key,
            id,
            stream,
            details,
            staged,
            signal,
            (fraction) =>
              progress?.(
                label,
                ((index + fraction) / layout.files.length) * 0.95,
              ),
          ),
        )
        await task
      } catch (error) {
        await stream.cancel().catch(() => {})
        await task.catch(() => {})
        throw error
      }
    }
    progress?.('Saving encrypted folders and files', 0.97)
    return { ...target, records, skipped, folders: layout.folders }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'OperationError')
      throw Error(
        'The encrypted ZIP failed its integrity check. No files were imported.',
      )
    throw error
  } finally {
    await reader.close()
  }
}
