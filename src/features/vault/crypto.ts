export const folders = [
  'Govt IDs',
  'Education',
  'Finance & Bills',
  'Medical',
  'Personal',
  'Scanned Docs',
  'ID Cards',
] as const
export type DefaultFolder = (typeof folders)[number]
export type CustomId = `custom:${string}`
export type Folder = DefaultFolder | CustomId
export const folderColors = [
  'indigo',
  'violet',
  'amber',
  'coral',
  'teal',
  'blue',
] as const
export const folderSymbols = [
  'folder',
  'card',
  'education',
  'receipt',
  'heart',
  'briefcase',
] as const
export type CustomFolder = {
  id: CustomId
  name: string
  color: (typeof folderColors)[number]
  icon: (typeof folderSymbols)[number]
  parent: Folder | null
}
export const CHUNK_BYTES = 2 * 1024 ** 2
export const MEMORY_DOWNLOAD_BYTES = 48 * 1024 ** 2
export function isCustomId(id: unknown): id is CustomId {
  return (
    typeof id === 'string' && id.startsWith('custom:') && validId(id.slice(7))
  )
}
export function isFolder(id: unknown): id is Folder {
  return folders.some((folder) => folder === id) || isCustomId(id)
}
export function checkFolder(value: unknown): CustomFolder {
  const folder = value as Partial<CustomFolder> | null
  if (
    !folder ||
    !isCustomId(folder.id) ||
    typeof folder.name !== 'string' ||
    !folder.name.trim() ||
    folder.name.length > 100 ||
    !folderColors.some((color) => color === folder.color) ||
    !folderSymbols.some((icon) => icon === folder.icon) ||
    (folder.parent !== null && !isFolder(folder.parent))
  )
    throw Error('A custom vault folder is invalid.')
  return {
    id: folder.id,
    name: folder.name,
    color: folder.color,
    icon: folder.icon,
    parent: folder.parent,
  } as CustomFolder
}
export function folderTrail(
  id: Folder,
  custom: ReadonlyMap<Folder, CustomFolder>,
): string[] {
  const trail: string[] = []
  const seen = new Set<Folder>()
  let next: Folder | null = id
  while (next !== null) {
    if (seen.has(next)) throw Error('A vault folder has a circular path.')
    seen.add(next)
    if (!isCustomId(next)) {
      trail.push(next)
      break
    }
    const folder: CustomFolder | undefined = custom.get(next)
    if (!folder) throw Error('A vault folder is missing its parent.')
    trail.push(folder.name)
    next = folder.parent
  }
  return trail.reverse()
}
export function folderMap(custom: CustomFolder[]) {
  return new Map<Folder, CustomFolder>(
    custom.map((folder) => [folder.id, folder]),
  )
}
export function encryptedSize(size: number, chunked: boolean) {
  return size + 28 * (chunked ? Math.ceil(size / CHUNK_BYTES) : 1)
}
// V1 records and .vault backups used a whole-file AES operation. Keep these
// bounds only while importing records made by the earlier vault release.
export const LEGACY_RECORD_MAX_BYTES = 32 * 1024 ** 2
export const LEGACY_VAULT_MAX_BYTES = 256 * 1024 ** 2
export const LEGACY_RECORD_COUNT = 250
export const MAX_TEXT = 32_000
export const MAX_META_BYTES = MAX_TEXT * 4 + 4096 + 28
const ITERATIONS = 600_000
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const proof = 'DocReady vault password check v1'
export type Header = { version: 1; salt: string; proof: string }
export type Metadata = {
  name: string
  mime: string
  folder: Folder
  tags: string[]
  text: string
  size: number
  added: number
}
export type Entry = Metadata & { id: string }
export type IndexRow = { id: string; meta: Blob; size: number; chunked?: true }
export type RecordRow = IndexRow & { content: Blob }

export function validId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)
}

function fromBase64(text: string, size: number) {
  if (text.length !== Math.ceil(size / 3) * 4)
    throw Error('Invalid vault header.')
  const value = Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
  if (value.byteLength !== size) throw Error('Invalid vault header.')
  return value
}

export function readHeader(input: unknown): Header {
  const header = input as Partial<Header> | null
  if (
    !header ||
    header.version !== 1 ||
    typeof header.salt !== 'string' ||
    typeof header.proof !== 'string'
  )
    throw Error('Unsupported or damaged vault header.')
  fromBase64(header.salt, 16)
  fromBase64(header.proof, encoder.encode(proof).length + 28)
  return { version: 1, salt: header.salt, proof: header.proof }
}

async function derive(secret: string, salt: Uint8Array<ArrayBuffer>) {
  if (!globalThis.crypto?.subtle)
    throw Error('The vault requires HTTPS and Web Crypto.')
  if (!secret || secret.length > 256)
    throw Error('Enter a valid vault password.')
  const bytes = encoder.encode(secret)
  try {
    const base = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, [
      'deriveKey',
    ])
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  } finally {
    bytes.fill(0)
  }
}

