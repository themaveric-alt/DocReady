import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Dropzone, ErrorState, Field, Panel } from '../components/shared'
import { loadRender, type RenderPDF } from '../lib/pdf-render'
import { errorText, PDF, saveFile, stem } from '../lib/files'
import { editPdf } from '../lib/pdf-edit-client'
import { VaultBridge } from '../lib/vault-bridge'
import './pdf-reader.css'
import { desktop, desktopSave } from '../lib/desktop'

function ReaderPage({ doc, index, zoom, query, visible }: { doc: RenderPDF; index: number; zoom: number; query: string; visible?: boolean }) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const [renderError, setRenderError] = useState('')
  const [near, setNear] = useState(false)
  const [size, setSize] = useState([595, 842])
  const [text, setText] = useState<{ text: string; x: number; y: number; width: number; height: number }[]>([])
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setNear(entries[0].isIntersecting), { rootMargin: '850px 0px' })
    if (host.current) observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let current = true
    let render: { cancel(): void; promise: Promise<unknown> } | undefined
    const target = canvas.current
    if (!near && !visible) {
      if (target) target.width = target.height = 0
      setText([])
      return
    }
    void (async () => {
      const page = await doc.getPage(index + 1)
      const viewport = page.getViewport({ scale: zoom })
      if (!current || !target) return
      setSize([viewport.width, viewport.height])
      const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(4000000 / (viewport.width * viewport.height)))
      target.width = Math.ceil(viewport.width * ratio)
      target.height = Math.ceil(viewport.height * ratio)
      render = page.render({ canvas: target, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      await render.promise
      if (!query.trim()) { if (current) setText([]); return }
      const content = await page.getTextContent()
      if (!current) return
      setText(content.items.flatMap(item => {
        if (!('str' in item) || !item.str.toLocaleLowerCase().includes(query.toLocaleLowerCase())) return []
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5])
        return [{ text: item.str, x, y: y - item.height * zoom, width: item.width * zoom, height: item.height * zoom }]
      }))
    })().catch(error => { if (current && error?.name !== 'RenderingCancelledException') setRenderError('This page could not render. Try a lower zoom level.') })
    return () => { current = false; render?.cancel() }
  }, [doc, index, zoom, near, visible, query])
  return <div ref={host} id={'reader-page-' + index} className="reader-page" style={{ width: size[0], height: size[1] }} aria-label={'Page ' + (index + 1)}>
    {renderError && <p role="alert">{renderError}</p>}
    <canvas ref={canvas} style={{ width: '100%', height: '100%' }} />
    {text.map((item, n) => <mark title={item.text} key={n} style={{ position: 'absolute', left: item.x, top: item.y, width: item.width, height: item.height, opacity: .45 }} />)}
  </div>
}
export default function PDFReader({ initial }: { initial?: File }) {
  const [file, setFile] = useState<File | undefined>(initial), [doc, setDoc] = useState<RenderPDF>()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(1), [mode, setMode] = useState('day'), [single, setSingle] = useState(false)
  const [page, setPage] = useState(0), [query, setQuery] = useState(''), [order, setOrder] = useState<number[]>([])
  const [output, setOutput] = useState<Blob>(), [outline, setOutline] = useState<{ title: string; page: number }[]>([])
  const search = useRef<HTMLInputElement>(null)
  const signal = useRef<AbortController | undefined>(undefined)
  useEffect(() => {
    if (!file) return
    const controller = new AbortController()
    signal.current = controller
    let loaded: RenderPDF | undefined
    setError(''); setDoc(undefined); setBusy(true); setOutline([])
    void loadRender(file, { signal: controller.signal }).then(async value => {
      loaded = value
      if (controller.signal.aborted) return
      setDoc(value); setOrder(Array.from({ length: value.numPages }, (_, i) => i)); setPage(0)
      const rows: { title: string; page: number }[] = []
      const source = await value.getOutline()
      async function visit(items: NonNullable<typeof source>) {
        for (const item of items) {
          const destination = typeof item.dest === 'string' ? await value.getDestination(item.dest) : item.dest
          if (destination) {
            const index = typeof destination[0] === 'number' ? destination[0] : await value.getPageIndex(destination[0])
            rows.push({ title: item.title, page: index })
          }
          await visit(item.items)
        }
      }
      await visit(source ?? [])
      if (!controller.signal.aborted) setOutline(rows)
    }).catch(e => { if (!controller.signal.aborted) setError(errorText(e)) }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => { controller.abort(); void loaded?.dispose() }
  }, [file])
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); search.current?.focus() }
      if (event.key.toLowerCase() === 's') { event.preventDefault(); if (file) void download() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [output, file])
  async function download() {
    if (!file) return
    const name = stem(file.name) + '-edited.pdf'
    try {
      if (desktop()) await desktopSave(output ?? file, name)
      else saveFile({ name, blob: output ?? file })
    } catch { setError('The PDF could not be saved. Try again and check available storage.') }
  }
  async function organize(action: 'rotate-pdf' | 'reorder-pdf') {
    if (!file || busy) return
    setBusy(true); setError('')
    try {
      const result = await editPdf(action, [file], { pages: action === 'rotate-pdf' ? [page] : order, angle: 90 })
      setFile(new File([result], file.name, { type: PDF })); setOutput(result)
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  function go(index: number) { setPage(index); document.getElementById('reader-page-' + index)?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }
  return <section className={'pdf-reader reader-' + mode}>
    <h1>PDF Reader & Editor</h1><p>Read, search, rotate and organize pages locally. Add annotations in the PDF editing workspace.</p>
    <ErrorState error={error} />
    {!file ? <Panel title="Open a PDF"><Dropzone accept={[PDF]} onFiles={([next]) => { setOutput(undefined); setFile(next) }} label="Select PDF" description="Your document stays on this device" /></Panel> : <>
      <div className="reader-ribbon">
        <Button variant="secondary" onClick={() => { setOutput(undefined); setFile(undefined) }} disabled={busy}>Open another</Button>
        <Field label="Zoom"><select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[.5, .75, 1, 1.25, 1.5, 2, 3].map(value => <option key={value} value={value}>{value * 100}%</option>)}</select></Field>
        <Button variant="secondary" onClick={() => setZoom(Math.max(.5, Math.min(3, (window.innerWidth - (window.innerWidth > 900 ? 400 : 45)) / 595)))}>Fit width</Button>
        <Field label="Reading mode"><select value={mode} onChange={e => setMode(e.target.value)}><option value="day">Day</option><option value="sepia">Sepia</option><option value="dark">Dark</option></select></Field>
        <Field label="Page view"><select value={single ? 'single' : 'continuous'} onChange={e => setSingle(e.target.value === 'single')}><option value="continuous">Continuous</option><option value="single">Single page</option></select></Field>
        <Field label="Find text"><input ref={search} value={query} onChange={e => setQuery(e.target.value)} placeholder="Ctrl+F" /></Field>
        <Link className="btn btn-secondary" to="/tools/annotate-pdf">Add text & shapes</Link><Link className="btn btn-secondary" to="/tools/sign-pdf">Sign</Link>
      </div>
      {busy && <p role="status">Preparing your document…</p>}
      {doc && <div className="reader-layout">
        <aside className="reader-sidebar"><h2>Pages · {doc.numPages}</h2><div className="reader-page-list">{order.map((index, position) => <div key={index}><button aria-current={page === index ? 'page' : undefined} onClick={() => go(index)}>Page {index + 1}</button><button aria-label={'Move page ' + (index + 1) + ' up'} disabled={!position || busy} onClick={() => setOrder(old => { const next = [...old]; [next[position - 1], next[position]] = [next[position], next[position - 1]]; return next })}>↑</button><button aria-label={'Remove page ' + (index + 1)} disabled={order.length === 1 || busy} onClick={() => setOrder(old => old.filter(value => value !== index))}>×</button></div>)}</div><Button disabled={busy} onClick={() => void organize('reorder-pdf')}>Apply page order</Button>
          {!!outline.length && <><h2>Bookmarks</h2>{outline.map((item, i) => <button key={i} onClick={() => go(item.page)}>{item.title}</button>)}</>}
        </aside>
        <div className="reader-scroll">{(single ? [page] : order).map(index => <ReaderPage key={index} doc={doc} index={index} zoom={zoom} query={query} visible={single} />)}</div>
        <aside className="reader-inspector"><h2>Page actions</h2><Field label="Selected page"><input type="number" min={1} max={doc.numPages} value={page + 1} onChange={e => go(Math.max(0, Math.min(doc.numPages - 1, Number(e.target.value) - 1)))} /></Field><Button disabled={busy} onClick={() => void organize('rotate-pdf')}>Rotate selected 90°</Button><p>Page edits create a separate PDF. Review the result before saving.</p><Button onClick={() => void download()}>Download PDF</Button><Button variant="secondary" onClick={() => VaultBridge.saveFile(output ?? file, file.name, 'Personal')}>Save to Encrypted Vault</Button></aside>
      </div>}
    </>}
  </section>
}
