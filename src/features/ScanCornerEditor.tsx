import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Point } from '../lib/perspective'
import type { ScanCorners } from '../lib/scan-geometry'

const clamp = (n: number) => Math.max(0, Math.min(1, n))
const arrows: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
}

export default function ScanCornerEditor({
  url,
  corners,
  disabled,
  onCorner,
}: {
  url: string
  corners: ScanCorners
  disabled: boolean
  onCorner: (index: number, point: Point) => void
}) {
  const image = useRef<HTMLImageElement>(null)
  const outline = useRef<HTMLCanvasElement>(null)
  const loupe = useRef<HTMLCanvasElement>(null)
  const pointer = useRef<{ id: number; corner: number } | null>(null)
  const [active, setActive] = useState<number>()
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const photo = image.current
    if (!photo) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(photo)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const canvas = outline.current
    if (!canvas || !size.width || !size.height) return
    const scale = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size.width * scale)
    canvas.height = Math.round(size.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = canvas
    const path = new Path2D()
    for (const [index, point] of corners.entries()) {
      const x = point.x * width
      const y = point.y * height
      if (!index) path.moveTo(x, y)
      else path.lineTo(x, y)
    }
    path.closePath()
    const shade = new Path2D()
    shade.rect(0, 0, width, height)
    shade.addPath(path)
    ctx.fillStyle = 'rgba(22, 20, 44, 0.38)'
    ctx.fill(shade, 'evenodd')
    ctx.lineWidth = 4 * scale
    ctx.strokeStyle = '#fff'
    ctx.stroke(path)
    ctx.lineWidth = 2 * scale
    ctx.strokeStyle = '#5949d1'
    ctx.stroke(path)
  }, [corners, size])

  useLayoutEffect(() => {
    const photo = image.current
    const canvas = loupe.current
    if (active === undefined || !photo?.naturalWidth || !canvas || !size.width)
      return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = canvas
    const { x, y } = corners[active]
    const sample = (44 * photo.naturalWidth) / size.width
    ctx.fillStyle = '#27243c'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(
      photo,
      x * photo.naturalWidth - sample / 2,
      y * photo.naturalHeight - sample / 2,
      sample,
      sample,
      0,
      0,
      width,
      height,
    )
    ctx.beginPath()
    ctx.moveTo(width / 2 - 14, height / 2)
    ctx.lineTo(width / 2 + 14, height / 2)
    ctx.moveTo(width / 2, height / 2 - 14)
    ctx.lineTo(width / 2, height / 2 + 14)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.strokeStyle = '#5949d1'
    ctx.lineWidth = 2
    ctx.stroke()
  }, [active, corners, size])

  function stop(id: number) {
    if (pointer.current?.id !== id) return
    pointer.current = null
    setActive(undefined)
  }

  return (
    <div className="scan-editor">
      <div
        className="scan-stage"
        onPointerMove={(e) => {
          const drag = pointer.current
          if (disabled || !drag || drag.id !== e.pointerId || !image.current)
            return
          const bounds = image.current.getBoundingClientRect()
          onCorner(drag.corner, {
            x: clamp((e.clientX - bounds.left) / bounds.width),
            y: clamp((e.clientY - bounds.top) / bounds.height),
          })
        }}
        onPointerUp={(e) => stop(e.pointerId)}
        onPointerCancel={(e) => stop(e.pointerId)}
        onLostPointerCapture={(e) => stop(e.pointerId)}
      >
        <img ref={image} src={url} alt="Source document" draggable={false} />
        <canvas ref={outline} className="scan-outline" aria-hidden="true" />
        {corners.map((point, i) => (
          <button
            key={i}
            type="button"
            aria-label={'Corner ' + (i + 1) + ' · use arrow keys'}
            style={{ left: point.x * 100 + '%', top: point.y * 100 + '%' }}
            disabled={disabled}
            onPointerDown={(e) => {
              if (e.button !== 0 || pointer.current) return
              e.currentTarget.focus({ preventScroll: true })
              e.currentTarget.setPointerCapture(e.pointerId)
              pointer.current = { id: e.pointerId, corner: i }
              setActive(i)
            }}
            onKeyDown={(e) => {
              const direction = arrows[e.key]
              if (!direction) return
              e.preventDefault()
              const step = e.shiftKey ? 0.02 : 0.004
              onCorner(i, {
                x: clamp(point.x + step * direction.x),
                y: clamp(point.y + step * direction.y),
              })
            }}
          >
            <span>{i + 1}</span>
          </button>
        ))}
        {active !== undefined && (
          <canvas
            ref={loupe}
            className={
              'scan-loupe' + (corners[active].x > 0.5 ? ' scan-loupe-left' : '')
            }
            width={192}
            height={192}
            role="img"
            aria-label="Magnified crop detail"
          />
        )}
      </div>
    </div>
  )
}
