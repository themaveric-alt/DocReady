import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import {
  Brush,
  Camera,
  Crop as CropIcon,
  ImagePlus,
  Layers,
  RotateCcw,
  RotateCw,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from 'lucide-react'
import {
  Button,
  Check,
  Dropzone,
  ErrorState,
  Field,
  Panel,
  Progress,
  Results,
  useObjectUrl,
} from '../../components/shared'
import CropEditor from '../../components/CropEditor'
import {
  errorText,
  images,
  saveFile,
  sizeLabel,
  stem,
  extension,
  type ImageMime,
  type Output,
} from '../../lib/files'
import { runBackgroundJob } from '../../lib/background-removal'
import { withDPI } from '../../lib/image-dpi'
import { fullCrop } from '../../lib/raster'
import { contain, effectiveDpi } from '../e-card-studio/printLayout'
import { Count, PhotoPaper, SheetOptions } from './PhotoPrintPanels'
import {
  bins,
  defaultPhotoSheet,
  makePhotoSheet,
  openPhotoPrint,
  photoPlan,
} from './printPhotos'
import { canvasLimit, cropPixels, silhouette } from './photo/engine'
import { photoJob } from './photo/photoJobs'
import {
  autoCredit,
  clamp,
  cropRatio,
  initialEdits,
  neutral,
  photoHistory,
  type ColorEdits,
  type OutfitFit,
  type PhotoAnalysis,
  type PhotoEdits,
  type Point,
  type PortraitAnchor,
  type Stroke,
} from './photo/photoState'
import { groups, outfitPaths, outfits } from './photo/outfits'

const panels = [
  ['Auto Fix', Wand2],
  ['Crop & Rotate', CropIcon],
  ['Background', ImagePlus],
  ['Outfits', Shirt],
  ['Adjust', SlidersHorizontal],
  ['Enhance', Sparkles],
  ['Restore', Brush],
  ['Border', Layers],
  ['Print & Export', Camera],
] as const
type Tool = (typeof panels)[number][0]
const colors = [
  ['Pure White', '#ffffff'],
  ['Soft White', '#f7f5ed'],
  ['Light Blue', '#cce2f4'],
  ['Standard Blue', '#4089c4'],
  ['Light Gray', '#e2e5e9'],
  ['Neutral Gray', '#a5a8ae'],
  ['Pastel Lilac', '#e9ddf1'],
  ['Pastel Mint', '#e0eee5'],
]
const colorFields: [
  keyof Omit<ColorEdits, 'grayscale'>,
  string,
  number,
  number,
  number?,
][] = [
  ['brightness', 'Brightness', -45, 45],
  ['exposure', 'Exposure', -1.5, 1.5, 0.05],
  ['contrast', 'Contrast', -60, 70],
  ['highlights', 'Highlights', -70, 55],
  ['shadows', 'Shadows', -45, 70],
  ['saturation', 'Saturation', -100, 80],
  ['vibrance', 'Vibrance', -60, 65],
  ['temperature', 'Temperature', -55, 55],
  ['tint', 'Tint', -45, 45],
  ['gamma', 'Gamma', -65, 65],
  ['sharpness', 'Sharpness', 0, 100],
  ['noise', 'Noise reduction', 0, 95],
]
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  change,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  change: (n: number) => void
}) {
  return (
    <Field label={label}>
      <span className="advanced-range">
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => change(Number(e.currentTarget.value))}
        />
        <output>{Number(value.toFixed(2))}</output>
      </span>
    </Field>
  )
}
function ToolButton({
  tool,
  selected,
  change,
}: {
  tool: (typeof panels)[number]
  selected: boolean
  change: (t: Tool) => void
}) {
  const [name, Icon] = tool
  return (
    <button
      type="button"
      className="photo-tool"
      aria-pressed={selected}
      onClick={() => change(name)}
    >
      <Icon size={17} aria-hidden="true" />
      {name}
    </button>
  )
}
function BrushView({
  file,
  action,
  radius,
  softness,
  add,
}: {
  file: Blob
  action: Stroke['action']
  radius: number
  softness: number
  add: (stroke: Stroke) => void
}) {
  const url = useObjectUrl(file),
    points = useRef<Point[]>([])
  const [draft, setDraft] = useState<Point[]>([])
  function point(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return {
      x: clamp((e.clientX - r.left) / r.width, 0, 1),
      y: clamp((e.clientY - r.top) / r.height, 0, 1),
    }
  }
  const active = (e: PointerEvent<HTMLDivElement>) =>
    e.currentTarget.hasPointerCapture(e.pointerId)
  return (
    <div
      className="photo-brush"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        points.current = [point(e)]
        setDraft(points.current)
      }}
      onPointerMove={(e) => {
        if (!active(e) || points.current.length >= 150) return
        const p = point(e)
        if (
          Math.hypot(
            p.x - points.current.at(-1)!.x,
            p.y - points.current.at(-1)!.y,
          ) > 0.004
        ) {
          points.current = [...points.current, p]
          setDraft(points.current)
        }
      }}
      onPointerUp={(e) => {
        if (active(e) && points.current.length)
          add({ action, radius, softness, points: points.current })
        points.current = []
        setDraft([])
      }}
      onPointerCancel={() => {
        points.current = []
        setDraft([])
      }}
    >
      <img
        src={url}
        alt="Original photo for painting a localized correction"
        draggable={false}
      />
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {draft.length > 1 ? (
          <polyline
            points={draft.map((p) => p.x * 1000 + ',' + p.y * 1000).join(' ')}
            stroke={action === 'erase' ? '#ff6588' : '#6268f5'}
            strokeWidth={radius * 1700}
            strokeLinecap="round"
            opacity={0.67}
            fill="none"
          />
        ) : (
          draft[0] && (
            <circle
              cx={draft[0].x * 1000}
              cy={draft[0].y * 1000}
              r={radius * 850}
              fill="#6268f5"
              opacity=".65"
            />
          )
        )}
      </svg>
    </div>
  )
}
const manualAnchor: PortraitAnchor = {
  x: 0.5,
  neck: 0.55,
  width: 0.74,
  angle: 0,
  method: 'manual',
}

