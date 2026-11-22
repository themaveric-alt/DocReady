import { useState } from 'react'
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
  useOperation,
} from '../../components/shared'
import { marksFor } from '../e-card-studio/printLayout'
import { images, sizeLabel } from '../../lib/files'
import {
  bins,
  defaultPhotoSheet,
  makePhotoSheet,
  openPhotoPrint,
  photoPapers,
  photoPlan,
  printInspection,
  type PhotoSheetSettings,
} from './printPhotos'

export function Count({
  label,
  value,
  min = 1,
  max = 10000,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (n: number) => void
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
      />
    </Field>
  )
}
export function SheetOptions({
  settings: s,
  change,
  passport = false,
}: {
  settings: PhotoSheetSettings
  change: (s: PhotoSheetSettings) => void
  passport?: boolean
}) {
  const paper =
    Object.keys(photoPapers).find(
      (key) =>
        photoPapers[key].width === s.paper.width &&
        photoPapers[key].height === s.paper.height,
    ) ?? 'Custom'
  const patch = (diff: Partial<PhotoSheetSettings>) =>
    change({ ...s, ...diff })
  return (
    <>
      {passport && (
        <Field label="Photo size preset">
          <select
            aria-label="Photo size preset"
            value={
              s.photo.width === 35 && s.photo.height === 45
                ? '35 × 45'
                : s.photo.width === 50.8 && s.photo.height === 50.8
                  ? '2 × 2 inches'
                  : 'Custom'
            }
            onChange={(e) => {
              if (e.target.value === '35 × 45')
                patch({ photo: { width: 35, height: 45 } })
              else if (e.target.value === '2 × 2 inches')
                patch({ photo: { width: 50.8, height: 50.8 } })
              else patch({ photo: { width: 40, height: 50 } })
            }}
          >
            <option>35 × 45</option>
            <option>2 × 2 inches</option>
            <option>Custom</option>
          </select>
        </Field>
      )}
      <div className="form-grid">
        <Count
          label="Photo width (mm)"
          value={s.photo.width}
          min={5}
          max={300}
          step={0.1}
          onChange={(v) => patch({ photo: { ...s.photo, width: v } })}
        />
        <Count
          label="Photo height (mm)"
          value={s.photo.height}
          min={5}
          max={300}
          step={0.1}
          onChange={(v) => patch({ photo: { ...s.photo, height: v } })}
        />
        <Field label="Paper size">
          <select
            value={paper}
            onChange={(e) =>
              patch({
                paper: photoPapers[e.target.value] ?? {
                  width: 140,
                  height: 190,
                },
              })
            }
          >
            {[...Object.keys(photoPapers), 'Custom'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        {paper === 'Custom' && (
          <>
            <Count
              label="Paper width (mm)"
              value={s.paper.width}
              min={35}
              max={600}
              step={0.1}
              onChange={(v) => patch({ paper: { ...s.paper, width: v } })}
            />
            <Count
              label="Paper height (mm)"
              value={s.paper.height}
              min={35}
              max={600}
              step={0.1}
              onChange={(v) => patch({ paper: { ...s.paper, height: v } })}
            />
          </>
        )}
        <Count
          label="Copies per photo"
          value={s.copies}
          max={100}
          onChange={(copies) => patch({ copies })}
        />
        <Count
          label="Gap (mm)"
          value={s.gap}
          min={0}
          max={50}
          step={0.1}
          onChange={(gap) => patch({ gap })}
        />
        <Count
          label="Paper margin (mm)"
          value={s.margin}
          min={0}
          max={60}
          step={0.1}
          onChange={(margin) => patch({ margin })}
        />
        <Field label="Individual photo resolution">
          <select
            value={s.dpi}
            onChange={(e) =>
              patch({ dpi: Number(e.target.value) as 150 | 300 | 600 })
            }
          >
            <option value={150}>150 DPI</option>
            <option value={300}>300 DPI</option>
            <option value={600}>600 DPI</option>
          </select>
        </Field>
      </div>
      <div className="action-row">
        <Check
          label="Landscape"
          checked={s.landscape}
          onChange={(landscape) => patch({ landscape })}
        />
        <Check
          label="Cutting guides"
          checked={s.cuts}
          onChange={(cuts) => patch({ cuts })}
        />
      </div>
      <p className="muted">
        Print at Actual Size / 100%. Match the printer’s physical paper size.
      </p>
    </>
  )
}
type Plan = ReturnType<typeof photoPlan>
function PhotoFrame({ file }: { file: Blob }) {
  const src = useObjectUrl(file)
  return <img alt="" src={src} />
}
export function PhotoPaper({
  files,
  plan,
  cuts = false,
}: {
  files: Blob[]
  plan: Plan
  cuts?: boolean
}) {
  const [chosen, setChosen] = useState(0),
    index = Math.min(chosen, plan.length - 1),
    sheet = plan[index]
  if (!sheet) return null
  return (
    <div className="photo-paper-wrap">
      {plan.length > 1 && (
        <Field label="Preview page">
          <select value={index} onChange={(e) => setChosen(+e.target.value)}>
            {plan.map((_, i) => (
              <option value={i} key={i}>
                Page {i + 1}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div
        className="photo-paper"
        aria-label="Actual photo placement preview"
        style={{ aspectRatio: sheet.width + ' / ' + sheet.height }}
      >
        {sheet.cards.map((card, i) => (
          <div
            key={i}
            style={{
              left: (card.x / sheet.width) * 100 + '%',
              top: (card.y / sheet.height) * 100 + '%',
              width: (card.width / sheet.width) * 100 + '%',
              height: (card.height / sheet.height) * 100 + '%',
            }}
          >
            <PhotoFrame file={files[+card.id]} />
          </div>
        ))}
        {cuts && (
          <svg
            viewBox={`0 0 ${sheet.width} ${sheet.height}`}
            aria-hidden="true"
          >
            {marksFor(sheet, 'corners').map((line, i) => (
              <line
                key={i}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke="#657088"
                strokeWidth=".14"
              />
            ))}
          </svg>
        )}
      </div>
      <small>
        {sheet.width} × {sheet.height} mm · {plan.length}{' '}
        {plan.length === 1 ? 'page' : 'pages'}
      </small>
    </div>
  )
}
export function BatchPrint({
  defaults = defaultPhotoSheet,
}: {
  defaults?: PhotoSheetSettings
}) {
  const [files, setFiles] = useState<File[]>([]),
    [s, set] = useState({ ...defaults, copies: 1 })
  const op = useOperation()
  let plan: Plan = [],
    warning = ''
  try {
    plan = photoPlan(files.length, s)
  } catch (e) {
    if (files.length) warning = String((e as Error).message)
  }
  return (
    <div className="advanced-columns">
      <Panel title="Photos and paper">
        <Dropzone
          label="Select batch photos"
          accept={[...images]}
          multiple
          compact
          description="Up to 12 photos"
          onFiles={(f) => {
            setFiles(f.slice(0, 12))
            op.reset()
          }}
        />
        {files.length > 0 && (
          <ul>
            {files.map((f, i) => (
              <li key={i}>
                {f.name}{' '}
                <Button
                  variant="quiet"
                  onClick={() => {
                    setFiles(files.filter((_, j) => j !== i))
                    op.reset()
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <SheetOptions
          settings={s}
          change={(value) => {
            set(value)
            op.reset()
          }}
        />
        <div className="action-row">
          <Button
            disabled={!plan.length || op.pending}
            onClick={() =>
              void op.run(async () => [await makePhotoSheet(files, s)])
            }
          >
            Prepare PDF
          </Button>
          <Button
            variant="secondary"
            disabled={!plan.length || op.pending}
            onClick={() =>
              openPhotoPrint(
                () => makePhotoSheet(files, s),
                () =>
                  void op.run(async () => {
                    throw Error('Could not open the print viewer.')
                  }),
              )
            }
          >
            Print PDF
          </Button>
        </div>
        <Progress pending={op.pending} label="Preparing photo sheets" />
        <ErrorState error={warning || op.error} />
        <Results items={op.items} />
      </Panel>
      <Panel title="Sheet preview">
        <PhotoPaper files={files} plan={plan} cuts={s.cuts} />
        {!files.length && (
          <p className="muted">Select photos to preview their placement.</p>
        )}
      </Panel>
    </div>
  )
}
export function QualityInspector({ initial }: { initial?: File }) {
  const [file, setFile] = useState(initial),
    [width, setW] = useState(35),
    [height, setH] = useState(45)
  const [report, setReport] =
    useState<Awaited<ReturnType<typeof printInspection>>>()
  const op = useOperation()
  const [output, setOutput] = useState<File>()
  return (
    <Panel title="Print quality inspector">
      <div className="form-grid">
        <Dropzone
          label="Select original photo"
          accept={[...images]}
          compact
          onFiles={(f) => {
            setFile(f[0])
            setReport(undefined)
          }}
        />
        <Dropzone
          label="Compare an exported photo"
          accept={[...images]}
          compact
          onFiles={(f) => {
            setOutput(f[0])
            setReport(undefined)
          }}
        />
      </div>
      <div className="form-grid">
        <Count
          label="Target width (mm)"
          value={width}
          onChange={(n) => {
            setW(n)
            setReport(undefined)
          }}
        />
        <Count
          label="Target height (mm)"
          value={height}
          onChange={(n) => {
            setH(n)
            setReport(undefined)
          }}
        />
      </div>
      <Button
        disabled={!file || op.pending}
        onClick={() =>
          void op.run(async () => {
            setReport(await printInspection(file!, { width, height }, output))
            return []
          })
        }
      >
        Inspect quality
      </Button>
      <ErrorState error={op.error} />
      {report && (
        <>
          <dl className="advanced-metrics">
            <div>
              <dt>Original</dt>
              <dd>
                {report.original.width} × {report.original.height} px
              </dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>
                {report.result.width} × {report.result.height} px
              </dd>
            </div>
            <div>
              <dt>Effective print resolution</dt>
              <dd>{report.dpi} DPI</dd>
            </div>
            <div>
              <dt>Format and file size</dt>
              <dd>
                {report.format} · {sizeLabel(report.size)}
              </dd>
            </div>
            <div>
              <dt>Target pixels at 300 DPI</dt>
              <dd>
                {bins(width, 300)} × {bins(height, 300)}
              </dd>
            </div>
            <div>
              <dt>Source aspect ratio</dt>
              <dd>{report.ratio.toFixed(3)}</dd>
            </div>
            <div>
              <dt>Edge detail heuristic</dt>
              <dd>{report.clarity}</dd>
            </div>
          </dl>
          {report.warnings.length > 0 && (
            <ul className="advanced-warning">
              {report.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  )
}
