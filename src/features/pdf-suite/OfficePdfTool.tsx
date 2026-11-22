import { useState } from 'react'
import {
  Button,
  Dropzone,
  ErrorState,
  Field,
  FileList,
  Panel,
  Progress,
  Results,
  useOperation,
} from '../../components/shared'
import { stem, type Output } from '../../lib/files'
import { ensureFonts, families } from '../translation/fonts'
import { readSpreadsheet } from '../../lib/simple-xlsx'

type TextPage = { title: string; paragraphs: string[]; table?: string[][] }

const pageWidth = 1240
const pageHeight = 1754
const contentLeft = 92
const contentRight = pageWidth - 92

function wrap(ctx: CanvasRenderingContext2D, value: string, width: number) {
  const words = value.replaceAll(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= width || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function newSurface() {
  const canvas = document.createElement('canvas')
  canvas.width = pageWidth
  canvas.height = pageHeight
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, pageWidth, pageHeight)
  ctx.fillStyle = '#172033'
  ctx.textBaseline = 'top'
  return { canvas, ctx }
}

function header(ctx: CanvasRenderingContext2D, title: string, page: number) {
  ctx.fillStyle = '#5757f5'
  ctx.fillRect(contentLeft, 68, 48, 6)
  ctx.fillStyle = '#172033'
  ctx.font = `700 32px ${families.sans}`
  ctx.fillText(title || 'Converted document', contentLeft, 98)
  ctx.fillStyle = '#637083'
  ctx.font = `400 18px ${families.sans}`
  ctx.fillText(`DocReady local export · ${page}`, contentLeft, pageHeight - 72)
}

async function pagesToPdf(sources: HTMLCanvasElement[]) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  for (const [index, canvas] of sources.entries()) {
    if (index) pdf.addPage('a4', 'portrait')
    const image = canvas.toDataURL('image/jpeg', 0.94)
    pdf.addImage(image, 'JPEG', 0, 0, 595.28, 841.89, undefined, 'FAST')
    canvas.width = 0
    canvas.height = 0
  }
  return pdf.output('blob')
}

