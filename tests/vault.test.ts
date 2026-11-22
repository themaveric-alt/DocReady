import { describe, expect, test } from 'vitest'
import {
  createKey,
  encryptRecord,
  openMetadata,
  unlockKey,
  unseal,
  type Metadata,
} from '../src/features/vault/crypto'
import { makeBackup, readBackup } from '../src/features/vault/backup'
import {
  searchText,
  searchWords,
  suggestFolder,
} from '../src/features/vault/organize'

const password = 'archive velvet mountain 2026'
const contents = 'Confidential practice document sample'
const metadata: Metadata = {
  name: 'Travel scan.txt',
  mime: 'text/plain',
  tags: ['Private tag'],
  folder: 'Govt IDs',
  text: contents,
  size: contents.length,
  added: 100,
}

describe('Encrypted Vault', () => {
  test('encrypts separate metadata and file records with fresh IVs and authenticated record IDs', async () => {
    const { key, header } = await createKey(password)
    const other = await createKey(password)
    expect(other.header.salt).not.toBe(header.salt)
    expect(key.extractable).toBe(false)
    const id = crypto.randomUUID()
    const value = new Blob([contents])
    const row = await encryptRecord(key, id, value, metadata)
    const repeated = await encryptRecord(key, id, value, metadata)
    expect(await row.meta.text()).not.toContain(metadata.name)
    expect(await row.content.text()).not.toContain(contents)
    expect(
      new Uint8Array(await row.content.slice(0, 12).arrayBuffer()),
    ).not.toEqual(
      new Uint8Array(await repeated.content.slice(0, 12).arrayBuffer()),
    )
    await expect(unlockKey(header, 'wrong password')).rejects.toThrow(
      /incorrect/,
    )
    const unlocked = await unlockKey(header, password)
    await expect(openMetadata(unlocked, row)).resolves.toEqual({
      ...metadata,
      id,
    })
    await expect(
      openMetadata(unlocked, { ...row, id: crypto.randomUUID() }),
    ).rejects.toThrow()
    const data = await unseal(unlocked, 'file:' + id, row.content)
    expect(new TextDecoder().decode(data)).toBe(contents)
    await expect(
      unseal(unlocked, 'meta:' + id, row.content),
    ).rejects.toThrow()
  })

  test('authenticates backups and can re-encrypt into a separate vault', async () => {
    const source = await createKey(password)
    const destination = await createKey('another robust master passphrase')
    const id = crypto.randomUUID()
    const row = await encryptRecord(
      source.key,
      id,
      new Blob([contents]),
      metadata,
    )
    const backup = await makeBackup(source.header, source.key, [row])
    expect(await backup.text()).not.toContain(metadata.name)
    expect(await backup.text()).not.toContain(password)
    const signal = new AbortController().signal
    const restored = await readBackup(
      backup,
      password,
      signal,
      destination.key,
    )
    expect(restored.records).toHaveLength(1)
    await expect(
      openMetadata(destination.key, restored.records[0]),
    ).resolves.toEqual({ ...metadata, id })
    await expect(
      openMetadata(source.key, restored.records[0]),
    ).rejects.toThrow()
    const corrupted = new Uint8Array(await backup.arrayBuffer())
    corrupted[corrupted.length - 1] ^= 1
    await expect(
      readBackup(new Blob([corrupted]), password, signal),
    ).rejects.toThrow(/integrity/)
    await expect(
      readBackup(backup.slice(0, backup.size - 1), password, signal),
    ).rejects.toThrow(/payload/)
  })

  test('classifies local English and Hindi text without mistaking word fragments for categories', () => {
    expect(suggestFolder('scan.pdf', 'Clinical discharge summary.')).toBe(
      'Medical',
    )
    expect(suggestFolder('scan.pdf', 'विद्यालय की अंकसूची')).toBe('Education')
    expect(suggestFolder('scan.pdf', 'UIDAI Aadhaar card')).toBe('Govt IDs')
    expect(suggestFolder('scan.pdf', 'GSTIN Invoice and amount due')).toBe(
      'Finance & Bills',
    )
    expect(suggestFolder('scan.pdf', 'An impatient message')).toBe(
      'Personal',
    )
    expect(
      searchText({ ...metadata, id: 'test', text: 'नमस्ते संसार' }),
    ).toContain('नमस्ते संसार')
    expect(searchWords('  Private-TAG  ')).toEqual(['private', 'tag'])
  })
})
