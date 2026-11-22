import { useEffect, useState } from 'react'
import { PDFDocument } from 'pdf-lib'
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
  useObjectUrl,
  useOperation,
} from '../../components/shared'
import {
  errorText,
  PDF,
  parsePages,
  stem,
  zipFiles,
  type Output,
} from '../../lib/files'
import { openEdit, pdfBlob } from '../../lib/pdf-edit'
import { loadRender, renderPage } from '../../lib/pdf-render'
import { canvasBlob } from '../../lib/raster'
import { ocrDocx } from '../../lib/ocr-docx'
import { makeXlsx } from '../../lib/simple-xlsx'
import { extractiveSummary, extractPdfText, pdfLinesText, toMarkdown } from './pdf-text'

function OutputPreview({ blob, label }: { blob?: Blob; label: string }) {
  const url = useObjectUrl(blob)
  if (!url) return null
  return <img className="pdf-suite-image" alt={label} src={url} />
}

async function repair(file: File) {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(await file.arrayBuffer(), {
      ignoreEncryption: false,
      throwOnInvalidObject: false,
      updateMetadata: false,
    })
  } catch (error) {
    if (/encrypt/i.test(errorText(error)))
      throw Error('Unlock this password-protected PDF before attempting a repair.')
    throw Error('This PDF is too damaged for the local repair engine to rebuild.')
  }
  if (!doc.getPageCount()) throw Error('No readable pages were found.')
  return pdfBlob(await doc.save({ useObjectStreams: true, addDefaultPage: false }))
}

async function cropPdf(file: File, range: string, inset: { top: number; right: number; bottom: number; left: number }) {
  for (const [key, value] of Object.entries(inset)) {
    if (!Number.isFinite(value) || value < 0 || value >= 100)
      throw Error(`${key} crop must be between 0 and 99 percent.`)
  }
  if (inset.left + inset.right >= 99 || inset.top + inset.bottom >= 99)
    throw Error('Keep a visible part of every page.')
  const doc = await openEdit(file)
  const pages = parsePages(range, doc.getPageCount())
  for (const index of pages) {
    const page = doc.getPage(index)
    const box = page.getCropBox()
    const width = box.width * (1 - (inset.left + inset.right) / 100)
    const height = box.height * (1 - (inset.top + inset.bottom) / 100)
    page.setCropBox(
      box.x + (box.width * inset.left) / 100,
      box.y + (box.height * inset.bottom) / 100,
      width,
      height,
    )
  }
  return pdfBlob(await doc.save())
}

async function redactPdf(
  file: File,
  range: string,
  box: { x: number; y: number; width: number; height: number },
  report: (value: number) => void,
) {
  const doc = await loadRender(file, { workerRendering: true })
  const target = await PDFDocument.create()
  try {
    const pages = parsePages(range, doc.numPages)
    for (const [position, index] of pages.entries()) {
      const page = await doc.getPage(index + 1)
      const view = page.getViewport({ scale: 1 })
      const canvas = await renderPage(doc, index, 1.5)
      try {
        const context = canvas.getContext('2d')!
        context.fillStyle = '#000'
        context.fillRect(
          (box.x / 100) * canvas.width,
          (box.y / 100) * canvas.height,
          (box.width / 100) * canvas.width,
          (box.height / 100) * canvas.height,
        )
        const image = await target.embedPng(
          await (await canvasBlob(canvas, 'image/png')).arrayBuffer(),
        )
        target.addPage([view.width, view.height]).drawImage(image, {
          x: 0,
          y: 0,
          width: view.width,
          height: view.height,
        })
      } finally {
        canvas.width = 0
        canvas.height = 0
        page.cleanup()
      }
      report(((position + 1) / pages.length) * 95)
    }
  } finally {
    await doc.dispose().catch(() => {})
  }
  return pdfBlob(await target.save())
}