async function textPdf(sources: TextPage[]) {
  await ensureFonts()
  const rendered: HTMLCanvasElement[] = []
  let pageNumber = 0
  for (const source of sources) {
    let surface = newSurface()
    pageNumber++
    header(surface.ctx, source.title, pageNumber)
    let y = 170
    const nextPage = () => {
      rendered.push(surface.canvas)
      surface = newSurface()
      pageNumber++
      header(surface.ctx, source.title, pageNumber)
      y = 170
    }
    if (source.table?.length) {
      const rows = source.table
      const columns = Math.max(...rows.map((row) => row.length))
      if (rows.length > 250 || columns > 7) throw Error('This table exceeds the supported 250 rows or 7 columns. Select a smaller worksheet before converting.')
      const cellWidth = (contentRight - contentLeft) / columns
      for (const [rowIndex, raw] of rows.entries()) {
        const row = Array.from({ length: columns }, (_, i) => String(raw[i] ?? ''))
        const cellLines = row.map((cell) => {
          surface.ctx.font = `400 17px ${families.sans}`
          const lines = wrap(surface.ctx, cell, cellWidth - 16)
          if (lines.length > 40) throw Error('A spreadsheet cell is too long to fit on a page. Shorten it or split the worksheet.')
          return lines
        })
        const rowHeight = Math.max(36, ...cellLines.map((lines) => lines.length * 23 + 15))
        if (y + rowHeight > pageHeight - 115) nextPage()
        for (let col = 0; col < columns; col++) {
          const x = contentLeft + col * cellWidth
          surface.ctx.fillStyle = rowIndex === 0 ? '#eef0ff' : '#fff'
          surface.ctx.fillRect(x, y, cellWidth, rowHeight)
          surface.ctx.strokeStyle = '#dbe1ec'
          surface.ctx.strokeRect(x, y, cellWidth, rowHeight)
          surface.ctx.fillStyle = '#172033'
          surface.ctx.font = `${rowIndex === 0 ? '700' : '400'} 17px ${families.sans}`
          cellLines[col].forEach((line, index) =>
            surface.ctx.fillText(line, x + 8, y + 8 + index * 23),
          )
        }
        y += rowHeight
      }
    }
    for (const paragraph of source.paragraphs) {
      const trimmed = paragraph.trim()
      if (!trimmed) continue
      const isHeading = trimmed.length < 110 && (/^[A-Z\d][A-Z\d \-:]{4,}$/u.test(trimmed) || /^#{1,3}\s/.test(trimmed))
      surface.ctx.fillStyle = '#172033'
      surface.ctx.font = `${isHeading ? '700 28px' : '400 22px'} ${families.sans}`
      const lines = wrap(surface.ctx, trimmed.replace(/^#{1,3}\s/, ''), contentRight - contentLeft)
      const lineHeight = isHeading ? 38 : 32
      lines.forEach((line) => {
        if (y + lineHeight > pageHeight - 115) nextPage()
        surface.ctx.font = `${isHeading ? '700 28px' : '400 22px'} ${families.sans}`
        surface.ctx.fillStyle = '#172033'
        surface.ctx.fillText(line, contentLeft, y)
        y += lineHeight
      })
      y += isHeading ? 22 : 16
    }
    rendered.push(surface.canvas)
  }
  return pagesToPdf(rendered)
}

function extension(file?: File) {
  return file?.name.split('.').pop()?.toLocaleLowerCase() ?? ''
}

function textFromPptxXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw Error('This PPTX slide XML could not be read.')
  return Array.from(
    doc.getElementsByTagNameNS(
      'http://schemas.openxmlformats.org/drawingml/2006/main',
      't',
    ),
    (node) => node.textContent?.trim() ?? '',
  ).filter(Boolean)
}

async function convertOffice(id: string, file: File, html: string) {
  if (id === 'html-to-pdf') {
    const source = html || (file ? await file.text() : '')
    if (!source.trim()) throw Error('Paste HTML or choose an HTML file.')
    const doc = new DOMParser().parseFromString(source, 'text/html')
    doc.querySelectorAll('script, iframe, object, embed, link, base').forEach((node) => node.remove())
    doc.querySelectorAll<HTMLElement>('*').forEach((node) => {
      for (const attribute of [...node.attributes]) {
        if (/^on/i.test(attribute.name) || /^(src|href)$/i.test(attribute.name)) node.removeAttribute(attribute.name)
      }
    })
    const paragraphs = Array.from(doc.body.querySelectorAll('h1,h2,h3,h4,p,li,pre,td,th'), (node) => node.textContent?.trim() ?? '').filter(Boolean)
    if (!paragraphs.length && doc.body.textContent?.trim()) paragraphs.push(doc.body.textContent.trim())
    if (!paragraphs.length) throw Error('No readable text was found in this HTML.')
    return textPdf([{ title: doc.title || stem(file?.name || 'HTML'), paragraphs }])
  }
  if (!file) throw Error('Choose a source file.')
  if (id === 'word-to-pdf') {
    if (extension(file) !== 'docx') throw Error('Choose a .docx Word document.')
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    const paragraphs = result.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (!paragraphs.length) throw Error('No readable Word text was found in this file.')
    return textPdf([{ title: stem(file.name), paragraphs }])
  }
  if (id === 'powerpoint-to-pdf') {
    if (extension(file) !== 'pptx') throw Error('Choose a .pptx presentation.')
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const slides = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
    if (!slides.length) throw Error('No PowerPoint slides were found.')
    const pages = await Promise.all(
      slides.map(async (name, index) => ({
        title: `Slide ${index + 1}`,
        paragraphs: textFromPptxXml(await zip.file(name)!.async('text')),
      })),
    )
    if (!pages.some((page) => page.paragraphs.length)) throw Error('No readable slide text was found.')
    return textPdf(pages)
  }
  if (id === 'excel-to-pdf') {
    if (!/^(xlsx|csv)$/i.test(extension(file))) throw Error('Choose an .xlsx or .csv spreadsheet.')
    const sheets = await readSpreadsheet(file)
    const pages = sheets.map((sheet) => ({
      title: sheet.name,
      paragraphs: [],
      table: sheet.rows,
    })).filter((page) => page.table.length)
    if (!pages.length) throw Error('No readable spreadsheet rows were found.')
    return textPdf(pages)
  }
  throw Error('This local converter is unavailable.')
}

export default function OfficePdfTool({ id }: { id: string }) {
  const [file, setFile] = useState<File>()
  const [html, setHtml] = useState('')
  const op = useOperation()
  // The shared dropzone validates magic bytes only for PDF/image formats.
  // Office containers are validated by their extension and parser below.
  const accept: string[] = []
  const title =
    id === 'word-to-pdf'
      ? 'DOCX source'
      : id === 'powerpoint-to-pdf'
        ? 'PPTX source'
        : id === 'excel-to-pdf'
          ? 'Spreadsheet source'
          : 'HTML source'
  return (
    <>
      <div className="tool-layout">
        <Panel title={title}>
          <Dropzone
            accept={accept}
            label={id === 'html-to-pdf' ? 'Choose an HTML file (optional)' : undefined}
            description={
              id === 'word-to-pdf'
                ? 'DOCX'
                : id === 'powerpoint-to-pdf'
                  ? 'PPTX'
                  : id === 'excel-to-pdf'
                    ? 'XLSX or CSV'
                    : 'HTML'
            }
            onFiles={([next]) => {
              setFile(next)
              op.reset()
            }}
          />
          <FileList files={file ? [file] : []} onChange={([next]) => { setFile(next); op.reset() }} />
          {id === 'html-to-pdf' && (
            <Field label="Or paste HTML">
              <textarea
                rows={13}
                maxLength={200000}
                value={html}
                placeholder="<h1>My document</h1><p>Prepared locally.</p>"
                onChange={(event) => { setHtml(event.target.value); op.reset() }}
              />
            </Field>
          )}
        </Panel>
        <Panel title="Conversion settings" className="tool-controls">
          <p className="notice">
            Conversion happens inside this browser. Text and basic table content are retained; complex Office layouts, embedded media, macros, and unsupported fonts are not reproduced pixel-for-pixel.
          </p>
          <div className="action-row">
            <Button
              disabled={op.pending || (id !== 'html-to-pdf' && !file) || (id === 'html-to-pdf' && !file && !html.trim())}
              onClick={() => void op.run(async () => {
                const blob = await convertOffice(id, file!, html)
                return [{ name: `${stem(file?.name || 'document')}.pdf`, blob, detail: 'Local PDF export' } satisfies Output]
              })}
            >
              Convert to PDF
            </Button>
          </div>
          <ErrorState error={op.error} />
          <Progress pending={op.pending} progress={op.progress} label="Converting locally" />
        </Panel>
      </div>
      <Results items={op.items} message="Your local PDF export is ready." />
    </>
  )
}
