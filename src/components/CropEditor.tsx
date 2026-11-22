import { useRef, type PointerEvent } from 'react'
import { Field, useObjectUrl } from './shared'
import type { Crop } from '../lib/raster'
export default function CropEditor({
  file,
  crop,
  change,
  ratio,
  disabled = false,
}: {
  file: Blob
  crop: Crop
  change: (crop: Crop) => void
  ratio: number
  disabled?: boolean
}) {
  const url = useObjectUrl(file),
    start = useRef<{ x: number; y: number } | undefined>(undefined)
  function point(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      ratio: r.width / r.height,
    }
  }
  function drag(e: PointerEvent<HTMLDivElement>) {
    if (!start.current || disabled) return
    const p = point(e),
      a = start.current
    let w = Math.abs(a.x - p.x),
      h = Math.abs(a.y - p.y)
    if (ratio) {
      if ((w * p.ratio) / h > ratio) w = (h * ratio) / p.ratio
      else h = (w * p.ratio) / ratio
    }
    if (w < 0.005 || h < 0.005) return
    change({
      x: p.x < a.x ? a.x - w : a.x,
      y: p.y < a.y ? a.y - h : a.y,
      width: w,
      height: h,
    })
  }
  return (
    <>
      {url && (
        <div className="crop-stage">
          <div
            className="crop-box"
            onPointerDown={(e) => {
              if (disabled) return
              start.current = point(e)
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={drag}
            onPointerUp={(e) => {
              drag(e)
              start.current = undefined
            }}
            onPointerCancel={() => {
              start.current = undefined
            }}
          >
            <img
              draggable={false}
              src={url}
              alt="Original image for selecting a crop"
            />
            <div
              className="crop-area"
              style={{
                left: crop.x * 100 + '%',
                top: crop.y * 100 + '%',
                width: crop.width * 100 + '%',
                height: crop.height * 100 + '%',
              }}
            />
          </div>
        </div>
      )}
      <fieldset disabled={disabled} className="form-grid action-row">
        {(['x', 'y', 'width', 'height'] as const).map((key, i) => (
          <Field
            key={key}
            label={
              [
                'Crop left (%)',
                'Crop top (%)',
                'Crop width (%)',
                'Crop height (%)',
              ][i]
            }
          >
            <input
              type="number"
              min={i < 2 ? 0 : 1}
              max={100}
              step=".1"
              value={Math.round(crop[key] * 1000) / 10}
              onChange={(e) => {
                const n = Math.min(
                    1,
                    Math.max(i < 2 ? 0 : 0.01, +e.target.value / 100),
                  ),
                  next = { ...crop, [key]: n }
                next.x = Math.min(next.x, 1 - next.width)
                next.y = Math.min(next.y, 1 - next.height)
                change(next)
              }}
            />
          </Field>
        ))}
      </fieldset>
    </>
  )
}
