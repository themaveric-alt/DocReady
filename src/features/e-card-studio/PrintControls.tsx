import {
  ArrowDownUp,
  Columns2,
  Files,
  Grid2X2,
  LayoutTemplate,
  Rows2,
  Square,
} from 'lucide-react'
import {
  Button,
  Check,
  Field,
  Panel,
  useObjectUrl,
} from '../../components/shared'
import type { Card } from './cardCrop'
import { intrinsic } from './cardCrop'
import {
  contain,
  effectiveDpi,
  marksFor,
  mmToPixels,
  rulerFor,
  withinPaper,
  type LayoutMode,
  type Placement,
  type PrintSettings,
  type Sheet,
} from './printLayout'
import { sheetDpi } from './printExport'
import type { Position } from './printLayout'
import { useRef, useState, type PointerEvent } from 'react'

export const modes = [
  ['wide', 'Side by side', Columns2],
  ['vertical', 'Top & bottom', Rows2],
  ['single', 'Single card', Square],
  ['custom', 'Custom position', LayoutTemplate],
  ['grid', 'Multiple cards', Grid2X2],
  ['duplex', 'Duplex', Files],
] as const

export const sideLabel = (card: Card) =>
  card.side === 'front'
    ? 'Front'
    : card.side === 'back'
      ? 'Back'
      : 'Extra card'
