import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  File,
  FilePlus2,
  LoaderCircle,
  LockKeyhole,
  UploadCloud,
  X,
} from 'lucide-react'
import {
  pageCountLabel,
  errorText,
  saveFile,
  sizeLabel,
  validateFiles,
  type Output,
} from '../lib/files'
import { BrandMark } from './Brand'
import { queueVaultFile } from '../features/vault/session'
import { useJourneyOutputs, useJourneySources } from './ToolJourney'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet'
}) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${className}`}
      {...props}
    />
  )
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  )
}
export function Field({
  label,
  children,
}: {
  label: string
  children: ReactElement<{ id?: string }>
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  )
}
export function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}
export function Panel({
  title,
  children,
  className = '',
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={'panel ' + className}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  )
}
export function ErrorState({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null
}
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>
}
export function LoadingSkeleton() {
  return (
    <div className="panel skeleton" role="status">
      <BrandMark />
      <span>Loading workspace…</span>
    </div>
  )
}
export function Progress({
  pending,
  progress,
  label = 'Processing files',
}: {
  pending: boolean
  progress?: number
  label?: string
}) {
  return pending ? (
    <div className="progress" role="status">
      <LoaderCircle className="spin" size={18} />
      <span>
        {label}
        {progress !== undefined ? ' · ' + Math.round(progress) + '%' : '…'}
      </span>
      <progress value={progress} max={100} />
    </div>
  ) : null
}
export function Dropzone({
  onFiles,
  accept = [],
  multiple = false,
  disabled = false,
  compact = false,
  label,
  description,
}: {
  onFiles: (files: File[]) => void
  accept?: string[]
  multiple?: boolean
  disabled?: boolean
  compact?: boolean
  label?: string
  description?: string
}) {
  const input = useRef<HTMLInputElement>(null),
    [drag, setDrag] = useState(false),
    [err, setErr] = useState(''),
    [busy, setBusy] = useState(false)
  const id = useId()
  const isBlocked = () =>
    disabled || Boolean(input.current?.closest('fieldset:disabled'))
  async function take(files: File[]) {
    if (isBlocked() || busy || !files.length) return
    setBusy(true)
    setErr('')
    try {
      if (!multiple && files.length !== 1) throw Error('Choose one file.')
      await validateFiles(files, accept)
      if (!isBlocked()) onFiles(files)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="upload-wrap">
      <div
        className={`dropzone ${drag ? 'dragging' : ''} ${compact ? 'compact' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          if (!isBlocked() && !busy) setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          void take(Array.from(e.dataTransfer.files))
        }}
      >
        <input
          id={id}
          aria-label={label || 'Choose files'}
          type="file"
          accept={accept.join(',') || undefined}
          multiple={multiple}
          ref={input}
          hidden
          disabled={disabled || busy}
          onChange={(e) => {
            void take(Array.from(e.currentTarget.files || []))
            e.currentTarget.value = ''
          }}
        />
        <div className="upload-icon">
          {compact ? <FilePlus2 size={20} /> : <UploadCloud size={25} />}
        </div>
        <div>
          <strong>{label || 'Drop files here'}</strong>
          <small>
            {description ||
              (accept.length
                ? accept.map((x) => x.split('/')[1].toUpperCase()).join(', ')
                : 'Any file type') + ' · Up to 80 MB per file'}
          </small>
        </div>
        <Button
          variant="secondary"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Checking…' : 'Browse files'}
        </Button>
      </div>
      <ErrorState error={err} />
    </div>
  )
}
export function move<T>(items: T[], from: number, to: number) {
  if (from === to || to < 0 || to >= items.length) return items
  const next = [...items],
    [entry] = next.splice(from, 1)
  next.splice(to, 0, entry)
  return next
}
export function FileList({
  files,
  counts,
  onChange,
  ordered = false,
}: {
  files: File[]
  counts?: number[]
  onChange: (files: File[]) => void
  ordered?: boolean
}) {
  useJourneySources(files.length)
  const drag = useRef<number | null>(null)
  return (
    files.length > 0 && (
      <ul className="file-list">
        {files.map((f, i) => (
          <li
            key={i + f.name}
            draggable={ordered}
            onDragStart={() => {
              drag.current = i
            }}
            onDragEnd={() => {
              drag.current = null
            }}
            onDragOver={(e) => {
              if (ordered) e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (
                drag.current !== null &&
                !e.currentTarget.closest('fieldset:disabled')
              )
                onChange(move(files, drag.current, i))
              drag.current = null
            }}
          >
            <File size={18} />
            <span>
              <strong>{f.name}</strong>
              <small>
                {sizeLabel(f.size)}
                {counts?.[i] !== undefined
                  ? ' · ' + pageCountLabel(counts[i])
                  : ''}
              </small>
            </span>
            {ordered && (
              <>
                <IconButton
                  label={'Move ' + f.name + ' up'}
                  disabled={i === 0}
                  onClick={() => onChange(move(files, i, i - 1))}
                >
                  <ArrowUp size={16} />
                </IconButton>
                <IconButton
                  label={'Move ' + f.name + ' down'}
                  disabled={i === files.length - 1}
                  onClick={() => onChange(move(files, i, i + 1))}
                >
                  <ArrowDown size={16} />
                </IconButton>
              </>
            )}
            <IconButton
              label={'Remove ' + f.name}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
            >
              <X size={16} />
            </IconButton>
          </li>
        ))}
      </ul>
    )
  )
}
export function useObjectUrl(blob?: Blob) {
  const [record, set] = useState<{ blob: Blob; url: string }>()
  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    set({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return record?.blob === blob ? record?.url : undefined
}
export function FilePreview({ file, label }: { file?: Blob; label: string }) {
  const url = useObjectUrl(file)
  return (
    <figure className="file-preview">
      <figcaption>{label}</figcaption>
      {url ? (
        <img src={url} alt={label} />
      ) : (
        <div className="preview-empty">Preview appears here</div>
      )}
    </figure>
  )
}
export function Results({
  items,
  message,
}: {
  items: Output[]
  message?: string
}) {
  useJourneyOutputs(items.length)
  const [downloaded, setDownloaded] = useState('')
  if (!items.length) return null
  return (
    <Panel title="Results" className="result-panel">
      {message && (
        <p className="success" role="status">
          <CheckCircle2 size={18} />
          {message}
        </p>
      )}
      <ul className="file-list">
        {items.map((item, i) => (
          <li key={item.name + i} className="result-file">
            <File size={18} />
            <span>
              <strong>{item.name}</strong>
              <small>
                {sizeLabel(item.blob.size)}
                {item.detail ? ' · ' + item.detail : ''}
              </small>
            </span>
            <div className="result-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  saveFile(item)
                  setDownloaded(item.name)
                }}
              >
                <Download size={16} /> Download
                <span className="sr-only"> {item.name}</span>
              </Button>
              <Button variant="quiet" onClick={() => queueVaultFile(item)}>
                <LockKeyhole size={16} /> Save to Encrypted Vault
                <span className="sr-only"> {item.name}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {downloaded && (
        <span className="sr-only" role="status">
          Download started for {downloaded}
        </span>
      )}
    </Panel>
  )
}
export function Modal({
  title,
  onClose,
  children,
  branded = false,
  className,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  branded?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId()
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="dialog-inner">
        <div
          className={
            'between dialog-header' +
            (branded ? ' branded-dialog-header' : '')
          }
        >
          <div className="dialog-title">
            {branded && <BrandMark />}
            <h2 id={id}>{title}</h2>
          </div>
          <IconButton onClick={onClose} label="Close dialog">
            <X size={21} />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  )
}
export function useOperation() {
  const [items, setItems] = useState<Output[]>([]),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [progress, setProgress] = useState<number>()
  const lock = useRef(false)
  const job = useRef<AbortController | null>(null)
  useEffect(() => () => job.current?.abort(), [])
  async function run(
    task: (report: (value: number) => void, signal: AbortSignal) => Promise<Output[]>,
  ) {
    if (lock.current) return
    lock.current = true
    const controller = new AbortController()
    job.current = controller
    setPending(true)
    setItems([])
    setError('')
    setProgress(undefined)
    try {
      const next = await task(value => { if (!controller.signal.aborted) setProgress(value) }, controller.signal)
      if (!controller.signal.aborted) setItems(next)
    } catch (e) {
      if (!controller.signal.aborted) setError(errorText(e))
    } finally {
      lock.current = false
      if (!controller.signal.aborted) setPending(false)
      if (job.current === controller) job.current = null
    }
  }
  return {
    items,
    error,
    pending,
    progress,
    run,
    reset: () => {
      setItems([])
      setError('')
    },
  }
}