async function comparePdf(
  first: File,
  second: File,
  report: (value: number) => void,
) {
  const [left, right] = await Promise.all([
    loadRender(first, { workerRendering: true }),
    loadRender(second, { workerRendering: true }),
  ])
  try {
    const count = Math.min(left.numPages, right.numPages, 20)
    if (!count) throw Error('Both PDFs need at least one page.')
    const diffs: Output[] = []
    let comparedPixels = 0
    let changedPixels = 0
    for (let index = 0; index < count; index++) {
      const [a, b] = await Promise.all([
        renderPage(left, index, 0.62),
        renderPage(right, index, 0.62),
      ])
      const width = Math.min(a.width, b.width)
      const height = Math.min(a.height, b.height)
      const output = document.createElement('canvas')
      output.width = width
      output.height = height
      const sourceA = a.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height)
      const sourceB = b.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height)
      const image = output.getContext('2d', { willReadFrequently: true })!.createImageData(width, height)
      for (let pixel = 0; pixel < image.data.length; pixel += 4) {
        const delta =
          Math.abs(sourceA.data[pixel] - sourceB.data[pixel]) +
          Math.abs(sourceA.data[pixel + 1] - sourceB.data[pixel + 1]) +
          Math.abs(sourceA.data[pixel + 2] - sourceB.data[pixel + 2])
        const changed = delta > 70
        comparedPixels++
        if (changed) changedPixels++
        image.data[pixel] = changed ? 237 : sourceA.data[pixel]
        image.data[pixel + 1] = changed ? 83 : sourceA.data[pixel + 1]
        image.data[pixel + 2] = changed ? 90 : sourceA.data[pixel + 2]
        image.data[pixel + 3] = 255
      }
      output.getContext('2d')!.putImageData(image, 0, 0)
      diffs.push({
        name: `difference-page-${index + 1}.png`,
        blob: await canvasBlob(output, 'image/png'),
        detail: 'Red pixels mark visual changes',
      })
      a.width = a.height = b.width = b.height = output.width = output.height = 0
      report(((index + 1) / count) * 88)
    }
    const note = new Blob(
      [
        `Compared ${count} page pair${count === 1 ? '' : 's'} locally.\n`,
        `Page-count difference: ${left.numPages - right.numPages}.\n`,
        `Changed comparison pixels: ${changedPixels} of ${comparedPixels} (${((changedPixels / Math.max(1, comparedPixels)) * 100).toFixed(2)}%).\n`,
        'This is a raster visual comparison, not a legal semantic diff.\n',
      ],
      { type: 'text/plain;charset=utf-8' },
    )
    const outputs: Output[] = [
      ...diffs,
      { name: 'pdf-comparison-report.txt', blob: note, detail: 'Local comparison report' },
    ]
    return diffs.length > 1 ? [...outputs, await zipFiles(outputs, 'pdf-comparison.zip')] : outputs
  } finally {
    await left.dispose().catch(() => {})
    await right.dispose().catch(() => {})
  }
}

async function pptxFromPdf(file: File, report: (value: number) => void) {
  const pages = await extractPdfText(file, undefined, report)
  const { default: PptxGenJS } = await import('pptxgenjs')
  const deck = new PptxGenJS()
  deck.layout = 'LAYOUT_WIDE'
  deck.author = 'DocReady'
  deck.subject = 'Local PDF-to-PowerPoint export'
  for (const page of pages) {
    const slide = deck.addSlide()
    slide.background = { color: 'FFFFFF' }
    for (const line of page.lines) {
      const x = Math.max(0.08, (line.x / page.width) * 13.333)
      const y = Math.max(0.08, ((page.height - line.y - line.height) / page.height) * 7.5)
      const w = Math.min(13.1 - x, Math.max(0.25, (line.width / page.width) * 13.333))
      const h = Math.min(0.7, Math.max(0.18, (line.height / page.height) * 7.5 * 1.3))
      slide.addText(line.text, {
        x,
        y,
        w,
        h,
        fontFace: 'Aptos',
        fontSize: Math.max(7, Math.min(28, (line.font / page.height) * 7.5 * 72)),
        margin: 0,
        color: '172033',
        breakLine: false,
        fit: 'shrink',
      })
    }
  }
  return (await deck.write({ outputType: 'blob' })) as Blob
}

