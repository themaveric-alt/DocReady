import { useEffect, useRef, useState, type PointerEvent, type CSSProperties } from 'react'
import { Check, Crosshair, RotateCw } from 'lucide-react'
import {
  Button,
  ErrorState,
  Field,
  Modal,
  useObjectUrl,
} from '../../components/shared'
import { errorText } from '../../lib/files'
import { previewCrop, rectangle, type Card, type Cropped } from './cardCrop'
import type { Source } from './cardInput'
import {
  fullQuad,
  bounds,
  boxQuad,
  paperLike,
  validQuad,
  type Quad,
} from './geometry'
import { manualWalletSeed, sourceWalletQuad } from './walletRegions'

const names = ['Top left', 'Top right', 'Bottom right', 'Bottom left']
const limit = (v: number) => Math.max(0, Math.min(1, v))
export function CropEditor({
  card,
  walletOnly = true,
  sources,
  close,
  apply,
}: {
  card: Card
  walletOnly?: boolean
  sources: Source[]
  close: () => void
  apply: (
    source: Source,
    corners: Quad,
    rotation: number,
    preview: Cropped,
  ) => void
}) {
  const [active, setActive] = useState(card.source)
  const [initial, setInitial] = useState(card.original)
  const [corners, setCorners] = useState(card.corners)
  const [rotation, setRotation] = useState(card.rotation)
  const [preview, setPreview] = useState<Cropped>()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const area = useRef<HTMLDivElement>(null)
  const source = useObjectUrl(active.thumb),
    thumbnail = useObjectUrl(preview?.blob)
  useEffect(() => {
    const run = new AbortController()
    const timer = window.setTimeout(() => {
      if (!validQuad(corners)) {
        setError(
          'Move the four corners clockwise without crossing the edges.',
        )
        return
      }
      setError('')
      void previewCrop(active, corners, rotation, run.signal, card.clarity).then(
        (result) => {
          if (!run.signal.aborted) {
            setPreview(result)
            setDone(true)
          }
        },
        (e) => {
          if (!run.signal.aborted) setError(errorText(e))
        },
      )
    }, 100)
    return () => {
      window.clearTimeout(timer)
      run.abort()
    }
  }, [active, corners, rotation, card.clarity])
  function update(next: Quad) {
    if (next !== corners) {
      setDone(false)
      setCorners(next)
    }
  }
  function drag(e: PointerEvent<HTMLButtonElement>, index: number) {
    const box = area.current?.getBoundingClientRect()
    if (!box || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const next = [...corners] as Quad
    next[index] = {
      x: limit((e.clientX - box.left) / box.width),
      y: limit((e.clientY - box.top) / box.height),
    }
    update(next)
  }
  return (
    <Modal title="Adjust four-corner crop" onClose={close}>
      <p className="muted">
        Drag the handles around the full card. You can also focus a handle and
        use the arrow keys. Keep every printed detail inside the outline.
      </p>
      {!card.detected && card.source.pdf && (
        <p className="ecard-warn">
          Automatic card detection needs adjustment.
        </p>
      )}
      {sources.length > 1 && (
        <Field label="Source page for this crop">
          <select
            value={active.id}
            onChange={(event) => {
              const selected = sources.find(
                (page) => page.id === event.target.value,
              )!
              const seed =
                selected === card.source
                  ? card.original
                  : paperLike(selected.width, selected.height)
                    ? manualWalletSeed(selected.width, selected.height, card.side, selected.pageRotation)
                    : fullQuad
              setActive(selected)
              setInitial(seed)
              setRotation(0)
              update(seed)
            }}
          >
            {sources.map((page) => (
              <option key={page.id} value={page.id}>
                Page {page.page! + 1}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="ecard-crop-source" ref={area} style={{ '--crop-source-ratio': active.width / active.height } as CSSProperties}>
        <img src={source} alt="Original card source" draggable={false} />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon
            points={corners.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
          />
        </svg>
        {corners.map((p, i) => (
          <button
            key={i}
            className="ecard-handle"
            type="button"
            aria-label={names[i] + ' crop corner'}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            onPointerDown={(e) => {
              e.preventDefault()
              e.currentTarget.focus()
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => drag(e, i)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 0.01 : 0.001
              const shift: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
              }
              const move = shift[e.key]
              if (!move) return
              e.preventDefault()
              const next = [...corners] as Quad
              next[i] = { x: limit(p.x + move[0]), y: limit(p.y + move[1]) }
              update(next)
            }}
          />
        ))}
      </div>
      <div className="ecard-crop-controls">
        <Button variant="secondary" onClick={() => update(initial)}>
          <Crosshair size={17} /> Reset crop
        </Button>
        {!rectangle(corners) && <Button variant="secondary" onClick={() => { const b=bounds(corners); update(boxQuad(b.left,b.top,b.right,b.bottom)) }}>Align edges for precise adjustment</Button>}
        {!(walletOnly && active.pdf && paperLike(active.width, active.height)) && <Button variant="secondary" onClick={() => update(fullQuad)}>Use whole source</Button>}
        <Button
          variant="secondary"
          onClick={() => {
            setDone(false)
            setRotation((r) => (r + 90) % 360)
          }}
        >
          <RotateCw size={17} /> Rotate 90°
        </Button>
      </div>
      {rectangle(corners) && <fieldset className="ecard-edge-inputs"><legend>Fine-tune each edge (% of source)</legend>
        {(['left','top','right','bottom'] as const).map(edge => <Field key={edge} label={edge[0].toUpperCase()+edge.slice(1)+' edge (%)'}>
          <input type="number" min="0" max="100" step="0.1" value={Number((bounds(corners)[edge]*100).toFixed(2))} onChange={event => {
            if(!event.target.value) return
            const b={...bounds(corners),[edge]:limit(Number(event.target.value)/100)}
            if(b.left < b.right && b.top < b.bottom) update(boxQuad(b.left,b.top,b.right,b.bottom))
          }} />
        </Field>)}
      </fieldset>}
      <ErrorState error={error} />
      {walletOnly && active.pdf && paperLike(active.width, active.height) && !sourceWalletQuad(corners, {
        width: active.width, height: active.height, rotation: active.pageRotation,
        lowerSection: true, anchors: [],
      }) && <p className="ecard-warn">Select only a compact landscape card. Full-page letters cannot be applied as card crops. Print sizing fits the original proportions without stretching.</p>}
      <div className="ecard-crop-result">
        <span>
          {done ? 'Corrected crop preview' : 'Updating crop preview…'}
        </span>
        {thumbnail && <img src={thumbnail} alt="Corrected crop preview" />}
      </div>
      <Button
        disabled={!done || !preview || Boolean(error) || Boolean(walletOnly && active.pdf && paperLike(active.width, active.height) && !sourceWalletQuad(corners, {
          width: active.width, height: active.height, rotation: active.pageRotation, lowerSection: true, anchors: [],
        }))}
        onClick={() => {
          if (preview) apply(active, corners, rotation, preview)
        }}
      >
        <Check size={17} /> Apply crop
      </Button>
    </Modal>
  )
}
