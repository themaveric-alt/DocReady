import { guardedUnlock } from './unlockGuard'
import { create } from 'zustand'
import { safeName, type Output } from '../../lib/files'
import {
  createKey,
  checkFolder,
  folderMap,
  folderTrail,
  folders,
  MEMORY_DOWNLOAD_BYTES,
  openJson,
  type CustomFolder,
  type CustomId,
  openMetadata,
  sealJson,
  unlockKey,
  type Entry,
  type Folder,
  type Header,
  type Metadata,
} from './crypto'
import {
  changeRecord,
  currentHeader,
  indexRows,
  insertRecords,
  changeFolders,
  discardStaging,
  readStructure,
  readIndexRow,
} from './storage'
import {
  boundedBlob,
  fileStream,
  stageFile,
  type VaultProgress,
} from './chunks'
import {
  chooseOutput,
  deviceEstimate,
  requestProtection,
  saveVaultDownload,
  type StorageStatus,
} from './device'

type Session = {
  key: CryptoKey
  header: Header
  controller: AbortController
}
type VaultState = {
  header: Header | null | undefined
  unlocked: boolean
  entries: Entry[]
  customFolders: CustomFolder[]
  protection: StorageStatus
  estimate: Awaited<ReturnType<typeof deviceEstimate>>
  encryptedBytes: number
  pending: Output | null
  pendingKey: number
  notice: string
}

let active: Session | undefined
let stopWatching: (() => void) | undefined
let activation = 0
export const VAULT_IDLE_MS = 3 * 60 * 1000
const idle = VAULT_IDLE_MS

export const useVault = create<VaultState>(() => ({
  header: undefined,
  unlocked: false,
  entries: [],
  customFolders: [],
  protection: 'checking',
  estimate: null,
  encryptedBytes: 0,
  pending: null,
  pendingKey: 0,
  notice: '',
}))

const update = useVault.setState

let fileQueue: Output[] = []
export function queueVaultFiles(files: Output[]) {
  fileQueue = files.slice(1)
  update((state) => ({
    pending: files[0] ?? null,
    pendingKey: state.pendingKey + 1,
    notice: '',
  }))
}
export function queueVaultFile(file: Output | null) {
  queueVaultFiles(file ? [file] : [])
}

export async function discoverVault() {
  const generation = activation
  const header = await currentHeader()
  if (!active && generation === activation) update({ header })
  return header
}

function requireSession() {
  if (!active) throw Error('Unlock the vault first.')
  active.controller.signal.throwIfAborted()
  return active
}

export function vaultSignal() {
  return requireSession().controller.signal
}

export function lockVault() {
  activation++
  active?.controller.abort(Error('The vault was locked.'))
  active = undefined
  fileQueue = []
  stopWatching?.()
  stopWatching = undefined
  update({
    unlocked: false,
    entries: [],
    customFolders: [],
    protection: 'checking',
    estimate: null,
    encryptedBytes: 0,
    pending: null,
    notice: '',
  })
}

function watchSession() {
  stopWatching?.()
  let last = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  function check() {
    clearTimeout(timer)
    const remaining = idle - (Date.now() - last)
    if (remaining <= 0) lockVault()
    else timer = setTimeout(check, remaining)
  }
  function activity() {
    if (Date.now() - last >= idle) lockVault()
    else {
      last = Date.now()
      check()
    }
  }
  const events = ['pointerdown', 'keydown', 'input', 'wheel'] as const
  for (const event of events) window.addEventListener(event, activity, true)
  document.addEventListener('visibilitychange', check)
  window.addEventListener('pagehide', lockVault)
  check()
  stopWatching = () => {
    clearTimeout(timer)
    for (const event of events)
      window.removeEventListener(event, activity, true)
    document.removeEventListener('visibilitychange', check)
    window.removeEventListener('pagehide', lockVault)
  }
}

