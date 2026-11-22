import {
  isCustomId,
  readHeader,
  type Header,
  type IndexRow,
  type RecordRow,
  type CustomId,
  type Folder,
} from './crypto'

const DB_NAME = 'docready-encrypted-vault'
const stores = [
  'config',
  'index',
  'files',
  'chunks',
  'staging',
  'folders',
] as const
export type FolderRow = { id: CustomId; data: Blob }
type Staged = { id: string; updated: number; token: string }

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) {
        request.result.createObjectStore('config')
        request.result.createObjectStore('index', { keyPath: 'id' })
        request.result.createObjectStore('files')
      }
      request.result.createObjectStore('chunks')
      request.result.createObjectStore('staging', { keyPath: 'id' })
      request.result.createObjectStore('folders', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      request.onsuccess = () => request.result.close()
      reject(Error('Close other vault tabs and try again.'))
    }
  })
}

function result<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(
  mode: IDBTransactionMode,
  signal: AbortSignal | undefined,
  run: (tx: IDBTransaction) => Promise<T>,
  scope: readonly (typeof stores)[number][] = stores,
) {
  signal?.throwIfAborted()
  const db = await database()
  try {
    signal?.throwIfAborted()
    const tx = db.transaction(scope, mode)
    const complete = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () =>
        reject(
          tx.error ??
            signal?.reason ??
            Error('The vault transaction was cancelled.'),
        )
    })
    void complete.catch(() => {})
    const abort = () => {
      try {
        tx.abort()
      } catch {
        /* Already committed or aborted. */
      }
    }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const value = await run(tx)
      await complete
      return value
    } catch (error) {
      abort()
      await complete.catch(() => {})
      if ((error as DOMException)?.name === 'QuotaExceededError')
        throw Error(
          'This browser is out of storage. Free up space and try again.',
        )
      throw error
    } finally {
      signal?.removeEventListener('abort', abort)
    }
  } finally {
    db.close()
  }
}

export function currentHeader() {
  return transaction('readonly', undefined, async (tx) => {
    const stored = (await result(
      tx.objectStore('config').get('header'),
    )) as unknown
    return stored === undefined ? null : readHeader(stored)
  })
}

export function indexRows(signal: AbortSignal) {
  return transaction('readonly', signal, (tx) =>
    result<IndexRow[]>(tx.objectStore('index').getAll()),
  )
}

export function readIndexRow(id: string, signal: AbortSignal) {
  return transaction(
    'readonly',
    signal,
    async (tx) => {
      const row = await result<IndexRow | undefined>(
        tx.objectStore('index').get(id),
      )
      if (!row) throw Error('This file is no longer in the vault.')
      return row
    },
    ['index'],
  )
}

export function readContent(id: string, signal: AbortSignal) {
  return transaction('readonly', signal, async (tx) => {
    const blob = await result<Blob | undefined>(tx.objectStore('files').get(id))
    if (!(blob instanceof Blob))
      throw Error('Encrypted file content is missing.')
    return blob
  })
}

function chunkRange(id: string) {
  return IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])
}

export function readChunk(id: string, part: number, signal: AbortSignal) {
  return transaction(
    'readonly',
    signal,
    async (tx) => {
      const data = await result<Blob | undefined>(
        tx.objectStore('chunks').get([id, part]),
      )
      if (!(data instanceof Blob))
        throw Error('An encrypted file chunk is missing.')
      return data
    },
    ['chunks'],
  )
}

export function beginStaging(id: string, token: string, signal: AbortSignal) {
  return transaction(
    'readwrite',
    signal,
    async (tx) => {
      if (await result(tx.objectStore('index').getKey(id)))
        throw Error('This file is already in the vault.')
      await result(
        tx.objectStore('staging').add({ id, token, updated: Date.now() }),
      )
    },
    ['index', 'staging'],
  )
}

export function writeChunk(
  id: string,
  token: string,
  part: number,
  data: Blob,
  signal: AbortSignal,
) {
  return transaction(
    'readwrite',
    signal,
    async (tx) => {
      const stages = tx.objectStore('staging')
      const stage: Staged | undefined = await result(stages.get(id))
      if (stage?.token !== token) throw Error('This save was interrupted.')
      tx.objectStore('chunks').add(data, [id, part])
      stages.put({ ...stage, updated: Date.now() })
    },
    ['chunks', 'staging'],
  )
}

