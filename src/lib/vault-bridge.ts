import { safeName } from './files'
import { queueVaultFile } from '../features/vault/session'
import { isFolder, type Folder } from '../features/vault/crypto'

/** Opens the shared unlock/create and save confirmation dialog. No key or
 * decrypted vault record is exposed through this global integration surface. */
export const VaultBridge = Object.freeze({
  saveFile(blob: Blob, filename: string, defaultFolder: Folder = 'Personal') {
    if (!(blob instanceof Blob) || !blob.size) throw Error('Choose a non-empty file to save.')
    if (!isFolder(defaultFolder)) throw Error('Choose a valid vault folder.')
    queueVaultFile({ blob, name: safeName(filename), vaultFolder: defaultFolder })
  },
})
declare global { interface Window { VaultBridge: typeof VaultBridge } }
window.VaultBridge = VaultBridge
