import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  Download,
  FileText,
  LayoutGrid,
  List,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  Button,
  ErrorState,
  Modal,
  Panel,
  Progress,
} from '../../components/shared'
import { errorText, sizeLabel } from '../../lib/files'
import {
  folderMap,
  folderTrail,
  folders,
  type CustomFolder,
  type Entry,
  type Folder,
} from './crypto'
import { customIcons, folderIcons, FolderDialog } from './FolderControls'
import {
  BackupDialog,
  RestoreDialog,
  VaultAuth,
  VaultFields,
  type FileFields,
} from './Forms'
import { searchText, searchWords } from './organize'
import {
  cleanFields,
  downloadVaultFile,
  refreshEstimate,
  refreshProtection,
  lockVault,
  modifyVaultFile,
  queueVaultFiles,
  useVault,
} from './session'

const VaultPreview = lazy(() => import('./Preview'))
type ItemAction = { kind: 'preview' | 'edit' | 'remove'; entry: Entry }

function EditFile({ entry, close }: { entry: Entry; close: () => void }) {
  const [fields, setFields] = useState<FileFields>({
    ...entry,
    tags: entry.tags.join(', '),
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await modifyVaultFile(
        entry,
        cleanFields(fields.name, fields.folder, fields.tags),
      )
      close()
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Edit encrypted file details" onClose={close}>
      <form
        className="vault-auth-form"
        onSubmit={(event) => void submit(event)}
      >
        <VaultFields value={fields} update={setFields} busy={busy} />
        <ErrorState error={error} />
        <Button type="submit" disabled={busy}>
          Save changes
        </Button>
      </form>
    </Modal>
  )
}

function RemoveFile({ entry, close }: { entry: Entry; close: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function remove() {
    if (busy) return
    setBusy(true)
    try {
      await modifyVaultFile(entry, null)
      close()
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }
  return (
    <Modal title="Delete file from vault?" onClose={close}>
      <p className="vault-preview-title">
        <strong>{entry.name}</strong> will be removed from this browser’s vault.
        You can recover it from a backup that contains it.
      </p>
      <ErrorState error={error} />
      <div className="action-row">
        <Button variant="secondary" onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => void remove()} disabled={busy}>
          Delete file
        </Button>
      </div>
    </Modal>
  )
}

function VaultFiles({ onImport }: { onImport: () => void }) {
  const entries = useVault((s) => s.entries)
  const custom = useVault((s) => s.customFolders)
  const usage = useVault((s) => s.encryptedBytes)
  const estimate = useVault((s) => s.estimate)
  const protection = useVault((s) => s.protection)
  const [query, setQuery] = useState('')
  const [selectedFolder, setFolder] = useState<Folder>()
  const folder =
    selectedFolder &&
    (folders.some((item) => item === selectedFolder) ||
      custom.some((item) => item.id === selectedFolder))
      ? selectedFolder
      : undefined
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [action, setAction] = useState<ItemAction>()
  const [folderAction, setFolderAction] = useState<{
    item?: CustomFolder
    remove?: boolean
  }>()
  const [backingUp, setBackingUp] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const download = useRef<AbortController>(null)
  const map = useMemo(() => folderMap(custom), [custom])
  const index = useMemo(
    () =>
      entries.map((entry) => ({
        entry,
        terms:
          searchText(entry) +
          ' ' +
          searchWords(folderTrail(entry.folder, map).join(' ')).join(' '),
      })),
    [entries, map],
  )
  const words = searchWords(query)
  const matches = index.filter(
    ({ entry, terms }) =>
      (!folder || entry.folder === folder) &&
      words.every((word) => terms.includes(word)),
  )
  useEffect(() => {
    const timer = setInterval(() => void refreshEstimate(), 15_000)
    const focus = () => {
      void refreshEstimate()
    }
    window.addEventListener('focus', focus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', focus)
      download.current?.abort()
    }
  }, [])

  async function downloadFile(entry: Entry) {
    download.current?.abort()
    const controller = new AbortController()
    download.current = controller
    setError('')
    try {
      await downloadVaultFile(entry, controller.signal)
    } catch (failure) {
      if (
        !controller.signal.aborted &&
        (failure as Error).name !== 'AbortError'
      )
        setError(errorText(failure))
    }
  }

  const closeAction = () => setAction(undefined)
  return (
    <div className="vault-page">
      <Panel title="Vault overview" className="vault-overview">
        <div className="vault-summary">
          <div>
            <span className="vault-pill">
              <ShieldCheck size={15} /> Unlocked on this device
            </span>
            <p className="vault-usage">
              <strong>{entries.length}</strong>{' '}
              {entries.length === 1 ? 'file' : 'files'} · {sizeLabel(usage)} in
              this vault
            </p>
            {estimate && (
              <>
                <progress
                  aria-label="Browser storage quota used"
                  max={estimate.quota}
                  value={Math.min(estimate.usage, estimate.quota)}
                />
                <p className="mini">
                  {sizeLabel(estimate.remaining)} available of{' '}
                  {sizeLabel(estimate.quota)} browser quota
                </p>
              </>
            )}
            <div className="vault-protection">
              {protection === 'persistent' ? (
                <span className="vault-pill">
                  <ShieldCheck size={15} /> Storage Protected (Persistent)
                </span>
              ) : protection === 'best-effort' ? (
                <Button
                  variant="secondary"
                  onClick={() => void refreshProtection()}
                >
                  Enable Storage Protection
                </Button>
              ) : (
                <span className="mini">
                  {protection === 'checking'
                    ? 'Checking storage protection…'
                    : 'Persistent storage is unavailable in this browser.'}
                </span>
              )}
              <p className="mini">
                {protection === 'persistent'
                  ? 'Protection applies to automatic browser cleanup. You can still clear this vault in browser settings.'
                  : 'The browser may clear this data under storage pressure until protection is granted.'}
              </p>
            </div>
          </div>
          <p className="mini">Auto-locks after 3 minutes without activity.</p>
        </div>
        <div className="vault-toolbar">
          <Button onClick={() => input.current?.click()}>
            <Plus size={17} /> Add files
          </Button>
          <Button variant="secondary" onClick={() => setFolderAction({})}>
            <Plus size={17} /> Create New Folder
          </Button>
          <Button variant="secondary" onClick={() => setBackingUp(true)}>
            <Download size={17} /> Backup All as ZIP
          </Button>
          <Button variant="secondary" onClick={onImport}>
            <Upload size={17} /> Restore Backup
          </Button>
          <Button variant="quiet" onClick={lockVault}>
            <LockKeyhole size={17} /> Lock vault
          </Button>
        </div>
        <input
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Add file to vault"
          ref={input}
          onChange={(event) => {
            const selected = Array.from(event.currentTarget.files ?? [])
            if (selected.length)
              queueVaultFiles(
                selected.map((file) => ({ name: file.name, blob: file })),
              )
            event.currentTarget.value = ''
          }}
        />
        <ErrorState error={error} />
      </Panel>

      <div className="vault-browser">
        <aside aria-labelledby="vault-folders" className="vault-folder-section">
          <div className="vault-section-heading">
            <h2 id="vault-folders">Folders</h2>
            <Button variant="quiet" onClick={() => setFolderAction({})}>
              <Plus size={15} /> Create New Folder
            </Button>
          </div>
          <div className="vault-folders">
            <button
              type="button"
              className="vault-folder"
              aria-pressed={!folder}
              onClick={() => setFolder(undefined)}
            >
              <span className="tool-icon" data-accent="indigo">
                <LayoutGrid size={19} />
              </span>
              <strong>All files</strong>
              <span className="mini">{entries.length}</span>
            </button>
            {[
              ...folders.map((name, i) => ({
                id: name as Folder,
                title: name,
                Icon: folderIcons[name],
                color: ['indigo', 'violet', 'amber', 'coral', 'teal'][i],
                item: undefined as CustomFolder | undefined,
              })),
              ...custom.map((item) => ({
                id: item.id as Folder,
                title: folderTrail(item.id, map).join(' / '),
                Icon: customIcons[item.icon],
                color: item.color,
                item,
              })),
            ].map(({ id, title, Icon, color, item }) => (
              <div className="vault-folder-row" key={id}>
                <button
                  type="button"
                  className="vault-folder"
                  aria-pressed={folder === id}
                  data-accent={color}
                  onClick={() =>
                    setFolder((old) => (old === id ? undefined : id))
                  }
                >
                  <span className="tool-icon">
                    <Icon size={18} />
                  </span>
                  <strong>{title}</strong>
                </button>
                {item && (
                  <div className="vault-folder-actions">
                    <Button
                      variant="quiet"
                      aria-label={'Edit folder ' + title}
                      onClick={() => setFolderAction({ item })}
                    >
                      <Pencil size={15} />
                    </Button>
                    <Button
                      variant="quiet"
                      aria-label={'Delete folder ' + title}
                      onClick={() => setFolderAction({ item, remove: true })}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        <Panel
          title={folder ? folderTrail(folder, map).join(' / ') : 'All files'}
          className="vault-files"
        >
          <div className="vault-search-row">
            <label className="search-input vault-search">
              <Search size={18} />
              <input
                type="search"
                aria-label="Search encrypted vault"
                placeholder="Search filenames, tags and document text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div
              className="vault-view-toggle"
              aria-label="File layout"
              role="group"
            >
              <Button
                variant="quiet"
                aria-label="Grid view"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
              >
                <LayoutGrid size={18} />
              </Button>
              <Button
                variant="quiet"
                aria-label="List view"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                <List size={18} />
              </Button>
            </div>
          </div>
          {matches.length ? (
            <ul
              className={
                'vault-documents ' + (view === 'grid' ? 'vault-grid-view' : '')
              }
            >
              {matches.map(({ entry }) => (
                <li className="vault-document" key={entry.id}>
                  <div className="vault-document-info">
                    <FileText size={20} />
                    <div>
                      <button
                        type="button"
                        className="vault-document-name"
                        onClick={() => setAction({ kind: 'preview', entry })}
                      >
                        {entry.name}
                      </button>
                      <p className="mini">
                        {folderTrail(entry.folder, map).join(' / ')} ·{' '}
                        {sizeLabel(entry.size)}
                      </p>
                      {!!entry.tags.length && (
                        <div className="vault-tags">
                          {entry.tags.map((tag) => (
                            <span key={tag}>{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="vault-document-actions">
                    <Button
                      variant="quiet"
                      aria-label={'Download ' + entry.name}
                      onClick={() => void downloadFile(entry)}
                    >
                      <Download size={17} />
                    </Button>
                    <Button
                      variant="quiet"
                      aria-label={'Edit ' + entry.name}
                      onClick={() => setAction({ kind: 'edit', entry })}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      variant="quiet"
                      aria-label={'Delete ' + entry.name}
                      onClick={() => setAction({ kind: 'remove', entry })}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              {entries.length
                ? 'No files match this view.'
                : 'Add a file or save an output from the scanner or a converter.'}
            </p>
          )}
        </Panel>
      </div>
      {backingUp && <BackupDialog close={() => setBackingUp(false)} />}
      {folderAction && (
        <FolderDialog
          item={folderAction.item}
          remove={folderAction.remove}
          parent={folder}
          close={() => {
            if (folderAction.remove && folderAction.item?.id === folder)
              setFolder(undefined)
            setFolderAction(undefined)
          }}
        />
      )}
      {action?.kind === 'preview' && (
        <Suspense fallback={<Progress pending label="Opening file preview" />}>
          <VaultPreview entry={action.entry} close={closeAction} />
        </Suspense>
      )}
      {action?.kind === 'edit' && (
        <EditFile entry={action.entry} close={closeAction} />
      )}
      {action?.kind === 'remove' && (
        <RemoveFile entry={action.entry} close={closeAction} />
      )}
    </div>
  )
}

export default function VaultPage() {
  const unlocked = useVault((s) => s.unlocked)
  const [importing, setImporting] = useState<'new' | 'merge'>()
  const [message, setMessage] = useState('')
  const openImport = () => {
    setMessage('')
    setImporting(unlocked ? 'merge' : 'new')
  }
  useEffect(() => {
    if (!unlocked && importing === 'merge') setImporting(undefined)
  }, [unlocked, importing])
  return (
    <>
      {unlocked ? (
        <VaultFiles onImport={openImport} />
      ) : (
        <Panel title="Your private document vault" className="vault-locked">
          <VaultAuth onImport={openImport} />
          <p className="mini">
            Files and search text are encrypted in this browser. Keep an
            encrypted backup if you plan to clear browser data or change
            devices.
          </p>
        </Panel>
      )}
      {unlocked && message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {(importing === 'new' || (importing === 'merge' && unlocked)) && (
        <RestoreDialog
          close={() => setImporting(undefined)}
          onDone={setMessage}
          merging={importing === 'merge'}
        />
      )}
    </>
  )
}
