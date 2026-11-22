import { useState } from 'react'
import { File, Hash, Trash2 } from 'lucide-react'
import {
  Button,
  Dropzone,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Modal,
  Panel,
  Progress,
  Results,
  useOperation,
} from '../components/shared'
import {
  errorText,
  fileKind,
  safeName,
  sha256,
  sizeLabel,
  zipFiles,
} from '../lib/files'
type Entry = {
  id: string
  file: File
  name: string
  hash?: string
  kind: string
}
export default function FileTools({ id }: { id: string }) {
  const single = id === 'hash-file',
    [entries, setEntries] = useState<Entry[]>([]),
    [sort, setSort] = useState('name'),
    [prefix, setPrefix] = useState(''),
    [group, setGroup] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0)
  const op = useOperation()
  const counts = entries.reduce(
    (m, e) => (e.hash ? m.set(e.hash, (m.get(e.hash) || 0) + 1) : m),
    new Map<string, number>(),
  )
  const sorted = [...entries].sort(
    (a, b) =>
      (group ? a.kind.localeCompare(b.kind) : 0) ||
      (sort === 'size'
        ? a.file.size - b.file.size
        : sort === 'type'
          ? a.kind.localeCompare(b.kind)
          : a.name.localeCompare(b.name, undefined, { numeric: true })),
  )
  const groups = group ? [...new Set(sorted.map((x) => x.kind))] : ['']
  async function add(files: File[]) {
    setBusy(true)
    setError('')
    op.reset()
    try {
      if (
        !single &&
        (entries.length + files.length > 40 ||
          [...entries.map((e) => e.file), ...files].reduce(
            (n, f) => n + f.size,
            0,
          ) >
            180 * 1024 * 1024)
      )
        throw Error('Keep the batch at 40 files and below 180 MB.')
      const next = await Promise.all(
        files.map(async (file) => ({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          kind: (await fileKind(file)) || file.type || 'Unknown type',
        })),
      )
      setEntries((old) => (single ? next : [...old, ...next]))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function hash() {
    if (!globalThis.crypto?.subtle) {
      setError('SHA-256 requires HTTPS or localhost.')
      return
    }
    setBusy(true)
    setProgress(0)
    setError('')
    try {
      const next: Entry[] = []
      for (const [i, entry] of entries.entries()) {
        next.push({ ...entry, hash: await sha256(entry.file) })
        setProgress(((i + 1) / entries.length) * 100)
      }
      setEntries(next)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const disabled = busy || op.pending
  return (
    <>
      <div className="tool-layout">
        <Panel title={single ? 'File to inspect' : 'Source files'}>
          <Dropzone
            multiple={!single}
            disabled={disabled}
            onFiles={(f) => void add(f)}
          />
          <ErrorState error={error} />
          <ErrorState error={op.error} />
          <Progress
            pending={busy || op.pending}
            progress={busy ? progress : op.progress}
          />
        </Panel>
        <Panel title={single ? 'Fingerprint' : 'Organize and rename'}>
          <fieldset className="form-grid" disabled={disabled}>
            {!single && (
              <>
                <Field label="Sort by">
                  <select
                    value={sort}
                    onChange={(e) => {
                      op.reset()
                      setSort(e.target.value)
                    }}
                  >
                    <option value="name">Name</option>
                    <option value="type">Type</option>
                    <option value="size">Size</option>
                  </select>
                </Field>
                <Field label="Group by type">
                  <select
                    value={group ? 'yes' : 'no'}
                    onChange={(e) => {
                      op.reset()
                      setGroup(e.target.value === 'yes')
                    }}
                  >
                    <option value="no">No grouping</option>
                    <option value="yes">Group by file type</option>
                  </select>
                </Field>
                <Field label="Batch prefix">
                  <input
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="e.g. scholarship-"
                    maxLength={36}
                  />
                </Field>
                <Button
                  variant="secondary"
                  disabled={!prefix.trim() || !entries.length}
                  onClick={() => {
                    op.reset()
                    setEntries((all) =>
                      all.map((e) => ({
                        ...e,
                        name: safeName(prefix + e.name),
                      })),
                    )
                  }}
                >
                  Apply prefix
                </Button>
                <Button
                  variant="secondary"
                  disabled={!entries.length}
                  onClick={() => {
                    op.reset()
                    setEntries(
                      sorted.map((e, i) => ({
                        ...e,
                        name: safeName(
                          String(i + 1).padStart(2, '0') + '-' + e.name,
                        ),
                      })),
                    )
                  }}
                >
                  Number in displayed order
                </Button>
              </>
            )}
          </fieldset>
          <div className="action-row">
            <Button
              variant={single ? 'primary' : 'secondary'}
              disabled={!entries.length || disabled}
              onClick={() => void hash()}
            >
              <Hash size={16} />{' '}
              {single ? 'Calculate SHA-256' : 'Find duplicate contents'}
            </Button>
            {!single && (
              <>
                <Button
                  disabled={!entries.length || disabled}
                  onClick={() =>
                    void op.run(async () => [
                      await zipFiles(
                        sorted.map((e) => ({ name: e.name, blob: e.file })),
                      ),
                    ])
                  }
                >
                  Prepare ZIP
                </Button>
                <Button
                  variant="quiet"
                  disabled={!entries.length || disabled}
                  onClick={() => setConfirm(true)}
                >
                  <Trash2 size={16} /> Clear all
                </Button>
              </>
            )}
          </div>
        </Panel>
        <Panel title={single ? 'File information' : 'Files'} className="full">
          {!entries.length && (
            <EmptyState>Choose files to get started.</EmptyState>
          )}
          {groups.map((kind) => (
            <div key={kind}>
              {kind && <h3 className="separator">{kind}</h3>}
              <ul className="file-list">
                {sorted
                  .filter((e) => !kind || e.kind === kind)
                  .map((e) => (
                    <li key={e.id}>
                      <File size={18} />
                      <span>
                        {single ? (
                          <strong>{e.name}</strong>
                        ) : (
                          <Field label="Output filename">
                            <input
                              disabled={disabled}
                              value={e.name}
                              maxLength={126}
                              onChange={(ev) => {
                                op.reset()
                                setEntries((all) =>
                                  all.map((x) =>
                                    x.id === e.id
                                      ? { ...x, name: ev.target.value }
                                      : x,
                                  ),
                                )
                              }}
                            />
                          </Field>
                        )}
                        <small>
                          {e.file.name} · {sizeLabel(e.file.size)} · {e.kind} ·{' '}
                          {new Date(e.file.lastModified).toLocaleDateString()}
                        </small>
                        {e.hash && (
                          <small className="hash-value">SHA-256 {e.hash}</small>
                        )}
                        {e.hash && counts.get(e.hash)! > 1 && (
                          <span className="pill">Duplicate contents</span>
                        )}
                      </span>
                      <IconButton
                        label={'Remove ' + e.file.name}
                        disabled={disabled}
                        onClick={() => {
                          op.reset()
                          setEntries((x) => x.filter((y) => y.id !== e.id))
                        }}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </Panel>
      </div>
      <Results items={op.items} />
      {confirm && (
        <Modal title="Clear all files?" onClose={() => setConfirm(false)}>
          <p>
            This clears the current workspace. Your original files stay on your
            device.
          </p>
          <div className="action-row">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setEntries([])
                op.reset()
                setConfirm(false)
              }}
            >
              Clear files
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