function algorithm(iv: Uint8Array<ArrayBuffer>, purpose: string) {
  return {
    name: 'AES-GCM',
    iv,
    additionalData: encoder.encode('docready-vault:v1:' + purpose),
    tagLength: 128,
  }
}

export async function seal(
  key: CryptoKey,
  purpose: string,
  plain: ArrayBuffer | Uint8Array<ArrayBuffer>,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(algorithm(iv, purpose), key, plain)
  return new Blob([iv, cipher])
}

export async function unseal(key: CryptoKey, purpose: string, cipher: Blob) {
  if (cipher.size < 28 || cipher.size > LEGACY_RECORD_MAX_BYTES + 28)
    throw Error('Invalid encrypted data length.')
  const bytes = new Uint8Array(await cipher.arrayBuffer())
  return crypto.subtle.decrypt(
    algorithm(bytes.subarray(0, 12), purpose),
    key,
    bytes.subarray(12),
  )
}

export async function sealJson(key: CryptoKey, purpose: string, value: object) {
  const bytes = encoder.encode(JSON.stringify(value))
  try {
    return await seal(key, purpose, bytes)
  } finally {
    bytes.fill(0)
  }
}

export async function openJson(
  key: CryptoKey,
  purpose: string,
  cipher: Blob,
): Promise<unknown> {
  const bytes = new Uint8Array(await unseal(key, purpose, cipher))
  try {
    return JSON.parse(decoder.decode(bytes)) as unknown
  } finally {
    bytes.fill(0)
  }
}

export async function createKey(secret: string) {
  if (!(/^\d{8,}$/.test(secret) || secret.length >= 12))
    throw Error(
      'Use an 8-digit or longer PIN, or a password of at least 12 characters.',
    )
  if (/^\s*$/.test(secret))
    throw Error('Choose a password with visible characters.')
  if (!globalThis.crypto?.subtle)
    throw Error('The vault requires HTTPS and Web Crypto.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await derive(secret, salt)
  const check = await seal(key, 'check', encoder.encode(proof))
  const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
  const header: Header = {
    version: 1,
    salt: base64(salt),
    proof: base64(new Uint8Array(await check.arrayBuffer())),
  }
  return { header, key }
}

export async function unlockKey(header: Header, secret: string) {
  const key = await derive(secret, fromBase64(header.salt, 16))
  try {
    const data = await unseal(
      key,
      'check',
      new Blob([fromBase64(header.proof, encoder.encode(proof).length + 28)]),
    )
    if (decoder.decode(data) === proof) return key
  } catch {
    // A wrong key and damaged ciphertext are deliberately indistinguishable.
  }
  throw Error('The password is incorrect or the vault header is damaged.')
}

export function checkMetadata(value: unknown): Metadata {
  const m = value as Partial<Metadata> | null
  if (
    !m ||
    typeof m.name !== 'string' ||
    !m.name.trim() ||
    m.name.length > 126 ||
    typeof m.mime !== 'string' ||
    m.mime.length > 128 ||
    !isFolder(m.folder) ||
    !Array.isArray(m.tags) ||
    m.tags.length > 12 ||
    m.tags.some(
      (tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 32,
    ) ||
    typeof m.text !== 'string' ||
    m.text.length > MAX_TEXT ||
    typeof m.size !== 'number' ||
    !Number.isSafeInteger(m.size) ||
    m.size < 1 ||
    typeof m.added !== 'number' ||
    !Number.isSafeInteger(m.added) ||
    m.added < 0 ||
    m.added > 8.64e15
  )
    throw Error('A vault record has invalid encrypted metadata.')
  return {
    name: m.name,
    mime: m.mime,
    folder: m.folder,
    tags: m.tags,
    text: m.text,
    size: m.size,
    added: m.added,
  }
}

export async function openMetadata(key: CryptoKey, row: IndexRow) {
  if (
    !validId(row.id) ||
    !(row.meta instanceof Blob) ||
    row.meta.size > MAX_META_BYTES
  )
    throw Error('A vault record is damaged.')
  const details = checkMetadata(await openJson(key, 'meta:' + row.id, row.meta))
  if (
    (!row.chunked && details.size > LEGACY_RECORD_MAX_BYTES) ||
    encryptedSize(details.size, !!row.chunked) !== row.size
  )
    throw Error('A vault record has an invalid file length.')
  return { ...details, id: row.id }
}

export async function encryptRecord(
  key: CryptoKey,
  id: string,
  blob: Blob,
  metadata: Metadata,
): Promise<RecordRow> {
  if (blob.size !== metadata.size)
    throw Error('The file changed while it was being saved.')
  const details = await sealJson(key, 'meta:' + id, checkMetadata(metadata))
  if (details.size > MAX_META_BYTES)
    throw Error('This file has too much index text to save.')
  const bytes = await blob.arrayBuffer()
  try {
    const content = await seal(key, 'file:' + id, bytes)
    return { id, meta: details, size: content.size, content }
  } finally {
    new Uint8Array(bytes).fill(0)
  }
}
