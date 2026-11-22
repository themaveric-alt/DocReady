import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LockKeyhole } from 'lucide-react'
import {
  Button,
  Check,
  Dropzone,
  ErrorState,
  Field,
  FileList,
  Panel,
  Progress,
  Results,
} from '../../components/shared'
import { errorText, pageCountLabel, PDF, stem, type Output } from '../../lib/files'
import { PDF_PROTECT_LIMIT, protectPdf } from '../../lib/pdf-protect'

export default function PDFProtect() {
  const [file, setFile] = useState<File>()
  const [items, setItems] = useState<Output[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [restrict, setRestrict] = useState(false)
  const user = useRef<HTMLInputElement>(null)
  const owner = useRef<HTMLInputElement>(null)
  const active = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => active.current?.abort(), [])
  function choose(next?: File) {
    setItems([])
    setError('')
    if (next && next.size > PDF_PROTECT_LIMIT) {
      setFile(undefined)
      setError('Choose a PDF no larger than 40 MB for local AES-256 protection.')
      return
    }
    setFile(next)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || active.current) return
    const userPassword = user.current?.value ?? ''
    const ownerPassword = owner.current?.value ?? ''
    if (userPassword.length < 8 || ownerPassword.length < 8) {
      setError('Use at least 8 characters for both passwords.')
      return
    }
    if (userPassword === ownerPassword) {
      setError('Use a different owner password to control PDF permissions.')
      return
    }
    user.current!.value = ''
    owner.current!.value = ''
    const job = new AbortController()
    active.current = job
    setBusy(true)
    setError('')
    setItems([])
    try {
      const result = await protectPdf({ file, userPassword, ownerPassword, restrict }, job.signal)
      setItems([{ name: `${stem(file.name)}-protected.pdf`, blob: new Blob([result.bytes], { type: PDF }), detail: `AES-256 · ${pageCountLabel(result.pages)}` }])
    } catch (reason) {
      if (!job.signal.aborted) setError(errorText(reason))
    } finally {
      if (active.current === job) active.current = undefined
      if (!job.signal.aborted) setBusy(false)
    }
  }
  return (
    <>
      <Panel title="Protect a PDF with AES-256">
        <fieldset disabled={busy}>
          <Dropzone accept={[PDF]} label="Choose a PDF to protect" description="PDF · Up to 40 MB" onFiles={([next]) => choose(next)} />
          <FileList files={file ? [file] : []} onChange={([next]) => choose(next)} />
          {file && (
            <form onSubmit={submit} autoComplete="off" className="form-grid">
              <Field label="Open password">
                <input ref={user} type="password" minLength={8} autoComplete="new-password" required />
              </Field>
              <Field label="Owner password">
                <input ref={owner} type="password" minLength={8} autoComplete="new-password" required />
              </Field>
              <div className="full"><Check label="Restrict printing, modification, and extraction" checked={restrict} onChange={setRestrict} /></div>
              <div className="action-row full"><Button type="submit"><LockKeyhole size={17} /> Protect PDF</Button>{busy && <Button variant="quiet" onClick={() => active.current?.abort()}>Cancel</Button>}</div>
            </form>
          )}
        </fieldset>
        <p className="notice">Passwords are passed only to the local WASM engine and cleared from the visible inputs before processing. Keep the owner password somewhere safe; the app cannot recover it.</p>
        <Progress pending={busy} label="Encrypting locally" />
        <ErrorState error={error} />
      </Panel>
      <Results items={items} message="Your protected PDF is ready." />
    </>
  )
}
