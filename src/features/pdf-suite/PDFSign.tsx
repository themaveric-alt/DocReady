import { useEffect, useRef, useState } from 'react'
import { Eraser, PenTool } from 'lucide-react'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
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
import { PDF, stem, type Output } from '../../lib/files'
import { pdfBlob } from '../../lib/pdf-edit'
import { canvasBlob } from '../../lib/raster'

function hex(value: string) {
  const source = value.replace('#', '')
  return rgb(
    parseInt(source.slice(0, 2), 16) / 255,
    parseInt(source.slice(2, 4), 16) / 255,
    parseInt(source.slice(4, 6), 16) / 255,
  )
}

async function sign(
  file: File,
  signature: Blob | undefined,
  typed: string,
  pageNumber: number,
  placement: { x: number; y: number; width: number; height: number },
  color: string,
) {
  const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false })
  if (pageNumber < 1 || pageNumber > doc.getPageCount())
    throw Error(`Choose a page from 1 to ${doc.getPageCount()}.`)
  const page = doc.getPage(pageNumber - 1)
  const box = page.getCropBox()
  const x = box.x + (box.width * placement.x) / 100
  const y = box.y + (box.height * (100 - placement.y - placement.height)) / 100
  const width = (box.width * placement.width) / 100
  const height = (box.height * placement.height) / 100
  if (signature) {
    const bytes = await signature.arrayBuffer()
    let image
    try {
      image = signature.type === 'image/jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
    } catch {
      throw Error('Use a PNG or JPEG signature image.')
    }
    const ratio = Math.min(width / image.width, height / image.height)
    const drawWidth = image.width * ratio
    const drawHeight = image.height * ratio
    page.drawImage(image, { x, y: y + (height - drawHeight) / 2, width: drawWidth, height: drawHeight })
  } else {
    const text = typed.trim()
    if (!text) throw Error('Draw, upload, or type a signature first.')
    const font = await doc.embedFont(StandardFonts.HelveticaOblique)
    const size = Math.max(9, Math.min(height * 0.68, width / Math.max(1, font.widthOfTextAtSize(text, 1))))
    page.drawText(text, { x, y: y + Math.max(1, (height - size) / 2), size, font, color: hex(color) })
  }
  return pdfBlob(await doc.save())
}

export default function PDFSign() {
  const [file, setFile] = useState<File>()
  const [mode, setMode] = useState<'draw' | 'type' | 'image'>('draw')
  const [typed, setTyped] = useState('')
  const [image, setImage] = useState<File>()
  const [page, setPage] = useState(1)
  const [color, setColor] = useState('#172033')
  const [placement, setPlacement] = useState({ x: 62, y: 76, width: 26, height: 9 })
  const [drawn, setDrawn] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const previous = useRef<{ x: number; y: number } | undefined>(undefined)
  const op = useOperation()
  useEffect(() => {
    const surface = canvas.current
    if (!surface) return
    const context = surface.getContext('2d')!
    context.fillStyle = '#fff'
    context.fillRect(0, 0, surface.width, surface.height)
    context.strokeStyle = color
    context.lineWidth = 5
    context.lineCap = 'round'
    context.lineJoin = 'round'
  }, [color])
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * event.currentTarget.width,
      y: ((event.clientY - bounds.top) / bounds.height) * event.currentTarget.height,
    }
  }
  function begin(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = true
    previous.current = point(event)
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !previous.current) return
    const next = point(event)
    const context = event.currentTarget.getContext('2d')!
    context.strokeStyle = color
    context.beginPath()
    context.moveTo(previous.current.x, previous.current.y)
    context.lineTo(next.x, next.y)
    context.stroke()
    previous.current = next
    setDrawn(true)
  }
  function clear() {
    const surface = canvas.current
    if (!surface) return
    const context = surface.getContext('2d')!
    context.fillStyle = '#fff'
    context.fillRect(0, 0, surface.width, surface.height)
    setDrawn(false)
  }
  async function signatureBlob() {
    if (mode === 'image') return image
    if (mode === 'draw') {
      if (!drawn || !canvas.current) return undefined
      return canvasBlob(canvas.current, 'image/png')
    }
    return undefined
  }
  return (
    <>
      <div className="tool-layout">
        <Panel title="PDF and signature">
          <Dropzone accept={[PDF]} label="Choose a PDF" description="PDF" onFiles={([next]) => { setFile(next); op.reset() }} />
          <FileList files={file ? [file] : []} onChange={([next]) => { setFile(next); op.reset() }} />
          <Field label="Signature source">
            <select value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); op.reset() }}>
              <option value="draw">Draw a signature</option>
              <option value="type">Type a signature</option>
              <option value="image">Upload PNG or JPEG</option>
            </select>
          </Field>
          {mode === 'draw' && (
            <div className="signature-pad-wrap">
              <canvas ref={canvas} className="signature-pad" width="760" height="220" aria-label="Draw signature" onPointerDown={begin} onPointerMove={move} onPointerUp={() => { drawing.current = false; previous.current = undefined }} onPointerCancel={() => { drawing.current = false; previous.current = undefined }} />
              <Button variant="quiet" onClick={clear}><Eraser size={16} /> Clear drawing</Button>
            </div>
          )}
          {mode === 'type' && <Field label="Signature text"><input value={typed} maxLength={70} onChange={(event) => { setTyped(event.target.value); op.reset() }} placeholder="Your name" /></Field>}
          {mode === 'image' && <Dropzone accept={['image/png', 'image/jpeg']} label="Choose a signature image" description="PNG or JPEG" onFiles={([next]) => { setImage(next); op.reset() }} />}
        </Panel>
        <Panel title="Placement" className="tool-controls">
          <div className="form-grid">
            <Field label="Page"><input type="number" min={1} value={page} onChange={(event) => setPage(Number(event.target.value))} /></Field>
            {(['x', 'y', 'width', 'height'] as const).map((key) => <Field key={key} label={`${key === 'x' ? 'Left' : key === 'y' ? 'Top' : key[0].toUpperCase() + key.slice(1)} (%)`}><input type="number" min={0} max={100} value={placement[key]} onChange={(event) => { setPlacement((old) => ({ ...old, [key]: Number(event.target.value) })); op.reset() }} /></Field>)}
            <Field label="Ink color"><input type="color" value={color} onChange={(event) => { setColor(event.target.value); op.reset() }} /></Field>
          </div>
          <p className="notice">This adds a visible signature mark to a new PDF copy. It is not a cryptographic or identity-verification signature.</p>
          <div className="action-row"><Button disabled={!file || op.pending || (mode === 'draw' && !drawn) || (mode === 'image' && !image) || (mode === 'type' && !typed.trim())} onClick={() => void op.run(async () => {
            const blob = await sign(file!, await signatureBlob(), typed, page, placement, color)
            return [{ name: `${stem(file!.name)}-signed.pdf`, blob, detail: 'Visible signature embedded' } satisfies Output]
          })}><PenTool size={17} /> Sign PDF</Button></div>
          <ErrorState error={op.error} />
          <Progress pending={op.pending} progress={op.progress} label="Embedding signature locally" />
        </Panel>
      </div>
      <Results items={op.items} message="Your signed PDF is ready." />
    </>
  )
}