export default function PhotoStudio({
  passport,
  initial,
  onSource,
  advanced,
  defaults,
}: {
  passport: boolean
  initial?: File
  onSource: (file: File) => void
  advanced: boolean
  defaults: typeof defaultPhotoSheet
}) {
  const [file, setFile] = useState<File | undefined>(initial),
    [analysis, setAnalysis] = useState<PhotoAnalysis>(),
    [sil, setSil] = useState<PortraitAnchor>()
  const [history, dispatch] = useReducer(photoHistory, {
      past: [],
      current: initialEdits,
      future: [],
    }),
    e = history.current
  const [tool, setTool] = useState<Tool>('Auto Fix'),
    [preview, setPreview] = useState<Blob>(),
    [comparison, setComparison] = useState(100)
  const [busy, setBusy] = useState(''),
    [progress, setProgress] = useState<number>(),
    [errors, setErrors] = useState(''),
    [notice, setNotice] = useState('')
  const [items, setItems] = useState<Output[]>([]),
    [format, setFormat] = useState<ImageMime>('image/png'),
    [quality, setQuality] = useState(0.92)
  const [upscale, setUpscale] = useState(1),
    [sheet, setSheet] = useState(defaults),
    [ratio, setRatio] = useState(0),
    [customRatio, setCustomRatio] = useState(0.8)
  const [category, setCategory] = useState(0),
    [brush, setBrush] = useState<Stroke['action']>('erase'),
    [paint, setPaint] = useState(false)
  const [radius, setRadius] = useState(0.025),
    [softness, setSoftness] = useState(0.65)
  const job = useRef<AbortController | undefined>(undefined)
  const previewUrl = useObjectUrl(preview),
    originalUrl = useObjectUrl(file)
  const editing = passport
    ? tool === 'Outfits'
      ? 'Print & Export'
      : tool
    : tool
  const liveEdit = useMemo(
    () =>
      passport ? { ...e, outfit: undefined, shadow: false, corners: 0 } : e,
    [e, passport],
  )
  const overlay = e.outfit
  const anchor = analysis?.anchor ?? sil ?? manualAnchor
  const showPaper = passport || editing === 'Print & Export'
  const sourcePrint =
    analysis &&
    contain(
      cropPixels(analysis.width, analysis.height, liveEdit),
      sheet.photo,
    )
  const sourceDPI =
    sourcePrint && analysis
      ? effectiveDpi(
          cropPixels(analysis.width, analysis.height, liveEdit),
          sheet.photo,
        )
      : undefined
  const commit = (diff: Partial<PhotoEdits>) => {
    dispatch({ ...e, ...diff })
    setItems([])
    setNotice('')
  }
  const setColors = (diff: Partial<ColorEdits>) =>
    commit({ color: { ...e.color, ...diff } })
  function changeTool(next: Tool) {
    setTool(next)
    setPaint(false)
  }
  function applyPhoto(next: File) {
    if (next.size > 24 * 1024 * 1024) {
      setErrors('Choose a photo smaller than 24 MB.')
      return
    }
    setFile(next)
    onSource(next)
    dispatch('clear')
    setSil(undefined)
    setPaint(false)
    setAnalysis(undefined)
    setPreview(undefined)
    setItems([])
    setRatio(0)
    setComparison(100)
    setErrors('')
    setNotice('')
  }
  useEffect(() => () => job.current?.abort(), [])
  useEffect(() => {
    if (!file) return
    const controller = new AbortController()
    void photoJob({ kind: 'analysis', file }, controller.signal).then(
      setAnalysis,
      (error) => {
        if (!controller.signal.aborted) setErrors(errorText(error))
      },
    )
    return () => controller.abort()
  }, [file])
  useEffect(() => {
    if (!file || !analysis) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const printRatio = sheet.photo.width / sheet.photo.height
      const frame =
        showPaper &&
        Number.isFinite(printRatio) &&
        printRatio >= 0.12 &&
        printRatio <= 8
          ? {
              width: Math.round(720 * Math.min(1, printRatio)),
              height: Math.round(720 * Math.min(1, 1 / printRatio)),
            }
          : {}
      void photoJob(
        {
          kind: 'render',
          file,
          edit: liveEdit,
          options: {
            limit: 700_000,
            format: 'image/png',
            quality: 0.92,
            ...frame,
          },
        },
        controller.signal,
      ).then(
        (result) => {
          if (!controller.signal.aborted) setPreview(result.blob)
        },
        (error) => {
          if (!controller.signal.aborted) setErrors(errorText(error))
        },
      )
    }, 95)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [
    file,
    analysis,
    liveEdit,
    showPaper,
    sheet.photo.width,
    sheet.photo.height,
  ])
  async function run(
    label: string,
    task: (signal: AbortSignal) => Promise<void>,
  ) {
    if (job.current) return
    const controller = new AbortController()
    job.current = controller
    setBusy(label)
    setProgress(undefined)
    setErrors('')
    setNotice('')
    try {
      await task(controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) setErrors(errorText(error))
    } finally {
      job.current = undefined
      setBusy('')
      setProgress(undefined)
    }
  }
  const setSheetOptions = (s: typeof sheet) => {
    setSheet(s)
    setItems([])
  }
  function renderFull(
    signal: AbortSignal,
    physical: boolean,
    forPDF = false,
  ) {
    if (!file || !analysis) throw Error('Load a readable photo first.')
    if (!passport && overlay && !overlay.approved)
      throw Error('Approve or remove the outfit before exporting.')
    if (
      physical &&
      (!Number.isFinite(sheet.photo.width) ||
        !Number.isFinite(sheet.photo.height) ||
        sheet.photo.width < 5 ||
        sheet.photo.height < 5)
    )
      throw Error('Enter a valid physical photo size.')
    const crop = cropPixels(analysis.width, analysis.height, liveEdit)
    return photoJob(
      {
        kind: 'render',
        file,
        edit: liveEdit,
        options: {
          limit: canvasLimit(),
          format: forPDF ? 'image/png' : format,
          quality,
          width: physical
            ? bins(sheet.photo.width, sheet.dpi)
            : upscale === 1
              ? undefined
              : Math.round(crop.width * upscale),
          height: physical
            ? bins(sheet.photo.height, sheet.dpi)
            : upscale === 1
              ? undefined
              : Math.round(crop.height * upscale),
        },
      },
      signal,
    )
  }
  async function buildPDF(signal: AbortSignal) {
    return makePhotoSheet(
      [(await renderFull(signal, true, true)).blob],
      sheet,
      signal,
    )
  }
  function segment() {
    if (!file || !analysis) return
    void run('Removing background on this device', async (signal) => {
      const result = await runBackgroundJob(
        { type: 'remove', image: file },
        signal,
        (m) => {
          if (m.total > 0)
            setProgress(Math.min(99, (m.current / m.total) * 100))
        },
      )
      signal.throwIfAborted()
      const silhouetteAnchor = await silhouette(result.image)
      signal.throwIfAborted()
      setSil(silhouetteAnchor)
      dispatch({
        ...e,
        mask: result.image,
        background:
          e.background === 'original' ? 'transparent' : e.background,
      })
      setNotice(
        'Background mask ready. Zoom in and check the edges before export.',
      )
    })
  }
  function fit(id: string): OutfitFit {
    return {
      id,
      x: anchor.x,
      neck: anchor.neck,
      width: anchor.width,
      height: clamp((1 - anchor.neck) * 1.08, 0.2, 0.73),
      angle: anchor.angle,
      approved: false,
    }
  }
  const fitUpdate = (diff: Partial<OutfitFit>) =>
    overlay && commit({ outfit: { ...overlay, approved: false, ...diff } })
  const addStroke = (stroke: Stroke) => {
    if (e.strokes.length >= 70) {
      setErrors(
        'This edit has 70 brush strokes. Undo some strokes or reset the mask.',
      )
      return
    }
    commit({
      strokes: [...e.strokes, stroke],
      ...((stroke.action === 'add' || stroke.action === 'erase') &&
      e.background === 'original'
        ? { background: 'transparent' as const }
        : {}),
      ...(stroke.action === 'protect' && e.outfit
        ? { outfit: { ...e.outfit, approved: false } }
        : {}),
    })
  }
  let plan: ReturnType<typeof photoPlan> = [],
    planError = ''
  if (file && (passport || editing === 'Print & Export'))
    try {
      plan = photoPlan(1, sheet)
    } catch (error) {
      planError = errorText(error)
    }
  const allowed = Boolean(
    file && analysis && !busy && (passport || !overlay || overlay.approved),
  )
  const fitRatio =
    ratio === -2
      ? customRatio
      : ratio === -1 &&
          Number.isFinite(sheet.photo.width / sheet.photo.height)
        ? sheet.photo.width / sheet.photo.height
        : Math.max(0, ratio)
  return (
    <div className="photo-workspace">
      <Panel
        title={passport ? 'Passport Photo Maker' : 'Smart AI Photo Studio'}
      >
        <Dropzone
          label="Choose a studio photo"
          accept={[...images]}
          compact
          description="JPEG, PNG, or WebP. Your original stays in this tab."
          onFiles={(f) => {
            job.current?.abort()
            applyPhoto(f[0])
          }}
        />
        {file && (
          <div className="action-row">
            <span className="muted">
              {file.name} · {sizeLabel(file.size)}
            </span>
            <Button
              variant="secondary"
              disabled={!!busy || !history.past.length}
              onClick={() => {
                dispatch('undo')
                setItems([])
              }}
            >
              Undo
            </Button>
            <Button
              variant="secondary"
              disabled={!!busy || !history.future.length}
              onClick={() => {
                dispatch('redo')
                setItems([])
              }}
            >
              Redo
            </Button>
            <Button
              variant="quiet"
              disabled={!!busy}
              onClick={() => {
                commit(initialEdits)
                setPaint(false)
                setRatio(0)
                setComparison(100)
              }}
            >
              <RotateCcw size={16} /> Reset edits
            </Button>
          </div>
        )}
        <Progress
          pending={!!busy || Boolean(file && !analysis && !errors)}
          label={busy || 'Measuring your photo'}
          progress={progress}
        />
        {!!busy && (
          <Button variant="secondary" onClick={() => job.current?.abort()}>
            Cancel operation
          </Button>
        )}
        {notice && (
          <p className="advanced-status" role="status">
            {notice}
          </p>
        )}
        <ErrorState error={errors} />
      </Panel>
      {file && analysis && (
        <div className="photo-editor">
          <nav className="photo-rail" aria-label="Portrait tools">
            {panels
              .filter(([name]) => !passport || name !== 'Outfits')
              .map((panel) => (
                <ToolButton
                  key={panel[0]}
                  tool={panel}
                  selected={editing === panel[0]}
                  change={changeTool}
                />
              ))}
          </nav>
          <Panel className="photo-preview-panel" title="Portrait preview">
            <div className="photo-stage">
              {originalUrl && (
                <img src={originalUrl} alt="Original portrait" />
              )}
              {previewUrl && (
                <img
                  className="photo-edited"
                  src={previewUrl}
                  alt="Edited portrait preview"
                  style={{
                    clipPath: 'inset(0 ' + (100 - comparison) + '% 0 0)',
                  }}
                />
              )}
              {previewUrl && comparison > 0 && comparison < 100 && (
                <span
                  className="photo-divider"
                  style={{ left: comparison + '%' }}
                  aria-hidden="true"
                />
              )}
            </div>
            <Range
              label="Compare original and edited"
              min={0}
              max={100}
              value={comparison}
              change={setComparison}
            />
            <div className="action-row">
              <Button variant="quiet" onClick={() => setComparison(0)}>
                Original preview
              </Button>
              <Button variant="quiet" onClick={() => setComparison(100)}>
                Edited preview
              </Button>
            </div>
            {passport && (
              <p className="muted">
                Passport previews keep original clothing. Enter the size
                required by your application.
              </p>
            )}
          </Panel>
          <Panel title={editing} className="photo-adjustments">
            <fieldset disabled={!!busy}>
              {editing === 'Auto Fix' && (
                <>
                  <Button
                    onClick={() => {
                      commit({
                        color: autoCredit(analysis),
                        rotation:
                          anchor.method === 'face'
                            ? -anchor.angle
                            : e.rotation,
                      })
                      setComparison(100)
                    }}
                  >
                    Auto Fix My Photo
                  </Button>
                  <p className="muted">
                    Applies conservative exposure, color and detail
                    corrections. Review framing before accepting a suggested
                    crop.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const suggestion = cropRatio(
                        analysis.width,
                        analysis.height,
                        passport
                          ? sheet.photo.width / sheet.photo.height
                          : 0.8,
                      )
                      if (anchor.method !== 'manual')
                        suggestion.x = clamp(
                          anchor.x - suggestion.width / 2,
                          0,
                          1 - suggestion.width,
                        )
                      commit({ crop: suggestion })
                      setTool('Crop & Rotate')
                    }}
                  >
                    Suggest portrait crop
                  </Button>
                  <dl className="advanced-metrics">
                    <div>
                      <dt>Oriented source</dt>
                      <dd>
                        {analysis.width} × {analysis.height} px
                      </dd>
                    </div>
                    <div>
                      <dt>Format / ratio</dt>
                      <dd>
                        {analysis.format.replace('image/', '').toUpperCase()}{' '}
                        · {(analysis.width / analysis.height).toFixed(2)}
                      </dd>
                    </div>
                    <div>
                      <dt>EXIF orientation</dt>
                      <dd>
                        {analysis.orientation
                          ? analysis.orientation + ' · applied by decoder'
                          : 'No JPEG orientation tag found'}
                      </dd>
                    </div>
                    <div>
                      <dt>Brightness / contrast</dt>
                      <dd>
                        {Math.round(analysis.brightness)} /{' '}
                        {Math.round(analysis.contrast)}
                      </dd>
                    </div>
                    <div>
                      <dt>Clipped highlights / dark pixels</dt>
                      <dd>
                        {Math.round(analysis.highlights * 100)}% /{' '}
                        {Math.round(analysis.shadows * 100)}%
                      </dd>
                    </div>
                    <div>
                      <dt>Detail / noise estimates</dt>
                      <dd>
                        {analysis.sharpness.toFixed(1)} /{' '}
                        {analysis.noise.toFixed(1)}
                      </dd>
                    </div>
                    <div>
                      <dt>Corner edge density</dt>
                      <dd>{Math.round(analysis.background * 100)}%</dd>
                    </div>
                    <div>
                      <dt>Color cast estimates</dt>
                      <dd>
                        {analysis.temperature.toFixed(1)} warmth ·{' '}
                        {analysis.tint.toFixed(1)} tint
                      </dd>
                    </div>
                    <div>
                      <dt>Framing cue</dt>
                      <dd>
                        {anchor.method === 'face'
                          ? 'One prominent local face'
                          : anchor.method === 'silhouette'
                            ? 'Foreground silhouette'
                            : 'Manual alignment'}
                        {anchor.method === 'face'
                          ? ' · ' +
                            anchor.angle.toFixed(1) +
                            '° estimated tilt'
                          : ''}
                      </dd>
                    </div>
                  </dl>
                </>
              )}
              {editing === 'Crop & Rotate' && (
                <>
                  <Field label="Crop ratio">
                    <select
                      value={ratio}
                      onChange={(evt) => {
                        const value = +evt.target.value
                        setRatio(value)
                        if (value)
                          commit({
                            crop: cropRatio(
                              analysis.width,
                              analysis.height,
                              value === -2
                                ? customRatio
                                : value === -1
                                  ? sheet.photo.width / sheet.photo.height
                                  : value,
                            ),
                          })
                        else commit({ crop: fullCrop })
                      }}
                    >
                      <option value={0}>Free crop</option>
                      <option value={1}>Square</option>
                      <option value={0.8}>4:5 portrait</option>
                      <option value={1.5}>3:2 landscape</option>
                      <option value={-1}>
                        Match specified photo millimeters
                      </option>
                      <option value={-2}>Custom ratio</option>
                    </select>
                  </Field>
                  {ratio === -2 && (
                    <Count
                      label="Custom crop width ÷ height"
                      min={0.12}
                      max={8}
                      step={0.01}
                      value={customRatio}
                      onChange={(n) => {
                        setCustomRatio(n)
                        if (Number.isFinite(n) && n >= 0.12 && n <= 8)
                          commit({
                            crop: cropRatio(
                              analysis.width,
                              analysis.height,
                              n,
                            ),
                          })
                      }}
                    />
                  )}
                  <CropEditor
                    file={file}
                    crop={e.crop}
                    ratio={fitRatio}
                    change={(crop) => commit({ crop })}
                  />
                  <div className="action-row">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        commit({ rotation: (e.rotation - 90) % 360 })
                      }
                    >
                      <RotateCcw size={16} /> Rotate left
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        commit({ rotation: (e.rotation + 90) % 360 })
                      }
                    >
                      <RotateCw size={16} /> Rotate right
                    </Button>
                  </div>
                  <Range
                    label="Straighten (degrees)"
                    min={-30}
                    max={30}
                    step={0.25}
                    value={
                      e.rotation % 90 > 30 || e.rotation % 90 < -30
                        ? 0
                        : e.rotation % 90
                    }
                    change={(v) =>
                      commit({
                        rotation: Math.round(e.rotation / 90) * 90 + v,
                      })
                    }
                  />
                  <Check
                    label="Flip horizontally"
                    checked={e.flipH}
                    onChange={(flipH) => commit({ flipH })}
                  />
                  <Check
                    label="Flip vertically"
                    checked={e.flipV}
                    onChange={(flipV) => commit({ flipV })}
                  />
                  <Range
                    label="Zoom / expand canvas"
                    min={0.55}
                    max={2.6}
                    step={0.01}
                    value={e.zoom}
                    change={(zoom) => commit({ zoom })}
                  />
                  <Range
                    label="Move photo horizontally"
                    min={-0.35}
                    max={0.35}
                    step={0.01}
                    value={e.offsetX}
                    change={(offsetX) => commit({ offsetX })}
                  />
                  <Range
                    label="Move photo vertically"
                    min={-0.35}
                    max={0.35}
                    step={0.01}
                    value={e.offsetY}
                    change={(offsetY) => commit({ offsetY })}
                  />
                </>
              )}
              {editing === 'Background' && (
                <>
                  <Button disabled={!advanced} onClick={segment}>
                    Remove background locally
                  </Button>
                  {!advanced && (
                    <p className="muted">
                      Enable Advanced Local AI to load the model. Manual mask
                      editing works in Lite mode.
                    </p>
                  )}
                  <Field label="Background treatment">
                    <select
                      value={e.background}
                      onChange={(v) =>
                        commit({
                          background: v.target
                            .value as PhotoEdits['background'],
                        })
                      }
                    >
                      <option value="original">Original</option>
                      <option value="solid">Solid color</option>
                      <option value="transparent">Transparent</option>
                      <option value="blur">
                        Blurred original background
                      </option>
                    </select>
                  </Field>
                  {e.background !== 'original' &&
                    !e.mask &&
                    !e.strokes.some((s) => s.action !== 'restore') && (
                      <p className="muted">
                        Remove the background or erase it manually to reveal
                        the selected treatment. Solid color also fills
                        expanded canvas.
                      </p>
                    )}
                  <div className="photo-swatches">
                    {colors.map(([name, color]) => (
                      <button
                        key={name}
                        type="button"
                        title={name}
                        aria-label={name}
                        aria-pressed={
                          e.background === 'solid' && e.fill === color
                        }
                        onClick={() =>
                          commit({ fill: color, background: 'solid' })
                        }
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                  <Field label="Custom background color">
                    <input
                      type="color"
                      value={e.fill}
                      onChange={(v) =>
                        commit({ fill: v.target.value, background: 'solid' })
                      }
                    />
                  </Field>
                  {e.background === 'blur' && (
                    <>
                      <Range
                        label="Background blur"
                        min={1}
                        max={35}
                        value={e.blur}
                        change={(blur) => commit({ blur })}
                      />
                      <Range
                        label="Background brightness"
                        min={55}
                        max={155}
                        value={e.backgroundLight}
                        change={(backgroundLight) =>
                          commit({ backgroundLight })
                        }
                      />
                    </>
                  )}
                  <Range
                    label="Edge refinement"
                    min={0}
                    max={7}
                    step={0.25}
                    value={e.feather}
                    change={(feather) => commit({ feather })}
                  />
                  <div className="action-row">
                    <Button
                      variant="secondary"
                      aria-pressed={paint}
                      onClick={() => {
                        setBrush('erase')
                        setPaint(!paint)
                      }}
                    >
                      Manual mask
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() =>
                        commit({
                          mask: undefined,
                          strokes: e.strokes.filter(
                            (s) =>
                              s.action === 'restore' ||
                              s.action === 'protect',
                          ),
                          background: 'original',
                        })
                      }
                    >
                      Reset mask
                    </Button>
                  </div>
                  {paint && (
                    <>
                      <Field label="Mask brush action">
                        <select
                          value={brush}
                          onChange={(v) =>
                            setBrush(v.target.value as Stroke['action'])
                          }
                        >
                          <option value="erase">
                            Remove from foreground
                          </option>
                          <option value="add">Add to foreground</option>
                        </select>
                      </Field>
                      <Range
                        label="Brush size"
                        min={0.005}
                        max={0.13}
                        step={0.001}
                        value={radius}
                        change={setRadius}
                      />
                      <Range
                        label="Brush softness"
                        min={0.06}
                        max={0.97}
                        step={0.01}
                        value={softness}
                        change={setSoftness}
                      />
                      <BrushView
                        file={file}
                        action={brush}
                        radius={radius}
                        softness={softness}
                        add={addStroke}
                      />
                    </>
                  )}
                </>
              )}
              {editing === 'Outfits' && (
                <>
                  <h3>Virtual Outfit Studio</h3>
                  <p className="muted">
                    Explore professional and everyday outfit styles on your
                    portrait. Original template overlays fit best on a
                    forward-facing photo with both shoulders visible.
                  </p>
                  <Field label="Outfit category">
                    <select
                      value={category}
                      onChange={(v) => setCategory(+v.target.value)}
                    >
                      {groups.map((g, i) => (
                        <option key={g.name} value={i}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="outfit-grid">
                    {outfits
                      .filter((item) => item.category === category)
                      .map((o) => (
                        <button
                          type="button"
                          key={o.id}
                          aria-pressed={overlay?.id === o.id}
                          onClick={() => {
                            commit({ outfit: fit(o.id) })
                            setComparison(100)
                          }}
                        >
                          <svg viewBox="0 28 200 104" aria-hidden="true">
                            {outfitPaths(o).map(
                              ({ d, fill, stroke, weight, opacity }, i) => (
                                <path
                                  key={i}
                                  d={d}
                                  fill={fill}
                                  stroke={stroke}
                                  strokeWidth={weight}
                                  opacity={opacity}
                                />
                              ),
                            )}
                          </svg>
                          <span>{o.name}</span>
                        </button>
                      ))}
                  </div>
                  {overlay && (
                    <>
                      <p className="advanced-warning">
                        {anchor.method === 'manual'
                          ? 'Automatic fitting has no reliable landmarks here. Adjust the neck and shoulders in preview.'
                          : 'Review suggested placement at the neck and shoulders before approving.'}
                      </p>
                      <div className="action-row">
                        <Button
                          variant="secondary"
                          onClick={() => commit({ outfit: fit(overlay.id) })}
                        >
                          Auto Fit
                        </Button>
                        <Button
                          variant="quiet"
                          onClick={() => commit({ outfit: fit(overlay.id) })}
                        >
                          Reset outfit fit
                        </Button>
                        <Button
                          variant="quiet"
                          onClick={() => commit({ outfit: undefined })}
                        >
                          Remove outfit
                        </Button>
                      </div>
                      <Range
                        label="Adjust neck height"
                        min={0.12}
                        max={0.93}
                        step={0.01}
                        value={overlay.neck}
                        change={(neck) => fitUpdate({ neck })}
                      />
                      <Range
                        label="Adjust shoulder width"
                        min={0.2}
                        max={1.6}
                        step={0.01}
                        value={overlay.width}
                        change={(width) => fitUpdate({ width })}
                      />
                      <Range
                        label="Move outfit horizontally"
                        min={0}
                        max={1}
                        step={0.01}
                        value={overlay.x}
                        change={(x) => fitUpdate({ x })}
                      />
                      <Range
                        label="Scale outfit height"
                        min={0.13}
                        max={0.9}
                        step={0.01}
                        value={overlay.height}
                        change={(height) => fitUpdate({ height })}
                      />
                      <Range
                        label="Rotate outfit"
                        min={-22}
                        max={22}
                        step={0.25}
                        value={overlay.angle}
                        change={(angle) => fitUpdate({ angle })}
                      />
                      <div className="action-row">
                        <Button
                          variant="secondary"
                          aria-pressed={paint}
                          onClick={() => setPaint(!paint)}
                        >
                          Protect original hair and details
                        </Button>
                        {e.strokes.some(
                          (stroke) => stroke.action === 'protect',
                        ) && (
                          <Button
                            variant="quiet"
                            onClick={() =>
                              commit({
                                strokes: e.strokes.filter(
                                  (stroke) => stroke.action !== 'protect',
                                ),
                                outfit: { ...overlay, approved: false },
                              })
                            }
                          >
                            Clear protection
                          </Button>
                        )}
                      </div>
                      {paint && (
                        <>
                          <p className="muted">
                            Paint where original hair or clothing should
                            remain visible above the outfit.
                          </p>
                          <Range
                            label="Protection brush size"
                            min={0.005}
                            max={0.13}
                            step={0.001}
                            value={radius}
                            change={setRadius}
                          />
                          <BrushView
                            file={file}
                            action="protect"
                            radius={radius}
                            softness={softness}
                            add={addStroke}
                          />
                        </>
                      )}
                      <Check
                        label="Approve outfit for export"
                        checked={overlay.approved}
                        onChange={(approved) => fitUpdate({ approved })}
                      />
                    </>
                  )}
                </>
              )}
              {editing === 'Adjust' && (
                <>
                  {colorFields.map(([k, label, min, max, step]) => (
                    <Range
                      key={k}
                      label={label}
                      value={e.color[k]}
                      min={min}
                      max={max}
                      step={step}
                      change={(v) => setColors({ [k]: v })}
                    />
                  ))}
                  <Check
                    label="Grayscale"
                    checked={e.color.grayscale}
                    onChange={(grayscale) => setColors({ grayscale })}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => commit({ color: neutral })}
                  >
                    Reset color adjustments
                  </Button>
                </>
              )}
              {editing === 'Enhance' && (
                <>
                  <Button
                    onClick={() =>
                      setColors({
                        ...autoCredit(analysis),
                        noise: 24,
                        sharpness: 20,
                      })
                    }
                  >
                    Natural enhancement
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setColors({ sharpness: 32, noise: 15 })}
                  >
                    Reduce minor softness
                  </Button>
                  <Range
                    label="Fine sharpening"
                    min={0}
                    max={80}
                    value={e.color.sharpness}
                    change={(sharpness) => setColors({ sharpness })}
                  />
                  <Range
                    label="Fine denoise"
                    min={0}
                    max={90}
                    value={e.color.noise}
                    change={(noise) => setColors({ noise })}
                  />
                  <p className="muted">
                    Classical sharpening can improve mild softness. Motion
                    blur and severe defocus can lose details that sharpening
                    cannot recover.
                  </p>
                </>
              )}
              {editing === 'Restore' && (
                <>
                  <div className="action-row">
                    <Button
                      onClick={() =>
                        setColors({
                          ...autoCredit(analysis),
                          contrast: 20,
                          noise: 38,
                          sharpness: 15,
                        })
                      }
                    >
                      Restore faded tones
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setColors({
                          grayscale: true,
                          contrast: 16,
                          shadows: 10,
                        })
                      }
                    >
                      Balance grayscale
                    </Button>
                  </div>
                  <Button
                    variant="secondary"
                    aria-pressed={paint}
                    onClick={() => {
                      setBrush('restore')
                      setPaint(!paint)
                    }}
                  >
                    Paint small scratch cleanup
                  </Button>
                  {paint && (
                    <>
                      <p className="muted">
                        Paint a small mark in an area with similar neighboring
                        pixels. Cleanup samples adjacent detail. Review the
                        result and undo if it crosses a face or edge.
                      </p>
                      <Range
                        label="Cleanup brush size"
                        min={0.003}
                        max={0.045}
                        step={0.001}
                        value={Math.min(0.045, radius)}
                        change={setRadius}
                      />
                      <BrushView
                        file={file}
                        action="restore"
                        radius={Math.min(0.045, radius)}
                        softness={softness}
                        add={addStroke}
                      />
                    </>
                  )}
                </>
              )}
              {editing === 'Border' && (
                <>
                  <Range
                    label="Border thickness"
                    min={0}
                    max={12}
                    step={0.25}
                    value={e.border}
                    change={(border) => commit({ border })}
                  />
                  <Field label="Border color">
                    <input
                      type="color"
                      value={e.borderColor}
                      onChange={(v) =>
                        commit({ borderColor: v.target.value })
                      }
                    />
                  </Field>
                  <Range
                    label="Photo margin"
                    min={0}
                    max={20}
                    step={0.25}
                    value={e.margin}
                    change={(margin) => commit({ margin })}
                  />
                  {!passport && (
                    <>
                      <Range
                        label="Rounded corners"
                        min={0}
                        max={24}
                        step={0.25}
                        value={e.corners}
                        change={(corners) => commit({ corners })}
                      />
                      <Check
                        label="Decorative shadow"
                        checked={e.shadow}
                        onChange={(shadow) => commit({ shadow })}
                      />
                    </>
                  )}
                </>
              )}
              {editing === 'Print & Export' && (
                <>
                  <SheetOptions
                    settings={sheet}
                    change={setSheetOptions}
                    passport={passport}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (sheet.photo.width > 0 && sheet.photo.height > 0) {
                        const ratio = sheet.photo.width / sheet.photo.height
                        setRatio(-1)
                        commit({
                          crop: cropRatio(
                            analysis.width,
                            analysis.height,
                            ratio,
                          ),
                          rotation: 0,
                        })
                      }
                    }}
                  >
                    Crop to the print ratio
                  </Button>
                  <p className="muted">
                    {sourceDPI ?? '—'} effective source DPI at this size.
                    Pixel enlargement cannot add original detail.
                  </p>
                  <ErrorState error={planError} />
                </>
              )}
            </fieldset>
          </Panel>
        </div>
      )}
      {showPaper && preview && plan.length > 0 && (
        <Panel title="Physical sheet preview">
          <PhotoPaper files={[preview]} plan={plan} cuts={sheet.cuts} />
        </Panel>
      )}
      {file && analysis && (
        <Panel title="Download and print">
          <div className="form-grid">
            <Field label="Photo output format">
              <select
                value={format}
                onChange={(v) => {
                  setFormat(v.target.value as ImageMime)
                  setItems([])
                }}
              >
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp">WebP</option>
              </select>
            </Field>
            {!passport && (
              <Field label="Pixel scaling">
                <select
                  value={upscale}
                  onChange={(v) => {
                    setUpscale(+v.target.value)
                    setItems([])
                  }}
                >
                  <option value={1}>Source scale</option>
                  <option value={2}>2× standard resampling</option>
                </select>
              </Field>
            )}
            {format !== 'image/png' && (
              <Range
                label="Export quality"
                min={0.55}
                max={1}
                step={0.01}
                value={quality}
                change={setQuality}
              />
            )}
          </div>
          {e.background === 'transparent' && format === 'image/jpeg' && (
            <p className="muted">
              JPEG fills transparency with white. Use PNG to retain
              transparent pixels.
            </p>
          )}
          {upscale === 2 && !passport && (
            <p className="muted">
              The 2× option uses standard resampling. It does not add original
              image detail.
            </p>
          )}
          <p className="muted">
            Some applications require an unaltered photograph. Check the
            issuing authority's photo requirements before using digitally
            edited clothing or appearance.
          </p>
          <div className="action-row">
            <Button
              disabled={!allowed}
              onClick={() =>
                void run('Rendering full-quality photo', async (signal) => {
                  const result = await renderFull(signal, passport)
                  const blob = passport
                    ? await withDPI(result.blob, sheet.dpi)
                    : result.blob
                  signal.throwIfAborted()
                  const item = {
                    name: stem(file.name) + '-docready.' + extension(format),
                    blob,
                    detail: result.width + ' × ' + result.height + ' px',
                  }
                  setItems([item])
                  saveFile(item)
                })
              }
            >
              Download edited photo
            </Button>
            <Button
              variant="secondary"
              disabled={!allowed}
              onClick={() =>
                void run('Preparing exact-size print PDF', async (signal) => {
                  const item = await buildPDF(signal)
                  signal.throwIfAborted()
                  setItems([item])
                  saveFile(item)
                })
              }
            >
              Download print-ready PDF
            </Button>
            <Button
              variant="secondary"
              disabled={!allowed}
              onClick={() =>
                openPhotoPrint(
                  () => buildPDF(new AbortController().signal),
                  setErrors,
                )
              }
            >
              Open print preview
            </Button>
          </div>
          <Results items={items} />
        </Panel>
      )}
    </div>
  )
}