export function LayoutChoice({
  mode,
  onChange,
}: {
  mode: LayoutMode
  onChange: (mode: LayoutMode) => void
}) {
  return (
    <div className="ecard-modes" role="group" aria-label="Print layout">
      {modes.map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          aria-pressed={mode === id}
          onClick={() => onChange(id)}
        >
          <Icon size={22} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
export function NumberField({
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
  change: (v: number) => void
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => change(e.target.valueAsNumber)}
      />
    </Field>
  )
}
export function PrintControls({
  s,
  change,
  cards,
}: {
  s: PrintSettings
  change: (p: Partial<PrintSettings>) => void
  cards: Card[]
}) {
  return (
    <details className="ecard-print-settings" open>
      <summary>Paper and print settings</summary>
      <div className="ecard-fields">
        {s.mode !== 'pvc' && (
          <>
            <Field label="Paper size">
              <select
                value={s.paper}
                onChange={(e) =>
                  change({ paper: e.target.value as PrintSettings['paper'] })
                }
              >
                <option value="A4">A4 · 210 × 297 mm</option>
                <option value="A5">A5 · 148 × 210 mm</option>
                <option value="Letter">US Letter · 215.9 × 279.4 mm</option>
                <option value="custom">Custom paper</option>
              </select>
            </Field>
            <Field label="Orientation">
              <select
                value={s.orientation}
                onChange={(e) =>
                  change({
                    orientation: e.target
                      .value as PrintSettings['orientation'],
                  })
                }
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
                <option value="auto">Automatic best fit</option>
              </select>
            </Field>
            {s.paper === 'custom' && (
              <>
                <NumberField
                  label="Paper width (mm)"
                  min={35}
                  max={600}
                  value={s.paperSize.width}
                  change={(width) =>
                    change({ paperSize: { ...s.paperSize, width } })
                  }
                />
                <NumberField
                  label="Paper height (mm)"
                  min={35}
                  max={600}
                  value={s.paperSize.height}
                  change={(height) =>
                    change({ paperSize: { ...s.paperSize, height } })
                  }
                />
              </>
            )}
            {s.mode === 'single' && (
              <Field label="Side to print">
                <select
                  value={
                    s.single ||
                    cards.find((c) => c.side === 'front')?.id ||
                    cards[0]?.id
                  }
                  onChange={(e) => change({ single: e.target.value })}
                >
                  {cards.map((card, i) => (
                    <option key={card.id} value={card.id}>
                      {sideLabel(card)} · Crop {i + 1}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {s.mode === 'duplex' && (
              <Field label="Duplex flip edge">
                <select
                  value={s.flip}
                  onChange={(e) =>
                    change({ flip: e.target.value as PrintSettings['flip'] })
                  }
                >
                  <option value="long">Flip on long edge</option>
                  <option value="short">Flip on short edge</option>
                </select>
              </Field>
            )}
          </>
        )}
        <Field label="Print resolution">
          <select
            value={s.dpi}
            onChange={(e) =>
              change({ dpi: Number(e.target.value) as PrintSettings['dpi'] })
            }
          >
            <option value={300}>300 DPI</option>
            <option value={600}>600 DPI</option>
            <option value={0}>Automatic · use source quality</option>
          </select>
        </Field>
        {s.mode !== 'pvc' && (
          <>
            <Field label="Cutting guides">
              <select
                value={s.marks}
                onChange={(e) =>
                  change({ marks: e.target.value as PrintSettings['marks'] })
                }
              >
                <option value="none">None</option>
                <option value="corners">Light corner marks</option>
                <option value="border">Cutting border</option>
                <option value="guides">Long alignment guides</option>
              </select>
            </Field>
            <NumberField
              label="Side margins (mm)"
              min={0}
              max={100}
              value={s.marginX}
              change={(marginX) => change({ marginX })}
            />
            <NumberField
              label="Top and bottom margins (mm)"
              min={0}
              max={100}
              value={s.marginY}
              change={(marginY) => change({ marginY })}
            />
            <NumberField
              label="Horizontal gap (mm)"
              min={0}
              max={100}
              value={s.gapX}
              change={(gapX) => change({ gapX })}
            />
            <NumberField
              label="Vertical gap (mm)"
              min={0}
              max={100}
              value={s.gapY}
              change={(gapY) => change({ gapY })}
            />
            <Field label="Horizontal alignment">
              <select
                value={s.horizontal}
                onChange={(e) =>
                  change({
                    horizontal: e.target.value as PrintSettings['horizontal'],
                  })
                }
              >
                <option value="center">Center</option>
                <option value="left">Left</option>
              </select>
            </Field>
            <Field label="Vertical alignment">
              <select
                value={s.vertical}
                onChange={(e) =>
                  change({
                    vertical: e.target.value as PrintSettings['vertical'],
                  })
                }
              >
                <option value="center">Center</option>
                <option value="top">Top</option>
              </select>
            </Field>
          </>
        )}
      </div>
      <div className="ecard-print-checks">
        {s.mode !== 'pvc' && (
          <Check
            label="Print a 50 mm calibration ruler"
            checked={s.ruler}
            onChange={(ruler) => change({ ruler })}
          />
        )}
        <Check
          label="Keep eligible whole PDF pages as vectors"
          checked={s.vector}
          onChange={(vector) => change({ vector })}
        />
      </div>
    </details>
  )
}
function PaperCard({
  placement,
  card,
  sheet,
  custom,
  start,
  move,
  finish,
}: {
  placement: Placement
  card: Card
  sheet: Sheet
  custom: boolean
  start: (e: PointerEvent<HTMLButtonElement>, p: Placement) => void
  move: (e: PointerEvent<HTMLButtonElement>) => void
  finish: (e: PointerEvent<HTMLButtonElement>) => void
}) {
  const url = useObjectUrl(card.preview.blob)
  const frame = contain(intrinsic(card), placement)
  const image = {
    inset: 'auto',
    left: (frame.x / placement.width) * 100 + '%',
    top: (frame.y / placement.height) * 100 + '%',
    width: (frame.width / placement.width) * 100 + '%',
    height: (frame.height / placement.height) * 100 + '%',
  }
  const style = {
    left: `${(placement.x / sheet.width) * 100}%`,
    top: `${(placement.y / sheet.height) * 100}%`,
    width: `${(placement.width / sheet.width) * 100}%`,
    height: `${(placement.height / sheet.height) * 100}%`,
  }
  return custom ? (
    <button
      type="button"
      aria-label={'Move ' + sideLabel(card) + ' print placement'}
      className="ecard-paper-card"
      style={style}
      onPointerDown={(e) => start(e, placement)}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <img src={url} alt="" draggable={false} style={image} />
    </button>
  ) : (
    <div className="ecard-paper-card" style={style}>
      <img
        src={url}
        alt={sideLabel(card) + ' print placement'}
        style={image}
        draggable={false}
      />
    </div>
  )
}
export function PaperPreview({
  s,
  sheets,
  cards,
  onPlace,
  reset,
}: {
  s: PrintSettings
  sheets: Sheet[]
  cards: Card[]
  onPlace: (id: string, p: Position) => void
  reset: () => void
}) {
  const [active, setActive] = useState(0)
  const index = Math.min(active, sheets.length - 1),
    sheet = sheets[index]
  const paper = useRef<HTMLDivElement>(null)
  const drag = useRef<{ p: Placement; x: number; y: number } | undefined>(
    undefined,
  )
  const [draft, setDraft] = useState<Placement>()
  if (!sheet) return null
  const dpi = sheetDpi(sheet, cards, s.dpi),
    custom = s.mode === 'custom'
  const guide =
    s.mode === 'pvc'
      ? []
      : [...marksFor(sheet, s.marks), ...(s.ruler ? rulerFor(sheet) : [])]
  function start(e: PointerEvent<HTMLButtonElement>, p: Placement) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { p, x: e.clientX, y: e.clientY }
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const data = drag.current,
      box = paper.current?.getBoundingClientRect()
    if (!data || !box) return
    const x = data.p.x + ((e.clientX - data.x) / box.width) * sheet.width
    const y = data.p.y + ((e.clientY - data.y) / box.height) * sheet.height
    const snap = (n: number, center: number) =>
      Math.abs(n - center) < 1.7 ? center : Math.round(n)
    setDraft(
      withinPaper(
        {
          ...data.p,
          x: snap(x, (sheet.width - data.p.width) / 2),
          y: snap(y, (sheet.height - data.p.height) / 2),
        },
        { ...sheet, height: sheet.height - (s.ruler ? 12 : 0) },
        s.marginX,
        s.marginY,
      ),
    )
  }
  function finish(e: PointerEvent<HTMLButtonElement>) {
    if (e.type === 'pointerup' && draft && drag.current)
      onPlace(draft.id, draft)
    setDraft(undefined)
    drag.current = undefined
  }
  return (
    <Panel className="ecard-paper-panel" title="Print preview">
      <p className="muted ecard-preview-meta">
        {sheet.width} × {sheet.height} mm · {sheets.length}{' '}
        {sheets.length === 1 ? 'sheet' : 'sheets'}
        <br />
        {mmToPixels(sheet.width, dpi)} × {mmToPixels(sheet.height, dpi)} px
        for a {dpi} DPI raster sheet
      </p>
      {sheets.length > 1 && (
        <Field label="Sheet to preview">
          <select
            value={index}
            onChange={(e) => setActive(Number(e.target.value))}
          >
            {sheets.map((_, i) => (
              <option key={i} value={i}>
                {s.mode === 'pvc'
                  ? sideLabel(
                      cards.find(
                        (card) => card.id === sheets[i].cards[0].id,
                      )!,
                    ) + ' card'
                  : s.mode === 'duplex'
                    ? i === 0
                      ? 'Front sheet'
                      : 'Back sheet'
                    : `Sheet ${i + 1}`}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div
        className="ecard-paper"
        ref={paper}
        style={{ aspectRatio: `${sheet.width} / ${sheet.height}` }}
      >
        {sheet.cards.map((p) => (
          <PaperCard
            key={p.id}
            placement={draft?.id === p.id ? draft : p}
            card={cards.find((c) => c.id === p.id)!}
            sheet={sheet}
            custom={custom}
            start={start}
            move={move}
            finish={finish}
          />
        ))}
        {custom && <div className="ecard-grid-guides" aria-hidden="true" />}
        <svg
          viewBox={`0 0 ${sheet.width} ${sheet.height}`}
          aria-hidden="true"
          className="ecard-paper-guides"
        >
          {guide.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              x2={l.x2}
              y1={l.y1}
              y2={l.y2}
              stroke="#61708b"
              strokeWidth=".19"
            />
          ))}
          {s.ruler && s.mode !== 'pvc' && (
            <text
              x={sheet.width / 2}
              y={sheet.height - 3}
              textAnchor="middle"
              fontSize="2.4"
              fill="#465673"
            >
              50 mm · Actual Size / 100%
            </text>
          )}
        </svg>
      </div>
      {custom && (
        <div className="ecard-position">
          <p className="muted">
            Drag a card to reposition it. The center guides snap placement.
            For precise placement, enter millimeters below.
          </p>
          <Button variant="secondary" onClick={reset}>
            <ArrowDownUp size={16} /> Restore aligned positions
          </Button>
          {sheet.cards.map((p) => (
            <div key={p.id} className="ecard-fields">
              <NumberField
                label={
                  sideLabel(cards.find((c) => c.id === p.id)!) + ' X (mm)'
                }
                min={0}
                max={600}
                step={0.1}
                value={Math.round(p.x * 10) / 10}
                change={(x) => {
                  if (Number.isFinite(x)) onPlace(p.id, { x, y: p.y })
                }}
              />
              <NumberField
                label={
                  sideLabel(cards.find((c) => c.id === p.id)!) + ' Y (mm)'
                }
                min={0}
                max={600}
                step={0.1}
                value={Math.round(p.y * 10) / 10}
                change={(y) => {
                  if (Number.isFinite(y)) onPlace(p.id, { x: p.x, y })
                }}
              />
            </div>
          ))}
        </div>
      )}
      <ul className="ecard-dpi">
        {sheet.cards.map((p) => {
          const card = cards.find((c) => c.id === p.id)!,
            source = intrinsic(card),
            available = card.source.pdf ? undefined : effectiveDpi(source, p)
          return (
            <li key={p.id}>
              <strong>
                {sideLabel(card)} · {p.width.toFixed(2)} ×{' '}
                {p.height.toFixed(2)} mm
              </strong>
              <small>
                {available === undefined
                  ? card.source.imageOnly
                    ? 'Scanned PDF detail depends on the original scan. Check the photo and QR code before printing.'
                    : 'PDF quality depends on its embedded images.'
                  : `${source.width} × ${source.height} source px · ${available} effective source DPI`}
              </small>
              {available !== undefined && available < dpi && (
                <span className="ecard-warn">
                  Below {dpi} DPI. Upscaling adds no detail.
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
