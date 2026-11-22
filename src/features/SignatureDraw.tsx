import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  Button,
  Field,
  Panel,
  ErrorState,
  Results,
  useOperation,
  Progress,
} from '../components/shared'
import { canvasBlob } from '../lib/raster'
type Point = { x: number; y: number }
type Stroke = { points: Point[]; width: number; color: string }
export default function SignatureDraw() {
  const ref = useRef<HTMLCanvasElement>(null),
    active = useRef<Stroke | null>(null),
    [strokes, setStrokes] = useState<Stroke[]>([]),
    [size, setSize] = useState(4),
    [color, setColor] = useState('#171b36'),
    [background, setBackground] = useState('transparent')
  const op = useOperation()
  function paint(next: Stroke[]) {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 1000, 350)
    if (background === 'white') {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 1000, 350)
    }
    for (const stroke of next) {
      const { points: p } = stroke
      ctx.lineWidth = stroke.width
      ctx.strokeStyle = ctx.fillStyle = stroke.color
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (p.length === 1) {
        ctx.beginPath()
        ctx.arc(p[0].x, p[0].y, stroke.width / 2, 0, Math.PI * 2)
        ctx.fill()
        continue
      }
      ctx.beginPath()
      ctx.moveTo(p[0].x, p[0].y)
      for (let i = 1; i < p.length - 1; i++)
        ctx.quadraticCurveTo(
          p[i].x,
          p[i].y,
          (p[i].x + p[i + 1].x) / 2,
          (p[i].y + p[i + 1].y) / 2,
        )
      ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y)
      ctx.stroke()
    }
  }
  useEffect(() => {
    paint(strokes)
  }, [strokes, background])
  function point(e: PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * 1000,
      y: ((e.clientY - r.top) / r.height) * 350,
    }
  }
  function end() {
    if (active.current) {
      const stroke = active.current
      active.current = null
      setStrokes((s) => [...s, stroke])
    }
  }
  return (
    <>
      <div className="tool-layout">
        <Panel title="Signature canvas">
          <canvas
            width={1000}
            height={350}
            ref={ref}
            className="signature-canvas"
            aria-label="Signature drawing area"
            onPointerDown={(e) => {
              if (op.pending || active.current) return
              e.currentTarget.setPointerCapture(e.pointerId)
              op.reset()
              active.current = { points: [point(e)], width: size, color }
              paint([...strokes, active.current])
            }}
            onPointerMove={(e) => {
              if (active.current) {
                active.current.points.push(point(e))
                paint([...strokes, active.current])
              }
            }}
            onPointerUp={end}
            onPointerCancel={end}
          />
          <div className="action-row">
            <Button
              variant="secondary"
              disabled={!strokes.length || op.pending}
              onClick={() => {
                op.reset()
                setStrokes((s) => s.slice(0, -1))
              }}
            >
              Undo stroke
            </Button>
            <Button
              variant="quiet"
              disabled={!strokes.length || op.pending}
              onClick={() => {
                op.reset()
                setStrokes([])
              }}
            >
              Clear canvas
            </Button>
          </div>
        </Panel>
        <Panel title="Pen and paper">
          <fieldset className="form-grid" disabled={op.pending}>
            <Field label={'Pen width ' + size + ' px'}>
              <input
                type="range"
                min={1}
                max={25}
                value={size}
                onChange={(e) => setSize(+e.target.value)}
              />
            </Field>
            <Field label="Pen color">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </Field>
            <Field label="Background">
              <select
                value={background}
                onChange={(e) => {
                  op.reset()
                  setBackground(e.target.value)
                }}
              >
                <option value="transparent">Transparent</option>
                <option value="white">White</option>
              </select>
            </Field>
          </fieldset>
          <p className="mini">
            The exported PNG contains your drawing. It carries no digital
            certificate or identity verification.
          </p>
          <div className="action-row">
            <Button
              disabled={!strokes.length || op.pending}
              onClick={() =>
                void op.run(async () => [
                  {
                    name: 'signature.png',
                    blob: await canvasBlob(ref.current!, 'image/png'),
                    detail: '1000 × 350 px',
                  },
                ])
              }
            >
              Export PNG
            </Button>
          </div>
          <ErrorState error={op.error} />
          <Progress pending={op.pending} />
        </Panel>
      </div>
      <Results items={op.items} />
    </>
  )
}