async function readIndex(key: CryptoKey, signal: AbortSignal) {
  const { rows, storedFolders, version } = await readStructure(signal)
  const customFolders: CustomFolder[] = []
  for (const row of storedFolders) {
    signal.throwIfAborted()
    const folder = checkFolder(
      await openJson(key, 'folder:' + row.id, row.data),
    )
    if (folder.id !== row.id) throw Error('A vault folder is damaged.')
    customFolders.push(folder)
  }
  const map = folderMap(customFolders)
  for (const folder of customFolders) folderTrail(folder.id, map)
  const entries: Entry[] = []
  for (const row of rows) {
    signal.throwIfAborted()
    entries.push(await openMetadata(key, row))
  }
  signal.throwIfAborted()
  entries.sort((a, b) => b.added - a.added)
  return {
    entries,
    customFolders,
    version,
    encryptedBytes: rows.reduce(
      (sum, row) => sum + row.size + row.meta.size,
      storedFolders.reduce((total, folder) => total + folder.data.size, 0),
    ),
  }
}

async function startSession(
  header: Header,
  key: CryptoKey,
  generation: number,
  signal: AbortSignal,
) {
  const index = await readIndex(key, signal)
  if (activation !== generation || active)
    throw Error('This vault operation was superseded.')
  active = { header, key, controller: new AbortController() }
  update({ header, ...index, unlocked: true, notice: '' })
  watchSession()
  void refreshProtection()
  void refreshEstimate()
  void discardStaging(new Map(), Date.now() - 24 * 60 * 60 * 1000)
    .then(refreshEstimate)
    .catch(() => {})
}

export async function authenticate(
  secret: string,
  createNew: boolean,
  signal: AbortSignal,
) {
  if (active) return
  const generation = ++activation
  const header = await discoverVault()
  signal.throwIfAborted()
  if (createNew !== (header === null))
    throw Error('The vault changed. Try the form again.')
  if (header) {
    const key = await guardedUnlock(() => unlockKey(header, secret))
    await startSession(header, key, generation, signal)
  } else {
    const created = await createKey(secret)
    signal.throwIfAborted()
    if (activation !== generation || active)
      throw Error('This vault operation was superseded.')
    await insertRecords(created.header, [], signal, true)
    await startSession(created.header, created.key, generation, signal)
  }
}