async function xlsxFromPdf(file: File, report: (value: number) => void) {
  const pages = await extractPdfText(file, undefined, report)
  return makeXlsx(
    pages.map((page) => ({
      name: `Page ${page.index + 1}`,
      rows: [['Extracted text'], ...page.lines.map((line) => [line.text])],
    })),
  )
}

function PdfSource({ file, onChange, label = 'Choose a PDF' }: { file?: File; onChange: (file?: File) => void; label?: string }) {
  return (
    <>
      <Dropzone accept={[PDF]} label={label} description="PDF" onFiles={([next]) => onChange(next)} />
      <FileList files={file ? [file] : []} onChange={([next]) => onChange(next)} />
    </>
  )
}

export default function PdfExtraTool({ id }: { id: string }) {
  const [file, setFile] = useState<File>()
  const [other, setOther] = useState<File>()
  const [range, setRange] = useState('')
  const [inset, setInset] = useState({ top: 0, right: 0, bottom: 0, left: 0 })
  const [redaction, setRedaction] = useState({ x: 10, y: 10, width: 30, height: 10 })
  const [confirmed, setConfirmed] = useState(false)
  const [preview, setPreview] = useState<Blob>()
  const op = useOperation()
  const isCompare = id === 'compare-pdf'
  const isCrop = id === 'crop-pdf'
  const isRedact = id === 'redact-pdf'
  const needsText = ['pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'ai-summarizer', 'pdf-to-markdown'].includes(id)
  useEffect(() => {
    setPreview(undefined)
    op.reset()
    // Reset only when switching between route instances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  async function run(report: (value: number) => void): Promise<Output[]> {
    if (isCompare) {
      if (!file || !other) throw Error('Choose both PDFs to compare.')
      return comparePdf(file, other, report)
    }
    if (!file) throw Error('Choose a PDF.')
    if (id === 'repair-pdf') {
      const blob = await repair(file)
      return [{ name: `${stem(file.name)}-repaired.pdf`, blob, detail: 'Rebuilt local PDF structure' }]
    }
    if (isCrop) {
      const blob = await cropPdf(file, range, inset)
      return [{ name: `${stem(file.name)}-cropped.pdf`, blob, detail: 'Updated crop boxes' }]
    }
    if (isRedact) {
      if (!confirmed) throw Error('Confirm permanent raster redaction before exporting.')
      const blob = await redactPdf(file, range, redaction, report)
      return [{ name: `${stem(file.name)}-redacted.pdf`, blob, detail: 'Rasterized permanent redaction' }]
    }
    if (!needsText) throw Error('This PDF tool is unavailable.')
    const pages = await extractPdfText(file, undefined, (done, total) => report((done / total) * 80))
    const text = pdfLinesText(pages)
    if (id === 'pdf-to-word') {
      const blob = await ocrDocx(text)
      return [{ name: `${stem(file.name)}.docx`, blob, detail: 'Editable extracted text' }]
    }
    if (id === 'pdf-to-powerpoint') {
      const blob = await pptxFromPdf(file, report)
      return [{ name: `${stem(file.name)}.pptx`, blob, detail: 'Editable reconstructed text slides' }]
    }
    if (id === 'pdf-to-excel') {
      const blob = await xlsxFromPdf(file, report)
      return [{ name: `${stem(file.name)}.xlsx`, blob, detail: 'One extracted text column per PDF page' }]
    }
    if (id === 'ai-summarizer') {
      const bullets = extractiveSummary(text)
      const value = `# ${stem(file.name)} — Local extractive summary\n\n${bullets.map((item) => `- ${item}`).join('\n')}\n\n---\nGenerated locally from embedded PDF text. Review the source document for context.\n`
      return [{ name: `${stem(file.name)}-summary.md`, blob: new Blob([value], { type: 'text/markdown;charset=utf-8' }), detail: `${bullets.length} ranked source sentences` }]
    }
    const value = toMarkdown(pages)
    return [{ name: `${stem(file.name)}.md`, blob: new Blob([value], { type: 'text/markdown;charset=utf-8' }), detail: 'Structured local text extraction' }]
  }
  const title =
    id === 'repair-pdf' ? 'Repair a PDF locally' :
    id === 'crop-pdf' ? 'Crop visible PDF page boxes' :
    isRedact ? 'Permanently redact a PDF area' :
    isCompare ? 'Compare two PDFs' :
    id === 'ai-summarizer' ? 'Summarize embedded PDF text' :
    'Convert embedded PDF text'
  return (
    <>
      <div className="tool-layout">
        <Panel title={title}>
          <PdfSource file={file} onChange={setFile} label={isCompare ? 'First PDF' : 'Choose a PDF'} />
          {isCompare && <PdfSource file={other} onChange={setOther} label="Second PDF" />}
          <ErrorState error={op.error} />
        </Panel>
        <Panel title="Output settings" className="tool-controls">
          {(isCrop || isRedact) && (
            <Field label="Pages · empty means all">
              <input value={range} onChange={(event) => { setRange(event.target.value); op.reset() }} placeholder="1, 3-5" />
            </Field>
          )}
          {isCrop && (
            <div className="form-grid">
              {(['top', 'right', 'bottom', 'left'] as const).map((edge) => (
                <Field key={edge} label={`${edge[0].toUpperCase()}${edge.slice(1)} inset (%)`}>
                  <input type="number" min={0} max={98} value={inset[edge]} onChange={(event) => { setInset((old) => ({ ...old, [edge]: Number(event.target.value) })); op.reset() }} />
                </Field>
              ))}
            </div>
          )}
          {isRedact && (
            <>
              <div className="form-grid">
                {(['x', 'y', 'width', 'height'] as const).map((key) => (
                  <Field key={key} label={`${key === 'x' ? 'Left' : key === 'y' ? 'Top' : key[0].toUpperCase() + key.slice(1)} (%)`}>
                    <input type="number" min={0} max={100} value={redaction[key]} onChange={(event) => { setRedaction((old) => ({ ...old, [key]: Number(event.target.value) })); op.reset() }} />
                  </Field>
                ))}
              </div>
              <Check label="I understand the result rasterizes every exported page so original text is not retained." checked={confirmed} onChange={setConfirmed} />
              <p className="notice">This tool burns pixels into a new PDF. It does not preserve selectable text, links, form fields, or digital signatures on exported pages.</p>
            </>
          )}
          {id === 'pdf-to-powerpoint' && <p className="notice">Text boxes are reconstructed as editable slide elements. Original images, diagrams, and complex design elements are not recreated.</p>}
          {id === 'pdf-to-excel' && <p className="notice">This extracts ordered text rows; it does not claim perfect table recognition.</p>}
          {id === 'ai-summarizer' && <p className="notice">This is a local extractive summary: it selects important source sentences and does not invent new claims.</p>}
          <div className="action-row">
            <Button disabled={op.pending || !file || (isCompare && !other) || (isRedact && !confirmed)} onClick={() => void op.run(run)}>
              {isCompare ? 'Compare PDFs' : isRedact ? 'Create redacted PDF' : id === 'repair-pdf' ? 'Repair PDF' : 'Generate output'}
            </Button>
          </div>
          <Progress pending={op.pending} progress={op.progress} label="Processing locally" />
        </Panel>
      </div>
      {preview && <OutputPreview blob={preview} label="Generated PDF preview" />}
      <Results items={op.items} message="Your local output is ready." />
    </>
  )
}
