import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Archive, KeyRound, LockKeyhole, Upload } from 'lucide-react'
import {
  Button,
  ErrorState,
  Field,
  Modal,
  Progress,
} from '../../components/shared'
import { errorText } from '../../lib/files'
import { folderMap, folderTrail, folders, type Folder } from './crypto'
import {
  authenticate,
  discoverVault,
  exportVaultZip,
  restoreVault,
  useVault,
} from './session'

export type FileFields = { name: string; folder: Folder; tags: string }

export function VaultFields({
  value,
  update,
  busy,
}: {
  value: FileFields
  update: (next: FileFields) => void
  busy: boolean
}) {
  const custom = useVault((s) => s.customFolders)
  const map = folderMap(custom)
  return (
    <fieldset className="vault-fields" disabled={busy}>
      <Field label="Filename">
        <input
          value={value.name}
          onChange={(event) => update({ ...value, name: event.target.value })}
          maxLength={126}
          required
        />
      </Field>
      <Field label="Folder">
        <select
          value={value.folder}
          onChange={(event) =>
            update({ ...value, folder: event.target.value as Folder })
          }
        >
          {folders.map((folder) => (
            <option key={folder}>{folder}</option>
          ))}
          {custom.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folderTrail(folder.id, map).join(' / ')}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tags (comma separated)">
        <input
          value={value.tags}
          onChange={(event) => update({ ...value, tags: event.target.value })}
          placeholder="e.g. College, 2026"
          maxLength={395}
        />
      </Field>
    </fieldset>
  )
}

