import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button, ErrorState, Modal, Progress } from '../../components/shared'
import { errorText, sizeLabel, type Output } from '../../lib/files'
import { inspectDocument, suggestFolder } from './organize'
import { isFolder } from './crypto'
import { VaultAuth, VaultFields, type FileFields } from './Forms'
import {
  cleanFields,
  queueVaultFile,
  saveVaultFile,
  useVault,
  vaultSignal,
} from './session'

function ReviewFile({ output }: { output: Output }) {
  const [fields, setFields] = useState<FileFields>(() => ({
    name: output.name.slice(0, 126),
    folder: isFolder(output.vaultFolder) ? output.vaultFolder : suggestFolder(output.name, ''),
    tags: '',
  }))
  const [details, setDetails] = useState<{
    mime: string
    text: string
    note: string
  }>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const manual = useRef(false)
  const indexing = useRef<AbortController>(null)
  const saveRequest = useRef<AbortController>(null)

  useEffect(() => {
    const controller = new AbortController()
    indexing.current = controller
    const signal = AbortSignal.any([controller.signal, vaultSignal()])
    const timeout = setTimeout(() => {
      controller.abort()
      setDetails({
        mime: output.blob.type,
        text: '',
        note: 'Text extraction timed out. You can still organize and save this file.',
      })
    }, 90_000)
    void inspectDocument(output.blob, output.name, signal)
      .then(
        (result) => {
          if (!signal.aborted) {
            if (!manual.current && !output.vaultFolder)
              setFields((previous) => ({
                ...previous,
                folder: suggestFolder(output.name, result.text),
              }))
            setDetails(result)
          }
        },
        () => {
          if (!signal.aborted)
            setDetails({
              mime: output.blob.type,
              text: '',
              note: 'Text extraction was unavailable. You can still save this file.',
            })
        },
      )
      .finally(() => clearTimeout(timeout))
    return () => {
      clearTimeout(timeout)
      controller.abort()
      saveRequest.current?.abort()
    }
  }, [output])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!details || busy) return
    const controller = new AbortController()
    saveRequest.current = controller
    setError('')
    setBusy(true)
    try {
      await saveVaultFile(
        output.blob,
        {
          ...cleanFields(fields.name, fields.folder, fields.tags),
          mime: details.mime.slice(0, 128),
          text: details.text,
        },
        controller.signal,
        (_label, fraction) => setProgress(fraction),
      )
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorText(failure))
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <form className="vault-auth-form" onSubmit={(event) => void submit(event)}>
      <p className="muted">
        {sizeLabel(output.blob.size)} · Review the filename, folder and tags
        before saving.
      </p>
      {!details && (
        <div className="vault-indexing">
          <Progress pending label="Reading this file on your device" />
          <Button
            variant="quiet"
            onClick={() => {
              indexing.current?.abort()
              setDetails({
                mime: output.blob.type,
                text: '',
                note: 'Text extraction skipped. The file is still searchable by name and tags.',
              })
            }}
          >
            Skip text extraction
          </Button>
        </div>
      )}
      {details?.note && (
        <p className="mini" role="status">
          {details.note}
        </p>
      )}
      {details && (
        <p className="mini">
          Suggested folder:{' '}
          <strong>{suggestFolder(output.name, details.text)}</strong>
        </p>
      )}
      <VaultFields
        value={fields}
        busy={busy}
        update={(next) => {
          if (next.folder !== fields.folder) manual.current = true
          setFields(next)
        }}
      />
      {!!details?.text && (
        <details className="vault-extracted">
          <summary>Review extracted text</summary>
          <pre>{details.text.slice(0, 4000)}</pre>
        </details>
      )}
      <ErrorState error={error} />
      {busy && (
        <Progress pending label="Encrypting file" progress={progress * 100} />
      )}
      <Button type="submit" disabled={!details || busy}>
        <ShieldCheck size={17} /> {busy ? 'Encrypting…' : 'Encrypt & Save'}
      </Button>
    </form>
  )
}

export default function SaveDialog({ output }: { output: Output }) {
  const unlocked = useVault((s) => s.unlocked)
  const pendingKey = useVault((s) => s.pendingKey)
  return (
    <Modal title="Save to Encrypted Vault" onClose={() => queueVaultFile(null)}>
      {!output.blob.size ? (
        <ErrorState error="Choose a file that contains data." />
      ) : unlocked ? (
        <ReviewFile key={pendingKey} output={output} />
      ) : (
        <VaultAuth />
      )}
    </Modal>
  )
}
