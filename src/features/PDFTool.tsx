import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Trash2,
  RotateCw,
} from 'lucide-react'
import {
  Button,
  Dropzone,
  EmptyState,
  ErrorState,
  Field,
  FileList,
  FilePreview,
  IconButton,
  Panel,
  Progress,
  Results,
  move,
  useObjectUrl,
  useOperation,
} from '../components/shared'
import {
  paperSizes,
  type PDFAction,
} from '../lib/pdf-edit'
import { editPdf, imagesPdf, pdfCounts } from '../lib/pdf-edit-client'
import {
  loadRender,
  renderBlob,
  renderPage,
  type RenderPDF,
} from '../lib/pdf-render'
import {
  compressPdfLocally,
  type PdfCompressionPreset,
} from '../lib/pdf-compression'
import { canvasBlob } from '../lib/raster'
import { runRaster } from '../lib/process-image'
import {
  pageCountLabel,
  errorText,
  extension,
  images,
  parsePages,
  PDF,
  sizeLabel,
  stem,
  zipFiles,
  type Output,
} from '../lib/files'
import { usePrefs } from '../lib/prefs'
function Thumbnail({ blob, label }: { blob?: Blob; label: string }) {
  const url = useObjectUrl(blob)
  return url ? <img alt={label} src={url} /> : null
}
function PDFView({
  doc,
  blobs,
  page,
  setPage,
  rotation = 0,
}: {
  doc: RenderPDF
  blobs: Blob[]
  page: number
  setPage: (page: number) => void
  rotation?: number
}) {
  const [view, setView] = useState<{
      blob: Blob
      width: number
      height: number
    }>(),
    [mode, setMode] = useState('width'),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState('')
  const url = useObjectUrl(view?.blob)
  useEffect(() => {
    let live = true
    setError('')
    setView(undefined)
    renderPage(doc, page, Math.min(2, zoom + 0.4), rotation)
      .then(async (canvas) => {
        const data = {
          blob: await canvasBlob(canvas, 'image/png'),
          width: canvas.width,
          height: canvas.height,
        }
        canvas.width = 0
        canvas.height = 0
        if (live) setView(data)
      })
      .catch((e) => {
        if (live) setError(errorText(e))
      })
    return () => {
      live = false
    }
  }, [doc, page, zoom, rotation])
  return (
    <>
      <div className="action-row">
        <IconButton
          label="Previous page"
          disabled={page <= 0}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </IconButton>
        <span>
          Page {page + 1} / {doc.numPages}
        </span>
        <IconButton
          label="Next page"
          disabled={page >= doc.numPages - 1}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={17} />
        </IconButton>
        <Button
          variant="quiet"
          aria-pressed={mode === 'page'}
          onClick={() => {
            setZoom(1)
            setMode('page')
          }}
        >
          Fit page
        </Button>
        <Button
          variant="quiet"
          aria-pressed={mode === 'width'}
          onClick={() => {
            setZoom(1)
            setMode('width')
          }}
        >
          Fit width
        </Button>
        <IconButton
          label="Zoom out"
          disabled={zoom <= 0.5}
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
        >
          −
        </IconButton>
        <span>{Math.round(zoom * 100)}%</span>
        <IconButton
          label="Zoom in"
          disabled={zoom >= 2}
          onClick={() => setZoom(Math.min(2, zoom + 0.25))}
        >
          +
        </IconButton>
      </div>
      <ErrorState error={error} />
      <div className="pdf-scroll">
        {url && view ? (
          <img
            alt={'PDF page ' + (page + 1)}
            src={url}
            style={{
              width: mode === 'page' ? 'auto' : zoom * 100 + '%',
              height: mode === 'page' ? zoom * 480 + 'px' : 'auto',
              maxWidth: mode === 'page' && zoom === 1 ? '100%' : undefined,
              objectFit: 'contain',
            }}
          />
        ) : (
          !error && <p className="empty-state">Rendering page…</p>
        )}
      </div>
      {view && (
        <p className="mini">
          Preview raster {view.width} × {view.height} px
        </p>
      )}
      {blobs.length > 0 && (
        <div className="thumbs" aria-label="Page thumbnails">
          {blobs.map((blob, i) => (
            <button
              className="thumb"
              type="button"
              key={i}
              aria-current={i === page}
              onClick={() => setPage(i)}
            >
              <Thumbnail blob={blob} label="" />
              <span>Page {i + 1}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
export default function PDFTool({
  id,
  initial,
}: {
  id: string
  initial?: File
}) {
  const pref = usePrefs((s) => s.prefs),
    [files, setFiles] = useState<File[]>(initial ? [initial] : []),
    [counts, setCounts] = useState<number[]>(),
    [doc, setDoc] = useState<RenderPDF>(),
    [outDoc, setOutDoc] = useState<RenderPDF>(),
    [thumbs, setThumbs] = useState<Blob[]>([]),
    [page, setPage] = useState(0),
    [order, setOrder] = useState<number[]>([]),
    [loadError, setLoadError] = useState(''),
    [loading, setLoading] = useState(false)
  const [range, setRange] = useState(''),
    [angle, setAngle] = useState(id === 'watermark-pdf' ? 30 : 90),
    [split, setSplit] = useState(false),
    [splitEvery, setSplitEvery] = useState(0),
    [rotations, setRotations] = useState<Record<number, number>>({}),
    [format, setFormat] = useState('image/png'),
    [scale, setScale] = useState(1.5),
    [quality, setQuality] = useState(0.65),
    [compressionMode, setCompressionMode] = useState<'preset' | 'target'>(
      'preset',
    ),
    [compressionPreset, setCompressionPreset] =
      useState<PdfCompressionPreset>('recommended'),
    [targetSize, setTargetSize] = useState(''),
    [targetUnit, setTargetUnit] = useState<'KB' | 'MB' | 'GB'>('KB'),
    [paper, setPaper] = useState(pref.paper),
    [landscape, setLandscape] = useState(false),
    [fit, setFit] = useState('contain'),
    [margin, setMargin] = useState(16),
    [text, setText] = useState(id === 'number-pdf' ? '{n} / {total}' : ''),
    [color, setColor] = useState('#5348b6'),
    [size, setSize] = useState(id === 'number-pdf' ? 12 : 24),
    [opacity, setOpacity] = useState(0.35),
    [position, setPosition] = useState(
      id === 'number-pdf' ? 'bottom center' : 'center',
    ),
    [start, setStart] = useState(1),
    [shape, setShape] = useState('text'),
    [x, setX] = useState(10),
    [y, setY] = useState(72),
    [w, setW] = useState(120),
    [h, setH] = useState(60)
  const op = useOperation(),
    drag = useRef<number | null>(null)
  const merge = id === 'merge-pdf',
    fromImages = id === 'image-to-pdf',
    preview = id === 'preview-pdf',
    splitTool = id === 'split-pdf' || id === 'extract-pages',
    reorder =
      id === 'reorder-pdf' || id === 'organize-pdf' || id === 'remove-pages',
    exportImages = id === 'pdf-to-image',
    compress = id === 'compress-pdf',
    overlay = ['watermark-pdf', 'number-pdf', 'annotate-pdf', 'edit-pdf'].includes(id)
  const action =
    id === 'organize-pdf' || id === 'remove-pages'
      ? 'reorder-pdf'
      : id === 'extract-pages'
        ? 'split-pdf'
        : id === 'edit-pdf'
          ? 'annotate-pdf'
          : id
  const targetMultiplier =
    targetUnit === 'GB' ? 1024 ** 3 : targetUnit === 'MB' ? 1024 ** 2 : 1024
  const exactTargetBytes =
    compress && compressionMode === 'target' && targetSize.trim()
      ? Number(targetSize) * targetMultiplier
      : undefined
  const chosen = files[0]
  useEffect(() => {
    let live = true,
      loaded: RenderPDF | undefined
    setDoc(undefined)
    setThumbs([])
    setLoadError('')
    setPage(0)
    setRotations({})
    setLoading(false)
    if (!chosen || fromImages || merge) return
    setLoading(true)
    void (async () => {
      try {
        loaded = await loadRender(chosen, { workerRendering: true })
        if (!live) {
          await loaded.dispose()
          return
        }
        setDoc(loaded)
        setOrder(Array.from({ length: loaded.numPages }, (_, i) => i))
        setLoading(false)
        for (let i = 0; i < Math.min(loaded.numPages, 40) && live; i++) {
          const pic = await renderBlob(loaded, i, 0.17)
          if (live) setThumbs((old) => [...old, pic])
        }
      } catch (e) {
        if (live) {
          setLoadError(errorText(e))
          setLoading(false)
        }
      }
    })()
    return () => {
      live = false
      if (loaded) void loaded.dispose()
    }
  }, [chosen, fromImages, merge])
  useEffect(() => {
    if (!merge || !files.length) return
    let live = true
    setCounts(undefined)
    setLoadError('')
    pdfCounts(files)
      .then((all) => {
        if (live) setCounts(all)
      })
      .catch((e) => {
        if (live) setLoadError(errorText(e))
      })
    return () => {
      live = false
    }
  }, [merge, files])
  const output = op.items.find((item) => item.blob.type === PDF)
  useEffect(() => {
    let live = true,
      loaded: RenderPDF | undefined
    setOutDoc(undefined)
    if (output)
      loadRender(output.blob)
        .then(async (d) => {
          loaded = d
          if (live) setOutDoc(d)
          else await d.dispose()
        })
        .catch((e) => {
          if (live) setLoadError(errorText(e))
        })
    return () => {
      live = false
      if (loaded) void loaded.dispose()
    }
  }, [output])
  function change(next: File[]) {
    op.reset()
    setFiles(next)
    setLoadError('')
  }
  function addFiles(next: File[]) {
    const all = merge || fromImages || compress ? [...files, ...next] : next
    if (
      all.length > 40 ||
      all.reduce((n, f) => n + f.size, 0) > 180 * 1024 * 1024
    ) {
      setLoadError('Keep the batch at 40 files and below 180 MB.')
      return
    }
    change(all)
  }
  function selected(index: number) {
    try {
      return !!doc && parsePages(range, doc.numPages).includes(index)
    } catch {
      return false
    }
  }
  async function process(report: (p: number) => void, signal: AbortSignal): Promise<Output[]> {
    const base = stem(chosen.name)
    if (fromImages) {
      const input: Blob[] = []
      for (let i = 0; i < files.length; i++) {
        input.push(
          (await runRaster(files[i], { format: 'image/png', quality: 1 })).blob,
        )
        report(((i + 1) / files.length) * 70)
      }
      return [
        {
          name: 'images.pdf',
          blob: await imagesPdf(input, { paper, landscape, fit, margin }, signal),
          detail: pageCountLabel(input.length),
        },
      ]
    }
    if (merge)
      return [
        {
          name: 'merged.pdf',
          blob: await editPdf('merge-pdf', files, { pages: [] }, signal),
          detail: counts && pageCountLabel(counts.reduce((a, b) => a + b, 0)),
        },
      ]
    if (!doc) throw Error('Wait for the PDF to load.')
    const pages = reorder ? order : parsePages(range, doc.numPages)
    if (!pages.length) throw Error('Keep at least one page before exporting.')
    if ((compress || exportImages || split) && pages.length > 40)
      throw Error('Choose no more than 40 pages per export.')
    if (compress) {
      if (
        compressionMode === 'target' &&
        (!Number.isFinite(exactTargetBytes) || !exactTargetBytes || exactTargetBytes <= 0)
      )
        throw Error('Enter a positive target size.')
      const result: Output[] = []
      const sourceFiles = files.length > 1 ? files : [chosen]
      for (const [fileIndex, sourceFile] of sourceFiles.entries()) {
        let activeDoc: RenderPDF | undefined = sourceFile === chosen ? doc : undefined
        try {
          activeDoc ??= await loadRender(sourceFile, { workerRendering: true })
          const activePages = Array.from(
            { length: activeDoc.numPages },
            (_, index) => index,
          )
          if (activePages.length > 40)
            throw Error(`${sourceFile.name} has more than 40 pages. Compress it in smaller selections.`)
          const compressed = await compressPdfLocally(
            activeDoc,
            sourceFile,
            activePages,
            { preset: compressionPreset, targetBytes: exactTargetBytes },
            (progress) => report(((fileIndex + progress / 100) / sourceFiles.length) * 96),
          )
          const saved = sourceFile.size > compressed.blob.size
            ? ((1 - compressed.blob.size / sourceFile.size) * 100).toFixed(1) + '% smaller'
            : compressed.original
              ? (exactTargetBytes ? 'Original kept · already smaller than target' : 'Original kept · compression did not reduce file size')
              : 'No byte saving at selected quality'
          result.push({
            name: compressed.original ? sourceFile.name : `${stem(sourceFile.name)}-compressed.pdf`,
            blob: compressed.blob,
            detail: `${sizeLabel(sourceFile.size)} → ${sizeLabel(compressed.blob.size)} · ${saved}${compressed.met ? '' : ' · target not reached before safe downscale limit'}`,
          })
        } finally {
          if (activeDoc && activeDoc !== doc) await activeDoc.dispose().catch(() => {})
        }
      }
      return result.length > 1
        ? [...result, await zipFiles(result, 'compressed-pdfs.zip')]
        : result
    }
    if (exportImages) {
      const output: Output[] = []
      for (const [i, index] of pages.entries()) {
        const mime = compress ? 'image/jpeg' : format
        output.push({
          name: `page-${index + 1}.${extension(mime)}`,
          blob: await renderBlob(doc, index, scale, mime, quality),
        })
        report(((i + 1) / pages.length) * 90)
      }
      return output.length > 1
        ? [...output, await zipFiles(output, base + '-pages.zip')]
        : output
    }
    if (splitTool && (split || splitEvery > 0)) {
      if (splitEvery && (!Number.isInteger(splitEvery) || splitEvery < 1)) throw Error('Use a whole number of pages per split.')
      const items: Output[] = []
      const groupSize = splitEvery || 1
      for (let i = 0; i < pages.length; i += groupSize) {
        const group = pages.slice(i, i + groupSize)
        items.push({
          name: group.length === 1 ? `page-${group[0] + 1}.pdf` : `pages-${group[0] + 1}-${group.at(-1)! + 1}.pdf`,
          blob: await editPdf('split-pdf', [chosen], { pages: group }, signal),
        })
        report(((i + 1) / pages.length) * 90)
      }
      return [...items, await zipFiles(items, base + '-split.zip')]
    }
    return [
      {
        name: base + '-' + id.replace('-pdf', '') + '.pdf',
        blob: await editPdf(action as PDFAction, [chosen], {
          pages,
          angle,
          text,
          size,
          color,
          opacity: id === 'watermark-pdf' ? opacity : 1,
          position,
          start,
          shape,
          x,
          y,
          width: w,
          height: h,
          rotations,
        }, signal),
        detail:
          reorder || splitTool
            ? pageCountLabel(pages.length)
            : pageCountLabel(doc.numPages),
      },
    ]
  }
  return (
    <>
      <div className="tool-layout">
        <Panel title="Source files">
          <fieldset disabled={op.pending}>
            <Dropzone
              multiple={merge || fromImages || compress}
              accept={fromImages ? [...images] : [PDF]}
              onFiles={addFiles}
            />
            <FileList
              files={files}
              counts={counts ?? (doc ? [doc.numPages] : undefined)}
              ordered={merge || fromImages}
              onChange={change}
            />
          </fieldset>
          <ErrorState error={loadError} />
          <Progress pending={loading} label="Reading PDF" />
        </Panel>
        {!preview && (
          <Panel title="Output settings" className="tool-controls">
            <fieldset
              disabled={op.pending}
              className="form-grid"
              onChangeCapture={op.reset}
            >
              {merge && (
                <p className="mini full">
                  Order the source files with the arrows or drag and drop.
                </p>
              )}
              {fromImages && (
                <>
                  <Field label="Paper size">
                    <select
                      value={paper}
                      onChange={(e) => setPaper(e.target.value)}
                    >
                      {[...Object.keys(paperSizes), 'Image'].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Orientation">
                    <select
                      value={landscape ? 'landscape' : 'portrait'}
                      onChange={(e) =>
                        setLandscape(e.target.value === 'landscape')
                      }
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </Field>
                  <Field label="Fit">
                    <select
                      value={fit}
                      onChange={(e) => setFit(e.target.value)}
                    >
                      <option value="contain">Fit inside</option>
                      <option value="stretch">Stretch</option>
                    </select>
                  </Field>
                  <Field label="Margin (pt)">
                    <input
                      type="number"
                      min={0}
                      value={margin}
                      onChange={(e) => setMargin(+e.target.value)}
                    />
                  </Field>
                </>
              )}
              {!merge && !fromImages && !reorder && !compress && (
                <Field label="Pages · empty means all">
                  <input
                    value={range}
                    onChange={(e) => setRange(e.target.value)}
                    placeholder="1, 3-5"
                  />
                </Field>
              )}
              {splitTool && (
                <Field label="Split output">
                  <select
                    value={splitEvery ? 'chunks' : split ? 'separate' : 'combined'}
                    onChange={(e) => { setSplit(e.target.value === 'separate'); setSplitEvery(e.target.value === 'chunks' ? 2 : 0) }}
                  >
                    <option value="combined">
                      One PDF with selected pages
                    </option>
                    <option value="separate">Separate PDFs and ZIP</option>
                    <option value="chunks">Split every N pages</option>
                  </select>
                </Field>
              )}
              {splitTool && splitEvery > 0 && <Field label="Pages per split"><input type="number" min={1} step={1} value={splitEvery} onChange={(event) => setSplitEvery(Math.max(1, Number(event.target.value)))} /></Field>}
              {(id === 'rotate-pdf' || id === 'watermark-pdf') && (
                <Field label="Rotation angle">
                  <select
                    value={angle}
                    onChange={(e) => setAngle(+e.target.value)}
                  >
                    {(id === 'rotate-pdf'
                      ? [90, 180, 270]
                      : [0, 30, 45, 90, 180, 270]
                    ).map((a) => (
                      <option key={a} value={a}>
                        {a}°
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {(id === 'annotate-pdf' || id === 'edit-pdf') && (
                <Field label="Annotation type">
                  <select
                    value={shape}
                    onChange={(e) => setShape(e.target.value)}
                  >
                    <option value="text">Text</option>
                    <option value="rectangle">Outlined rectangle</option>
                  </select>
                </Field>
              )}
              {overlay && (
                <>
                  {(shape !== 'rectangle' || (id !== 'annotate-pdf' && id !== 'edit-pdf')) && (
                    <>
                      <Field
                        label={
                          id === 'number-pdf'
                            ? 'Number format ({n}, {total})'
                            : 'Overlay text'
                        }
                      >
                        <input
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          maxLength={160}
                        />
                      </Field>
                      <Field label="Font size (pt)">
                        <input
                          type="number"
                          min={6}
                          max={144}
                          value={size}
                          onChange={(e) => setSize(+e.target.value)}
                        />
                      </Field>
                    </>
                  )}
                  <Field label="Color">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                    />
                  </Field>
                </>
              )}
              {(id === 'watermark-pdf' || id === 'number-pdf') && (
                <Field label="Placement">
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                  >
                    {[
                      'center',
                      'top left',
                      'top center',
                      'top right',
                      'bottom left',
                      'bottom center',
                      'bottom right',
                    ].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Field>
              )}
              {id === 'watermark-pdf' && (
                <Field label={'Opacity ' + Math.round(opacity * 100) + '%'}>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={opacity}
                    onChange={(e) => setOpacity(+e.target.value)}
                  />
                </Field>
              )}
              {id === 'number-pdf' && (
                <Field label="Starting number">
                  <input
                    type="number"
                    min={0}
                    value={start}
                    onChange={(e) => setStart(+e.target.value)}
                  />
                </Field>
              )}
              {(id === 'annotate-pdf' || id === 'edit-pdf') && (
                <>
                  <Field label="Left (%)">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={x}
                      onChange={(e) => setX(+e.target.value)}
                    />
                  </Field>
                  <Field label="From bottom (%)">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={y}
                      onChange={(e) => setY(+e.target.value)}
                    />
                  </Field>
                  {shape === 'rectangle' && (
                    <>
                      <Field label="Rectangle width (pt)">
                        <input
                          type="number"
                          min={1}
                          value={w}
                          onChange={(e) => setW(+e.target.value)}
                        />
                      </Field>
                      <Field label="Rectangle height (pt)">
                        <input
                          type="number"
                          min={1}
                          value={h}
                          onChange={(e) => setH(+e.target.value)}
                        />
                      </Field>
                    </>
                  )}
                </>
              )}
              {exportImages && (
                <Field label="Image format">
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    <option value="image/png">PNG</option>
                    <option value="image/jpeg">JPEG</option>
                  </select>
                </Field>
              )}
              {exportImages && (
                <Field label="Render scale">
                  <select
                    value={scale}
                    onChange={(e) => setScale(+e.target.value)}
                  >
                    {[0.75, 1, 1.5, 2, 3].map((v) => (
                      <option key={v} value={v}>
                        {v}×
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {exportImages && format === 'image/jpeg' && (
                <Field
                  label={'JPEG quality ' + Math.round(quality * 100) + '%'}
                >
                  <input
                    type="range"
                    min={0.2}
                    max={0.95}
                    step={0.05}
                    value={quality}
                    onChange={(e) => setQuality(+e.target.value)}
                  />
                </Field>
              )}
              {compress && (
                <>
                  <Field label="Compression mode">
                    <select
                      value={compressionMode}
                      onChange={(e) =>
                        setCompressionMode(
                          e.target.value as 'preset' | 'target',
                        )
                      }
                    >
                      <option value="preset">Preset mode</option>
                      <option value="target">Exact target size</option>
                    </select>
                  </Field>
                  {compressionMode === 'preset' ? (
                    <Field label="Compression preset">
                      <select
                        value={compressionPreset}
                        onChange={(e) =>
                          setCompressionPreset(
                            e.target.value as PdfCompressionPreset,
                          )
                        }
                      >
                        <option value="extreme">
                          Extreme · smallest practical file
                        </option>
                        <option value="recommended">
                          Recommended · balanced
                        </option>
                        <option value="light">
                          Light · preserve more detail
                        </option>
                      </select>
                    </Field>
                  ) : (
                    <>
                      <Field label="Target size">
                        <input
                          type="number"
                          min={0.001}
                          step="any"
                          value={targetSize}
                          placeholder="e.g. 200 or 1.5"
                          onChange={(e) => setTargetSize(e.target.value)}
                        />
                      </Field>
                      <Field label="Target unit">
                        <select
                          value={targetUnit}
                          onChange={(e) =>
                            setTargetUnit(
                              e.target.value as 'KB' | 'MB' | 'GB',
                            )
                          }
                        >
                          <option value="KB">KB</option>
                          <option value="MB">MB</option>
                          <option value="GB">GB</option>
                        </select>
                      </Field>
                      <div className="action-row full" aria-label="Common target sizes">
                        {[
                          ['20', 'KB'],
                          ['50', 'KB'],
                          ['100', 'KB'],
                          ['200', 'KB'],
                          ['1', 'MB'],
                        ].map(([value, unit]) => (
                          <Button
                            key={value + unit}
                            variant="quiet"
                            onClick={() => {
                              setTargetSize(value)
                              setTargetUnit(unit as 'KB' | 'MB' | 'GB')
                            }}
                          >
                            {value} {unit}
                          </Button>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="notice full">
                    For scanned PDFs. Compression rasterizes pages, so the
                    output no longer retains selectable text, links, forms, or
                    source signatures. Exact mode searches JPEG quality from
                    5% to 98% and progressively lowers render scale only when
                    needed. The original is returned when it is already below
                    the requested target.
                  </p>
                </>
              )}
              {reorder && (
                <p className="mini full">
                  Use drag and drop or the arrow buttons below to reorder pages.
                </p>
              )}
            </fieldset>
            <div className="action-row">
              <Button
                disabled={
                  op.pending ||
                  loading ||
                  !files.length ||
                  (!merge && !fromImages && !doc) ||
                  (merge && (!counts || files.length < 2))
                }
                onClick={() => void op.run(process)}
              >
                {compress ? 'Compress PDF' : 'Generate output'}
              </Button>
            </div>
            <ErrorState error={op.error} />
            <Progress pending={op.pending} progress={op.progress} />
          </Panel>
        )}
        {doc && (
          <Panel
            className="full"
            title={outDoc ? 'Original PDF preview' : 'PDF preview'}
          >
            <PDFView
              doc={doc}
              blobs={thumbs}
              page={page}
              setPage={setPage}
              rotation={id === 'rotate-pdf' && selected(page) ? angle : 0}
            />
            {doc.numPages > 40 && (
              <p className="mini">
                Thumbnails show the first 40 pages. Page navigation covers the
                whole document.
              </p>
            )}
          </Panel>
        )}
        {!files.length && preview && (
          <Panel title="PDF preview">
            <EmptyState>Choose a PDF to view its pages.</EmptyState>
          </Panel>
        )}
        {reorder && doc && (
          <Panel className="full" title="Page order">
            <fieldset disabled={op.pending}>
              <ul className="page-order">
                {order.map((n, i) => (
                  <li
                    key={n}
                    draggable
                    onDragStart={() => {
                      drag.current = i
                    }}
                    onDragEnd={() => {
                      drag.current = null
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (drag.current !== null)
                        setOrder(move(order, drag.current, i))
                      drag.current = null
                    }}
                  >
                    <div style={{ transform: `rotate(${rotations[n] || 0}deg)` }}><Thumbnail blob={thumbs[n]} label={'Page ' + (n + 1)} /></div>
                    <span>Page {n + 1}</span>
                    <div>
                      <IconButton label={'Rotate page ' + (n + 1)} onClick={() => { op.reset(); setRotations((old) => ({ ...old, [n]: ((old[n] || 0) + 90) % 360 })) }}><RotateCw size={15} /></IconButton>
                      <IconButton
                        label={'Move page ' + (n + 1) + ' earlier'}
                        disabled={!i}
                        onClick={() => setOrder(move(order, i, i - 1))}
                      >
                        <ArrowUp size={15} />
                      </IconButton>
                      <IconButton
                        label={'Move page ' + (n + 1) + ' later'}
                        disabled={i === order.length - 1}
                        onClick={() => setOrder(move(order, i, i + 1))}
                      >
                        <ArrowDown size={15} />
                      </IconButton>
                      <IconButton
                        label={'Remove page ' + (n + 1)}
                        onClick={() => setOrder(order.filter((v) => v !== n))}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            </fieldset>
          </Panel>
        )}
      </div>
      {outDoc && <OutputPreview doc={outDoc} />}
      {exportImages && op.items[0] && (
        <Panel title="Exported image preview">
          <FilePreview file={op.items[0].blob} label={op.items[0].name} />
        </Panel>
      )}
      {compress && output && (
        <p className="size-compare">
          Original {sizeLabel(chosen.size)} · Result{' '}
          {sizeLabel(output.blob.size)}
        </p>
      )}
      <Results items={op.items} />
    </>
  )
}
function OutputPreview({ doc }: { doc: RenderPDF }) {
  const [page, set] = useState(0)
  return (
    <Panel title="Output PDF preview">
      <PDFView
        doc={doc}
        page={Math.min(page, doc.numPages - 1)}
        setPage={set}
        blobs={[]}
      />
    </Panel>
  )
}