export function VaultAuth({ onImport }: { onImport?: () => void }) {
  const header = useVault((s) => s.header)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [discovery, setDiscovery] = useState(0)
  const password = useRef<HTMLInputElement>(null)
  const confirm = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController>(null)
  useEffect(() => {
    let mounted = true
    if (header === undefined)
      void discoverVault().catch((failure: unknown) => {
        if (mounted) setError(errorText(failure))
      })
    return () => {
      mounted = false
    }
  }, [header, discovery])
  useEffect(() => () => request.current?.abort(), [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !password.current || header === undefined) return
    const secret = password.current.value
    if (header === null && secret !== confirm.current?.value) {
      setError('The passwords do not match.')
      return
    }
    password.current.value = ''
    if (confirm.current) confirm.current.value = ''
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    try {
      await authenticate(secret, header === null, controller.signal)
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorText(failure))
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  if (header === undefined)
    return (
      <>
        <Progress pending={!error} label="Opening local vault storage" />
        <ErrorState error={error} />
        {error && (
          <Button
            variant="secondary"
            onClick={() => {
              setError('')
              setDiscovery((n) => n + 1)
            }}
          >
            Retry
          </Button>
        )}
      </>
    )
  return (
    <form
      className="vault-auth-form"
      onSubmit={(event) => void submit(event)}
      autoComplete="off"
    >
      <p className="muted">
        {header
          ? 'Enter your master password or PIN to unlock this vault.'
          : 'Create a master password or PIN for this browser. Keep it somewhere safe. There is no password reset.'}
      </p>
      <fieldset className="vault-fields" disabled={busy}>
        <Field label="Master password or PIN">
          <input
            ref={password}
            type="password"
            autoComplete="off"
            required
            maxLength={256}
          />
        </Field>
        {!header && (
          <>
            <Field label="Confirm master password or PIN">
              <input
                ref={confirm}
                type="password"
                autoComplete="off"
                required
                maxLength={256}
              />
            </Field>
            <p className="mini">
              Use at least 12 characters or an 8-digit PIN. A long passphrase
              gives stronger protection against guessing.
            </p>
          </>
        )}
      </fieldset>
      <ErrorState error={error} />
      <div className="action-row">
        <Button type="submit" disabled={busy}>
          {header ? <LockKeyhole size={17} /> : <KeyRound size={17} />}
          {busy
            ? 'Opening vault…'
            : header
              ? 'Unlock vault'
              : 'Create encrypted vault'}
        </Button>
        {!header && onImport && (
          <Button variant="secondary" disabled={busy} onClick={onImport}>
            <Upload size={16} /> Restore backup
          </Button>
        )}
      </div>
    </form>
  )
}

export function RestoreDialog({
  close,
  onDone,
  merging,
}: {
  close: () => void
  onDone: (message: string) => void
  merging: boolean
}) {
  const [file, setFile] = useState<File>()
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<{
    label: string
    fraction: number
  }>()
  const isEncrypted = !!file && /\.vault(?:\.zip)?$/i.test(file.name)
  const [error, setError] = useState('')
  const secret = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController>(null)
  useEffect(() => () => request.current?.abort(), [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file || saving) return
    const password = secret.current?.value ?? ''
    if (secret.current) secret.current.value = ''
    const controller = new AbortController()
    request.current = controller
    setSaving(true)
    setError('')
    setProgress(undefined)
    try {
      const { inserted, skipped } = await restoreVault(
        file,
        password,
        controller.signal,
        (label, fraction) => setProgress({ label, fraction }),
      )
      if (!controller.signal.aborted) {
        onDone(
          `Imported ${inserted} ${inserted === 1 ? 'file' : 'files'}.` +
            (skipped ? ` ${skipped} already in this vault.` : ''),
        )
        close()
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorText(failure))
    } finally {
      if (!controller.signal.aborted) setSaving(false)
    }
  }

  return (
    <Modal title="Restore vault backup" onClose={close}>
      <form
        onSubmit={(event) => void submit(event)}
        className="vault-auth-form"
        autoComplete="off"
      >
        <p className="muted">
          {merging
            ? 'Restore these files alongside the files already in this vault.'
            : 'Restore a .zip, .vault.zip, or older .vault backup. For an unlocked ZIP, choose a password for this new vault.'}
        </p>
        <fieldset className="vault-fields" disabled={saving}>
          <Field label="Backup file (.zip or .vault)">
            <input
              type="file"
              accept=".vault,.zip,application/zip,application/octet-stream"
              required
              onChange={(event) => setFile(event.target.files?.[0])}
            />
          </Field>
          {file && (isEncrypted || !merging) && (
            <Field
              label={
                isEncrypted
                  ? 'Backup password or PIN'
                  : 'New vault password or PIN'
              }
            >
              <input
                ref={secret}
                type="password"
                autoComplete="off"
                maxLength={256}
                required
              />
            </Field>
          )}
        </fieldset>
        <ErrorState error={error} />
        <Progress
          pending={saving}
          label={progress?.label ?? 'Checking the backup locally'}
          progress={progress && progress.fraction * 100}
        />
        <Button type="submit" disabled={!file || saving}>
          <Upload size={17} /> Restore backup
        </Button>
      </form>
    </Modal>
  )
}

export function BackupDialog({ close }: { close: () => void }) {
  const [encrypted, setEncrypted] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<{
    label: string
    fraction: number
  }>()
  const request = useRef<AbortController>(null)
  useEffect(() => () => request.current?.abort(), [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    setProgress(undefined)
    try {
      await exportVaultZip(encrypted, controller.signal, (label, fraction) =>
        setProgress({ label, fraction }),
      )
      close()
    } catch (failure) {
      if (!controller.signal.aborted) {
        if ((failure as Error).name !== 'AbortError')
          setError(errorText(failure))
        setBusy(false)
      }
    }
  }

  return (
    <Modal title="Backup all as ZIP" onClose={close}>
      <form
        className="vault-auth-form"
        onSubmit={(event) => void submit(event)}
      >
        <fieldset className="vault-archive-options" disabled={busy}>
          <legend>Archive format</legend>
          <label>
            <input
              type="radio"
              name="archive-format"
              checked={encrypted}
              onChange={() => setEncrypted(true)}
            />
            <span>
              <strong>Encrypted Vault Archive (.vault.zip)</strong>
              <small>
                Protects file contents, names, tags, and search text with the
                vault password.
              </small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="archive-format"
              checked={!encrypted}
              onChange={() => setEncrypted(false)}
            />
            <span>
              <strong>Unlocked Structured ZIP (.zip)</strong>
              <small>
                Readable files in their original folders. Anyone with this ZIP
                can open the documents and read their metadata.
              </small>
            </span>
          </label>
        </fieldset>
        <ErrorState error={error} />
        <Progress
          pending={busy}
          label={progress?.label ?? 'Preparing backup'}
          progress={progress && progress.fraction * 100}
        />
        <div className="action-row">
          <Button type="submit" disabled={busy}>
            <Archive size={17} /> Download Full Backup ZIP
          </Button>
          {busy && (
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}
