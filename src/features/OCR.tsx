import { useEffect, useRef, useState } from 'react'
import { Copy, Download, ScanText } from 'lucide-react'
import {
  Button,
  Dropzone,
  ErrorState,
  Field,
  FileList,
  FilePreview,
  Panel,
  Progress,
  Results,
} from '../components/shared'
import {
  errorText,
  fileKind,
  images,
  parsePages,
  saveFile,
  PDF,
  stem,
} from '../lib/files'
import { openLocalOCR, type OCRLanguage } from '../lib/local-ocr'
import { openOCRPreparation } from '../lib/ocr-preparation'
import type { OCRFilter } from '../lib/ocr-pixels'
import { VaultBridge } from '../lib/vault-bridge'
export default function OCR({ initial }: { initial?: File }) {
  const [filter, setFilter] = useState<OCRFilter>('adaptive')
  const [prepared, setPrepared] = useState<Blob>()
  const [file, setFile] = useState(initial),
    [isPDF, setIsPDF] = useState(false),
    [language, setLanguage] = useState<OCRLanguage>('eng'),
    [range, setRange] = useState(''),
    [progress, setProgress] = useState<number>(),
    [stage, setStage] = useState('Loading OCR'),
    [text, setText] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [recognized, setRecognized] = useState(false),
    [pending, setPending] = useState(false),
    [exporting, setExporting] = useState(false)
  const work = useRef<AbortController | null>(null),
    exportJob = useRef<AbortController | null>(null),
    alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      work.current?.abort()
      exportJob.current?.abort()
    }
  }, [])
  useEffect(() => {
    let live = true
    if (file)
      void fileKind(file).then((type) => {
        if (live) setIsPDF(type === PDF)
      })
    return () => {
      live = false
    }
  }, [file])
  async function run() {
    if (!file || work.current) return
    setPending(true)
    setError('')
    setMessage('')
    setText('')
    setRecognized(false)
    setProgress(0)
    setStage('Loading OCR')
    const controller = new AbortController()
    work.current = controller
    const { signal } = controller
    let preparation: ReturnType<typeof openOCRPreparation> | undefined
    let ocr: Awaited<ReturnType<typeof openLocalOCR>> | undefined
    let pdf: import('../lib/pdf-render').RenderPDF | undefined
    try {
      const isPdf = (await fileKind(file)) === PDF
      preparation = openOCRPreparation(signal)
      const pdfEngine = isPdf ? await import('../lib/pdf-render') : undefined
      if (pdfEngine)
        pdf = await pdfEngine.loadRender(file, {
          signal,
          workerRendering: true,
        })
      const pages = pdf ? parsePages(range, pdf.numPages) : [0]
      if (pages.length > 12)
        throw Error('Select up to 12 PDF pages per OCR run.')
      let pageNumber = 0
      ocr = await openLocalOCR(language, signal, (m) => {
        if (!alive.current) return
        const reading = m.status === 'recognizing text'
        setStage(
          reading
            ? `Recognizing page ${pageNumber + 1} of ${pages.length}`
            : 'Loading OCR language and engine',
        )
        setProgress(
          reading
            ? 15 + (85 * (pageNumber + m.progress)) / pages.length
            : Math.round(m.progress * 12),
        )
      })
      const result: string[] = []
      let foundText = false
      for (const page of pages) {
        signal.throwIfAborted()
        setStage(
          `Cleaning ${isPdf ? 'page ' + (page + 1) : 'the image'} in the worker`,
        )
        let image: Blob = file
        if (pdf && pdfEngine) {
          const viewport = (await pdf.getPage(page + 1)).getViewport({
            scale: 1,
          })
          const scale = Math.min(
            2.4,
            2300 / Math.max(viewport.width, viewport.height),
            Math.sqrt(4_500_000 / (viewport.width * viewport.height)),
          )
          image = await pdfEngine.renderBlob(pdf, page, scale)
        }
        const input = await preparation.request('prepare', { image, filter })
        if (alive.current) setPrepared(input)
        const data = await ocr.recognize(input)
        const content = data.text.trim()
        foundText ||= Boolean(content)
        result.push(
          isPdf && pages.length > 1 ? `Page ${page + 1}\n${content}` : content,
        )
        pageNumber++
      }
      if (alive.current) {
        setText(foundText ? result.join('\n\n') : '')
        setProgress(100)
        setRecognized(true)
        setMessage(
          foundText
            ? 'Recognition finished. Review and correct the text below.'
            : 'OCR finished without recognizing text. Try a sharper scan.',
        )
      }
    } catch (e) {
      if (alive.current)
        setError(
          signal.aborted
            ? 'Recognition was cancelled.'
            : 'OCR could not finish. ' + errorText(e),
        )
    } finally {
      await ocr?.close()
      preparation?.close()
      await pdf?.dispose().catch(() => {})
      work.current = null
      if (alive.current) setPending(false)
    }
  }
  async function downloadDocx() {
    if (!text.trim() || exportJob.current) return
    const job = new AbortController()
    exportJob.current = job
    setExporting(true)
    let worker: ReturnType<typeof openOCRPreparation> | undefined
    try {
      worker = openOCRPreparation(job.signal)
      const blob = await worker.request('docx', { text })
      if (!job.signal.aborted)
        saveFile({ name: stem(file?.name || 'ocr') + '-text.docx', blob })
    } catch (error) {
      if (!job.signal.aborted)
        setMessage('Word export could not finish. ' + errorText(error))
    } finally {
      worker?.close()
      if (exportJob.current === job) exportJob.current = null
      if (alive.current) setExporting(false)
    }
  }
  function change(f?: File) {
    exportJob.current?.abort()
    setFile(f)
    setRange('')
    setText('')
    setError('')
    setMessage('')
    setRecognized(false)
    setPrepared(undefined)
  }
  return (
    <>
      <div className="tool-layout">
        <Panel title="Source document">
          <fieldset disabled={pending}>
            <Dropzone accept={[...images, PDF]} onFiles={(f) => change(f[0])} />
            <FileList
              files={file ? [file] : []}
              onChange={(f) => change(f[0])}
            />
          </fieldset>
          {file && !isPDF && <FilePreview file={file} label="Source image" />}
        </Panel>
        <Panel title="Recognition settings" className="tool-controls">
          <fieldset disabled={pending} className="form-grid">
            <Field label="OCR language">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as OCRLanguage)}
              >
                <option value="eng">English</option>
                <option value="hin">Hindi</option>
                <option value="eng+hin">English + Hindi</option>
              </select>
            </Field>
            <Field label="Text cleanup"><select value={filter} onChange={event => setFilter(event.target.value as OCRFilter)}><option value="adaptive">Adaptive · uneven lighting</option><option value="otsu">Crisp B&W · even scans</option><option value="contrast">Grayscale · preserve faint ink</option></select></Field>
            {isPDF && (
              <Field label="PDF pages · empty means all">
                <input
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  placeholder="1, 3-5"
                />
              </Field>
            )}
          </fieldset>
          <p className="notice">
            Extract Text loads the selected language model from this site when
            needed. The browser caches models when storage is available. OCR
            converts images to grayscale, upscales small text up to 2× with bicubic interpolation and applies the selected contrast/threshold cleanup. If faint text disappears, try Grayscale. For PDFs, select up to 12 pages per run.
          </p>
          <div className="action-row">
            <Button disabled={!file || pending} onClick={() => void run()}>
              <ScanText size={17} /> Extract text
            </Button>
            {pending && (
              <Button variant="secondary" onClick={() => work.current?.abort()}>
                Cancel recognition
              </Button>
            )}
          </div>
          <ErrorState error={error} />
          <Progress pending={pending} progress={progress} label={stage} />
        </Panel>
      </div>
      {recognized && (
        <Panel title="Recognized text">
          {prepared && <FilePreview file={prepared} label="Prepared OCR source (last page)" />}
          <Field label="Review or correct the text">
            <textarea
              lang={language === 'hin' ? 'hi' : undefined}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <div className="action-row">
            <Button
              variant="secondary"
              disabled={!text}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text)
                  setMessage('Text copied.')
                } catch {
                  setMessage(
                    'Clipboard unavailable. Select the text and copy it manually.',
                  )
                }
              }}
            >
              <Copy size={17} /> Copy text
            </Button>
            <Button variant="secondary" disabled={!text.trim()} onClick={() => VaultBridge.saveFile(new Blob([text], { type: 'text/plain;charset=utf-8' }), stem(file?.name || 'ocr') + '-text.txt', 'Personal')}>Save Note to Vault</Button>
            <Button
              variant="secondary"
              disabled={!text.trim() || exporting}
              onClick={() => void downloadDocx()}
            >
              <Download size={17} />{' '}
              {exporting ? 'Preparing Word file…' : 'Download Word (.docx)'}
            </Button>
          </div>
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
        </Panel>
      )}
      {recognized && text && (
        <Results
          items={[
            {
              name: stem(file?.name || 'ocr') + '-text.txt',
              blob: new Blob([text], { type: 'text/plain;charset=utf-8' }),
            },
          ]}
        />
      )}
    </>
  )
}