export function discardStaging(
  records: ReadonlyMap<string, string>,
  expiredBefore?: number,
) {
  return transaction(
    'readwrite',
    undefined,
    async (tx) => {
      const stages = tx.objectStore('staging')
      const candidates: Staged[] =
        expiredBefore === undefined
          ? (
              await Promise.all(
                [...records.keys()].map((id) =>
                  result<Staged | undefined>(stages.get(id)),
                ),
              )
            ).filter((stage): stage is Staged => !!stage)
          : await result(stages.getAll())
      for (const stage of candidates) {
        if (
          expiredBefore === undefined
            ? records.get(stage.id) !== stage.token
            : stage.updated >= expiredBefore
        )
          continue
        tx.objectStore('chunks').delete(chunkRange(stage.id))
        stages.delete(stage.id)
      }
    },
    ['chunks', 'staging'],
  )
}

async function revision(tx: IDBTransaction) {
  const stored: number | undefined = await result(
    tx.objectStore('config').get('revision'),
  )
  return stored ?? 0
}

async function nextRevision(tx: IDBTransaction, expected?: number) {
  const actual = await revision(tx)
  if (expected !== undefined && actual !== expected)
    throw Error(
      'Files or folders changed during this operation. Refresh this vault and try again.',
    )
  tx.objectStore('config').put(actual + 1, 'revision')
}

async function requireFolder(tx: IDBTransaction, folder?: Folder) {
  if (
    isCustomId(folder) &&
    !(await result(tx.objectStore('folders').getKey(folder)))
  )
    throw Error(
      'The destination folder was removed. Choose a different folder.',
    )
}

export function readStructure(signal: AbortSignal) {
  return transaction(
    'readonly',
    signal,
    async (tx) => {
      const [rows, storedFolders, version] = await Promise.all([
        result<IndexRow[]>(tx.objectStore('index').getAll()),
        result<FolderRow[]>(tx.objectStore('folders').getAll()),
        revision(tx),
      ])
      return { rows, storedFolders, version }
    },
    ['folders', 'index', 'config'],
  )
}

export function changeFolders(
  updates: FolderRow[],
  deleted: CustomId | null,
  relocated: { id: string; meta: Blob }[],
  version: number,
  signal: AbortSignal,
) {
  return transaction(
    'readwrite',
    signal,
    async (tx) => {
      await nextRevision(tx, version)
      const folders = tx.objectStore('folders')
      const index = tx.objectStore('index')
      for (const folder of updates) folders.put(folder)
      if (deleted) folders.delete(deleted)
      for (const { id, meta } of relocated) {
        const row: IndexRow | undefined = await result(index.get(id))
        if (row) index.put({ ...row, meta })
      }
    },
    ['folders', 'index', 'config'],
  )
}

export function insertRecords(
  header: Header,
  rows: (IndexRow | RecordRow)[],
  signal: AbortSignal,
  initialize = false,
  additions: FolderRow[] = [],
  staged: ReadonlyMap<string, string> = new Map(),
  options?: { requiredFolder?: Folder; revision?: number },
) {
  return transaction('readwrite', signal, async (tx) => {
    const config = tx.objectStore('config')
    const previous = await result<Header | undefined>(config.get('header'))
    const index = tx.objectStore('index')
    if (initialize ? previous !== undefined : previous?.proof !== header.proof)
      throw Error('The vault changed in another tab. Reopen it and try again.')
    await requireFolder(tx, options?.requiredFolder)
    await nextRevision(tx, options?.revision)
    if (initialize) config.add(header, 'header')
    const folders = tx.objectStore('folders')
    const stages = tx.objectStore('staging')
    for (const item of additions)
      if (!(await result(folders.getKey(item.id)))) folders.add(item)
    let inserted = 0
    for (const row of rows) {
      if (await result(index.getKey(row.id))) continue
      if ('content' in row) {
        const { content, ...item } = row
        index.add(item)
        tx.objectStore('files').add(content, row.id)
      } else {
        const stage: Staged | undefined = await result(stages.get(row.id))
        if (!stage || stage.token !== staged.get(row.id))
          throw Error('An encrypted file staging record is missing.')
        index.add(row)
        stages.delete(row.id)
      }
      inserted++
    }
    return inserted
  })
}

export function changeRecord(
  id: string,
  meta: Blob | null,
  signal: AbortSignal,
  folder?: Folder,
) {
  return transaction('readwrite', signal, async (tx) => {
    await requireFolder(tx, folder)
    await nextRevision(tx)
    const index = tx.objectStore('index')
    const row = await result<IndexRow | undefined>(index.get(id))
    if (!row) throw Error('This file is no longer in the vault.')
    if (meta) index.put({ ...row, meta })
    else {
      index.delete(id)
      if (row.chunked) tx.objectStore('chunks').delete(chunkRange(id))
      else tx.objectStore('files').delete(id)
    }
  })
}
