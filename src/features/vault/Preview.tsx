import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Button,
  ErrorState,
  Modal,
  Progress,
} from '../../components/shared'
import { errorText, fileKind, images, PDF } from '../../lib/files'
import { type Entry } from './crypto'
import { readVaultFile, vaultSignal } from './session'

function ImagePreview({ image, label }: { image: Blob; label: string }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const signal = vaultSignal()
    const source = URL.createObjectURL(image)
    const revoke = () => URL.revokeObjectURL(source)
    signal.addEventListener('abort', revoke, { once: true })
    setUrl(source)
    return () => {
      signal.removeEventListener('abort', revoke)
      revoke()
    }
  }, [image])
  return url ? (
    <img
      className="vault-preview-image"
      src={url}
      alt={label}
      draggable={false}
    />
  ) : null
}

function PdfPreview({ file }: { file: Blob }) {
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  const [rendered, setRendered] = useState<Blob>()
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([vaultSignal(), controller.signal])
    setRendered(undefined)
    setError('')
    async function render() {
      const { loadRender, renderBlob } =
        await import('../../lib/pdf-render')
      const pdf = await loadRender(file, { signal })
      try {
        const target = await pdf.getPage(page + 1)
        const { width, height } = target.getViewport({ scale: 1 })
        const image = await renderBlob(
          pdf,
          page,
          Math.min(1.6, 1700 / Math.max(width, height)),
        )
        if (!signal.aborted) {
          setCount(pdf.numPages)
          setRendered(image)
        }
      } finally {
        await pdf.dispose()
      }
    }
    void render().catch((failure: unknown) => {
      if (!signal.aborted) setError(errorText(failure))
    })
    return () => controller.abort()
  }, [file, page])

  return (
    <>
      <ErrorState error={error} />
      <Progress
        pending={!rendered && !error}
        label="Rendering a private PDF preview"
      />
      {rendered && (
        <ImagePreview image={rendered} label={'PDF page ' + (page + 1)} />
      )}
      {count > 1 && (
        <div className="vault-preview-nav">
          <Button
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPage((n) => n - 1)}
            aria-label="Previous PDF page"
          >
            <ChevronLeft size={17} />
          </Button>
          <span aria-live="polite">
            Page {page + 1} of {count}
          </span>
          <Button
            variant="secondary"
            disabled={page === count - 1}
            onClick={() => setPage((n) => n + 1)}
            aria-label="Next PDF page"
          >
            <ChevronRight size={17} />
          </Button>
        </div>
      )}
    </>
  )
}

type Preview =
  { pdf: Blob } | { image: Blob } | { text: string } | { unsupported: true }

export default function VaultPreview({
  entry,
  close,
}: {
  entry: Entry
  close: () => void
}) {
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([vaultSignal(), controller.signal])
    void (async () => {
      const file = await readVaultFile(entry, signal)
      const kind = await fileKind(file)
      const result: Preview =
        kind === PDF
          ? { pdf: file }
          : (images as readonly string[]).includes(kind)
            ? { image: file.slice(0, file.size, kind) }
            : entry.mime === 'text/plain'
              ? { text: await file.slice(0, 32_000).text() }
              : { unsupported: true }
      if (!signal.aborted) setPreview(result)
    })().catch((failure: unknown) => {
      if (!signal.aborted) setError(errorText(failure))
    })
    return () => controller.abort()
  }, [entry])

  return (
    <Modal
      title="Private file preview"
      onClose={close}
      className="vault-preview"
    >
      <p className="vault-preview-title">{entry.name}</p>
      <ErrorState error={error} />
      <Progress
        pending={!preview && !error}
        label="Decrypting this file in memory"
      />
      {preview &&
        ('pdf' in preview ? (
          <PdfPreview file={preview.pdf} />
        ) : 'image' in preview ? (
          <ImagePreview image={preview.image} label={entry.name} />
        ) : 'text' in preview ? (
          <pre className="vault-preview-text">{preview.text}</pre>
        ) : (
          <p className="muted">
            This format can be downloaded from your vault. Preview supports
            PDF, JPEG, PNG, WebP and plain text.
          </p>
        ))}
    </Modal>
  )
}
