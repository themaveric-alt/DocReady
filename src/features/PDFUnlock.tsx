import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LockKeyholeOpen, ShieldCheck } from 'lucide-react'
import {
  Button,
  Dropzone,
  ErrorState,
  Field,
  FileList,
  Panel,
  Progress,
  Results,
} from '../components/shared'
import { errorText, pageCountLabel, PDF, stem, type Output } from '../lib/files'
import { PDF_UNLOCK_LIMIT, unlockPdf } from '../lib/pdf-unlock'

export default function PDFUnlock() {
  const [file, setFile] = useState<File>()
  const [items, setItems] = useState<Output[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const active = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => active.current?.abort(), [])

  function select(next?: File) {
    setItems([])
    setNotice('')
    if (input.current) input.current.value = ''
    if (next && next.size > PDF_UNLOCK_LIMIT) {
      setFile(undefined)
      setError('Choose a PDF no larger than 40 MB.')
      return
    }
    setError('')
    setFile(next)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || active.current || !input.current?.value) return
    const password = input.current.value
    input.current.value = ''
    const job = new AbortController()
    active.current = job
    setItems([])
    setNotice('')
    setError('')
    setBusy(true)
    try {
      const result = await unlockPdf(file, password, job.signal)
      if (result.kind === 'unlocked') {
        setItems([
          {
            name: stem(file.name) + '-unlocked.pdf',
            blob: new Blob([result.bytes], { type: PDF }),
            detail: pageCountLabel(result.pages),
          },
        ])
        if (result.hasWarnings)
          setNotice(
            'The engine repaired a file issue while saving. Review the unlocked copy before using it.',
          )
      } else {
        setNotice(
          result.kind === 'already-open'
            ? 'This PDF already opens without a password.'
            : 'This PDF already opens without a password and may have editing or printing restrictions.',
        )
      }
    } catch (e) {
      if (!job.signal.aborted) setError(errorText(e))
    } finally {
      if (active.current === job) {
        active.current = undefined
        if (!job.signal.aborted) setBusy(false)
      }
    }
  }
  function cancel() {
    active.current?.abort()
    active.current = undefined
    setBusy(false)
  }
  return (
    <>
      <Panel title="Choose a password-protected PDF">
        <fieldset disabled={busy}>
          <Dropzone
            accept={[PDF]}
            label="Choose a PDF to unlock"
            description="PDF · Up to 40 MB"
            onFiles={([next]) => select(next)}
          />
          <FileList
            files={file ? [file] : []}
            onChange={([next]) => select(next)}
          />
          {file && (
            <form onSubmit={submit} autoComplete="off">
              <Field label="Current PDF password">
                <input
                  type="password"
                  ref={input}
                  autoComplete="off"
                  maxLength={1024}
                  required
                />
              </Field>
              <div className="action-row">
                <Button type="submit">
                  <LockKeyholeOpen size={17} /> Unlock PDF
                </Button>
              </div>
            </form>
          )}
        </fieldset>
        <Progress pending={busy} label="Unlocking PDF on your device" />
        {busy && (
          <Button variant="quiet" onClick={cancel}>
            Cancel
          </Button>
        )}
        <ErrorState error={error} />
        {notice && <p role="status">{notice}</p>}
        <p className="mini">
          <ShieldCheck size={15} aria-hidden /> The file and password stay on
          your device. Saving an unlocked copy may invalidate existing digital
          signatures.
        </p>
      </Panel>
      <Results items={items} message="Your unlocked PDF is ready." />
    </>
  )
}