export function cleanFields(name: string, folder: Folder, tags: string) {
  if (!name.trim()) throw Error('Enter a filename.')
  const list = [
    ...new Set(
      tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ]
  if (list.length > 12 || list.some((tag) => tag.length > 32))
    throw Error('Use up to 12 tags of 32 characters each.')
  return { name: safeName(name), folder, tags: list }
}

export async function refreshEstimate() {
  const session = active
  const estimate = await deviceEstimate()
  if (session && active === session) update({ estimate })
}

export async function refreshProtection() {
  const session = active
  const protection = await requestProtection()
  if (session && active === session) update({ protection })
}

async function reread(session: Session, signal: AbortSignal) {
  const state = await readIndex(session.key, signal)
  if (active === session && !signal.aborted) update(state)
  void refreshEstimate()
}

export async function saveVaultFile(
  blob: Blob,
  metadata: Omit<Metadata, 'added' | 'size'>,
  operation: AbortSignal,
  progress?: VaultProgress,
) {
  if (!blob.size) throw Error('Choose a file that contains data.')
  const session = requireSession()
  folderTrail(metadata.folder, folderMap(useVault.getState().customFolders))
  const signal = AbortSignal.any([session.controller.signal, operation])
  const id = crypto.randomUUID()
  const staged = new Map<string, string>()
  const added = Date.now()
  let storedBytes = 0
  try {
    const row = await stageFile(
      session.key,
      id,
      blob.stream(),
      {
        ...metadata,
        size: blob.size,
        added,
      },
      staged,
      signal,
      (fraction) => progress?.('Encrypting file', fraction),
    )
    await insertRecords(session.header, [row], signal, false, [], staged, {
      requiredFolder: metadata.folder,
    })
    storedBytes = row.size + row.meta.size
  } finally {
    if (staged.size) await discardStaging(staged).catch(() => {})
  }
  const state = useVault.getState()
  if (active !== session || signal.aborted) return
  update({
    entries: [{ ...metadata, id, size: blob.size, added }, ...state.entries],
    encryptedBytes: state.encryptedBytes + storedBytes,
    pending: fileQueue.shift() ?? null,
    pendingKey: state.pendingKey + 1,
    notice: 'File encrypted and saved to this device.',
  })
  void refreshEstimate()
}

async function encryptFolder(key: CryptoKey, folder: CustomFolder) {
  return {
    id: folder.id,
    data: await sealJson(key, 'folder:' + folder.id, folder),
  }
}

export async function saveFolder(
  fields: Omit<CustomFolder, 'id'>,
  current?: CustomId,
) {
  const session = requireSession()
  const signal = session.controller.signal
  const parent = fields.parent
  const folder = checkFolder({
    ...fields,
    name: fields.name.trim(),
    id: current ?? 'custom:' + crypto.randomUUID(),
  })
  const { customFolders, version } = await readIndex(session.key, signal)
  const map = folderMap(customFolders)
  if (current && !map.has(current))
    throw Error('This custom folder no longer exists.')
  const normalized = folder.name.normalize('NFKC').toLocaleLowerCase()
  const sibling = [...map.values()].some(
    (item) =>
      item.id !== folder.id &&
      item.parent === parent &&
      item.name.normalize('NFKC').toLocaleLowerCase() === normalized,
  )
  if (
    sibling ||
    (parent === null &&
      folders.some((name) => name.toLocaleLowerCase() === normalized))
  )
    throw Error('A folder with this name already exists here.')
  map.set(folder.id, folder)
  folderTrail(folder.id, map)
  await changeFolders(
    [await encryptFolder(session.key, folder)],
    null,
    [],
    version,
    signal,
  )
  await reread(session, signal)
}

export async function deleteFolder(selected: CustomFolder) {
  const session = requireSession()
  const signal = session.controller.signal
  const { entries, customFolders, version } = await readIndex(
    session.key,
    signal,
  )
  const folder = customFolders.find((item) => item.id === selected.id)
  if (!folder) throw Error('This custom folder no longer exists.')
  const destination = folder.parent ?? 'Personal'
  const relocated = []
  for (const { id, ...entry } of entries.filter(
    (item) => item.folder === folder.id,
  )) {
    signal.throwIfAborted()
    relocated.push({
      id,
      meta: await sealJson(session.key, 'meta:' + id, {
        ...entry,
        folder: destination,
      }),
    })
  }
  const children = []
  const nameKey = (name: string) => name.normalize('NFKC').toLocaleLowerCase()
  const taken = new Set(
    customFolders
      .filter((item) => item.parent === destination && item.id !== folder.id)
      .map((item) => nameKey(item.name)),
  )
  for (const child of customFolders.filter(
    (item) => item.parent === folder.id,
  )) {
    let name = child.name
    let copy = 1
    while (taken.has(nameKey(name))) {
      const suffix = ' (' + ++copy + ')'
      name = child.name.slice(0, 100 - suffix.length) + suffix
    }
    taken.add(nameKey(name))
    children.push(
      await encryptFolder(session.key, { ...child, name, parent: destination }),
    )
  }
  await changeFolders(children, folder.id, relocated, version, signal)
  await reread(session, signal)
}

export async function modifyVaultFile(
  entry: Entry,
  change: Pick<Metadata, 'name' | 'folder' | 'tags'> | null,
) {
  const session = requireSession()
  const signal = session.controller.signal
  const { id, ...previous } = entry
  if (change)
    folderTrail(change.folder, folderMap(useVault.getState().customFolders))
  const encrypted = change
    ? await sealJson(session.key, 'meta:' + id, { ...previous, ...change })
    : null
  await changeRecord(id, encrypted, signal, change?.folder)
  await reread(session, signal)
}

export async function readVaultFile(entry: Entry, operation: AbortSignal) {
  if (entry.size > MEMORY_DOWNLOAD_BYTES)
    throw Error(
      'This file is too large for an in-browser preview. Use Download to save the original file.',
    )
  const { key, controller } = requireSession()
  const signal = AbortSignal.any([controller.signal, operation])
  const row = await readIndexRow(entry.id, signal)
  return boundedBlob(fileStream(key, row, entry, signal), entry.mime)
}

export async function downloadVaultFile(entry: Entry, operation: AbortSignal) {
  const { key, controller } = requireSession()
  const signal = AbortSignal.any([controller.signal, operation])
  if (entry.size <= MEMORY_DOWNLOAD_BYTES) {
    const blob = await readVaultFile(entry, operation)
    signal.throwIfAborted()
    saveVaultDownload(entry.name, blob)
    return
  }
  const output = await chooseOutput(entry.name)
  try {
    const row = await readIndexRow(entry.id, signal)
    await fileStream(key, row, entry, signal).pipeTo(output, { signal })
  } catch (error) {
    await output.abort().catch(() => {})
    throw error
  }
}

export async function exportVaultZip(
  encrypted: boolean,
  operation: AbortSignal,
  progress: VaultProgress,
) {
  const { key, header, controller } = requireSession()
  const signal = AbortSignal.any([operation, controller.signal])
  const { entries, customFolders } = useVault.getState()
  const stamp = new Date().toISOString().slice(0, 10)
  const name = 'DocReady_Backup_' + stamp + (encrypted ? '.vault.zip' : '.zip')
  const estimate = entries.reduce(
    (sum, item) => sum + item.size + item.text.length * 4 + 1800,
    customFolders.length * 1000,
  )
  const writable =
    estimate > MEMORY_DOWNLOAD_BYTES || entries.length > 60_000
      ? await chooseOutput(name)
      : undefined
  try {
    const { writeZip } = await import('./zipBackup')
    const blob = await writeZip(
      header,
      key,
      entries,
      customFolders,
      encrypted,
      signal,
      progress,
      writable,
    )
    signal.throwIfAborted()
    if (blob) saveVaultDownload(name, blob)
  } catch (error) {
    await writable?.abort().catch(() => {})
    throw error
  }
}

export async function restoreVault(
  file: File,
  password: string,
  operation: AbortSignal,
  progress?: VaultProgress,
) {
  const session = active
  const generation = ++activation
  const signal = session
    ? AbortSignal.any([session.controller.signal, operation])
    : operation
  const existing = await discoverVault()
  if (existing && !session)
    throw Error('Unlock this vault before importing into it.')
  const ids = new Set(
    (session ? await indexRows(signal) : []).map((row) => row.id),
  )
  if (file.name.toLowerCase().endsWith('.zip')) {
    const { readZip } = await import('./zipBackup')
    const staged = new Map<string, string>()
    try {
      const structure = session
        ? await readIndex(session.key, signal)
        : undefined
      const current = structure?.customFolders ?? []
      const existingIds = new Set(structure?.entries.map((entry) => entry.id))
      const backup = await readZip(
        file,
        password,
        signal,
        staged,
        existingIds,
        current,
        session,
        progress,
      )
      if (activation !== generation)
        throw Error('This vault operation was superseded.')
      const additions = []
      for (const folder of backup.folders) {
        signal.throwIfAborted()
        additions.push(await encryptFolder(backup.key, folder))
      }
      const inserted = await insertRecords(
        backup.header,
        backup.records,
        signal,
        !session,
        additions,
        staged,
        { revision: structure?.version },
      )
      if (session) await reread(session, signal)
      else await startSession(backup.header, backup.key, generation, signal)
      return {
        inserted,
        skipped: backup.skipped + backup.records.length - inserted,
      }
    } finally {
      if (staged.size) await discardStaging(staged).catch(() => {})
    }
  }
  const { readBackup } = await import('./backup')
  const backup = await readBackup(file, password, signal, session?.key, ids)
  if (activation !== generation)
    throw Error('This vault operation was superseded.')
  const inserted = await insertRecords(
    session?.header ?? backup.header,
    backup.records,
    signal,
    !session,
  )
  if (session) await reread(session, signal)
  else await startSession(backup.header, backup.key, generation, signal)
  return {
    inserted,
    skipped: backup.skipped + backup.records.length - inserted,
  }
}
