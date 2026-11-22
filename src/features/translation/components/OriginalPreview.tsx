import { useEffect, useRef, useState } from 'react'
import {
  ErrorState,
  FilePreview,
  useObjectUrl,
} from '../../../components/shared'
import { errorText } from '../../../lib/files'
import type { RenderPDF } from '../../../lib/pdf-render'
import type { Box, TextBlock } from '../types'
import {
  clampBox,
  overlayBox,
  type ImageMode,
} from '../image-translator/translatedImageRenderer'

export function OriginalPDF({
  file,
  page,
  zoom,
}: {
  file: File
  page: number
  zoom: number
}) {
  const [doc, setDoc] = useState<RenderPDF>()
  const [preview, setPreview] = useState<Blob>()
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true,
      current: RenderPDF | undefined
    setDoc(undefined)
    setError('')
    import('../../../lib/pdf-render')
      .then((module) => module.loadRender(file))
      .then(async (value) => {
        current = value
        if (live) setDoc(value)
        else await value.dispose()
      })
      .catch((e) => {
        if (live) setError(errorText(e))
      })
    return () => {
      live = false
      void current?.dispose().catch(() => {})
    }
  }, [file])
  useEffect(() => {
    if (!doc) return
    let live = true
    setPreview(undefined)
    import('../../../lib/pdf-render')
      .then((module) => module.renderBlob(doc, page, Math.min(zoom, 1.7)))
      .then((blob) => {
        if (live) setPreview(blob)
      })
      .catch((e) => {
        if (live) setError(errorText(e))
      })
    return () => {
      live = false
    }
  }, [doc, page, zoom])
  const url = useObjectUrl(preview)
  return (
    <>
      <ErrorState error={error} />
      <div className="translation-pdf-source">
        {url ? (
          <img
            src={url}
            alt={'Original PDF page ' + (page + 1)}
            style={{ width: zoom * 100 + '%', maxWidth: 'none' }}
          />
        ) : (
          !error && <p className="mini">Loading original PDF page…</p>
        )}
      </div>
    </>
  )
}

export function OriginalImage({
  file,
  blocks,
  positions,
  mode,
  selected,
  select,
  change,
}: {
  file: File
  blocks: TextBlock[]
  positions: Record<string, Box>
  mode: ImageMode
  selected?: string
  select: (id: string) => void
  change: (id: string, box: Box) => void
}) {
  const url = useObjectUrl(file)
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    id: string
    x: number
    y: number
    box: Box
    width: number
    height: number
  } | null>(null)
  if (!blocks.length) return <FilePreview file={file} label="Original image" />
  return (
    <div className="translation-image-stage" ref={stage}>
      {url && (
        <img
          src={url}
          alt="Original image with editable text positions"
          draggable={false}
        />
      )}
      {mode !== 'captions' &&
        blocks.map((block, index) => {
          const box = positions[block.id] ?? overlayBox(block.box, mode)
          return (
            <button
              type="button"
              key={block.id}
              className={
                'translation-box-marker' +
                (selected === block.id ? ' selected' : '')
              }
              aria-label={'Select and move text box ' + (index + 1)}
              aria-pressed={selected === block.id}
              style={{
                left: box.x * 100 + '%',
                top: box.y * 100 + '%',
                width: box.width * 100 + '%',
                height: box.height * 100 + '%',
              }}
              onClick={() => select(block.id)}
              onPointerDown={(event) => {
                const rect = stage.current?.getBoundingClientRect()
                if (!rect || event.button !== 0) return
                event.currentTarget.setPointerCapture(event.pointerId)
                select(block.id)
                drag.current = {
                  id: block.id,
                  x: event.clientX,
                  y: event.clientY,
                  box,
                  width: rect.width,
                  height: rect.height,
                }
              }}
              onPointerMove={(event) => {
                const value = drag.current
                if (!value || value.id !== block.id) return
                change(
                  block.id,
                  clampBox({
                    ...value.box,
                    x: value.box.x + (event.clientX - value.x) / value.width,
                    y: value.box.y + (event.clientY - value.y) / value.height,
                  }),
                )
              }}
              onPointerUp={() => {
                drag.current = null
              }}
              onPointerCancel={() => {
                drag.current = null
              }}
              onKeyDown={(event) => {
                const dx =
                  event.key === 'ArrowLeft'
                    ? -0.01
                    : event.key === 'ArrowRight'
                      ? 0.01
                      : 0
                const dy =
                  event.key === 'ArrowUp'
                    ? -0.01
                    : event.key === 'ArrowDown'
                      ? 0.01
                      : 0
                if (!dx && !dy) return
                event.preventDefault()
                change(
                  block.id,
                  clampBox({ ...box, x: box.x + dx, y: box.y + dy }),
                )
              }}
            >
              {index + 1}
            </button>
          )
        })}
    </div>
  )
}
