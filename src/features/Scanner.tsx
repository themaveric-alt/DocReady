import { useEffect, useRef, useState } from 'react'
import { Camera, Zap } from 'lucide-react'
import {
  Button,
  Dropzone,
  ErrorState,
  Field,
  FileList,
  FilePreview,
  Panel,
  Progress,
  Results,
  useObjectUrl,
  useOperation,
} from '../components/shared'
import { pageCountLabel, errorText, images, validateFiles, type Output } from '../lib/files'
import type { Point } from '../lib/perspective'
import { fullScanFrame } from '../lib/scan-geometry'
import { ScanWorker } from '../lib/scan-client'
import type { ScanEdit, ScanFilter } from '../lib/scan-image'
import { canvasBlob } from '../lib/raster'
import { usePrefs } from '../lib/prefs'
import ScanCornerEditor from './ScanCornerEditor'

type ScanPage = {
  edit: ScanEdit
  detection: 'pending' | 'detected' | 'manual' | 'adjusted' | 'error'
  error?: string
}
const initialPage = (): ScanPage => ({
  edit: { corners: fullScanFrame, filter: 'magic', rotation: 0 },
  detection: 'pending',
})
const filters = [
  {
    id: 'magic',
    name: 'Magic Color',
    detail: 'Even lighting, preserved ink color.',
  },
  { id: 'bw', name: 'B&W Document', detail: 'Crisp black text on white.' },
  { id: 'original', name: 'Original', detail: 'Straightens and crops only.' },
] as const

function activeWorker(ref: { current: ScanWorker | null }) {
  if (!ref.current || ref.current.closed) ref.current = new ScanWorker()
  return ref.current
}

export default function Scanner() {
  const [files, setFiles] = useState<File[]>([])
  const [pages, setPages] = useState(new Map<File, ScanPage>())
  const [index, setIndex] = useState(0)
  const [format, setFormat] = useState('pdf')
  const [stream, setStream] = useState<MediaStream>()
  const [cameraError, setCameraError] = useState('')
  const [cameraBusy, setCameraBusy] = useState(false)
  const [torch, setTorch] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const nativeCamera = useRef<HTMLInputElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const worker = useRef<ScanWorker | null>(null)
  const alive = useRef(true)
  const op = useOperation()
  const paper = usePrefs((s) => s.prefs.paper)
  const file = files[index]
  const page = pages.get(file)
  const url = useObjectUrl(file)
  const result = op.items.find((x) => x.name === 'scan-preview.png')
  const candidate = files.find((f) => pages.get(f)?.detection === 'pending')
  const pendingCount = files.filter(
    (f) => pages.get(f)?.detection === 'pending',
  ).length
  const failed = files.find((f) => pages.get(f)?.detection === 'error')
  const manualCount = files.filter(
    (f) => pages.get(f)?.detection === 'manual',
  ).length

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      worker.current?.close()
    }
  }, [])

  useEffect(() => {
    if (stream && video.current) video.current.srcObject = stream
    const track = stream?.getVideoTracks()[0]
    setTorchSupported(Boolean((track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean })?.torch))
    setTorch(false)
    return () => {
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [stream])

  useEffect(() => {
    if (!candidate) return
    const photo = candidate
    let active = true

    function finish(change: (current: ScanPage) => ScanPage) {
      if (!active) return
      setPages((previous) => {
        const current = previous.get(photo)
        if (!current || current.detection !== 'pending') return previous
        return new Map(previous).set(photo, change(current))
      })
    }

    async function detect() {
      try {
        const { corners } = await activeWorker(worker).detect(photo)
        finish((current) =>
          corners
            ? { detection: 'detected', edit: { ...current.edit, corners } }
            : {
                detection: 'manual',
                edit: { ...current.edit, corners: fullScanFrame },
              },
        )
      } catch (error) {
        finish((current) => ({
          ...current,
          detection: 'error',
          error: errorText(error),
        }))
      }
    }

    void detect()
    return () => {
      active = false
    }
  }, [candidate])

  function list(next: File[]) {
    if (
      next.length > 20 ||
      next.reduce((bytes, f) => bytes + f.size, 0) > 180 * 1024 * 1024
    ) {
      setCameraError('Keep the batch at 20 pages and below 180 MB.')
      return false
    }
    setCameraError('')
    op.reset()
    setFiles(next)
    const previous = next.indexOf(file)
    setIndex(
      previous >= 0 ? previous : Math.max(0, Math.min(index, next.length - 1)),
    )
    setPages(
      (old) => new Map(next.map((f) => [f, old.get(f) ?? initialPage()])),
    )
    return true
  }

  function update(change: (current: ScanPage) => ScanPage) {
    if (!file) return
    op.reset()
    setPages((old) => {
      const current = old.get(file)
      if (!current) return old
      return new Map(old).set(file, change(current))
    })
  }

  function setCorner(i: number, point: Point) {
    update((current) => {
      const corners = [...current.edit.corners] as ScanEdit['corners']
      corners[i] = point
      return { detection: 'adjusted', edit: { ...current.edit, corners } }
    })
  }

  async function openCamera() {
    setCameraError('')
    setCameraBusy(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error(
          'Camera access requires HTTPS or localhost and a compatible browser.',
        )
      const feed = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      if (alive.current) setStream(feed)
      else feed.getTracks().forEach((track) => track.stop())
    } catch (error) {
      if (alive.current)
        setCameraError(
          'Camera unavailable. ' +
            errorText(error) +
            ' You can upload a photo instead.',
        )
    } finally {
      if (alive.current) setCameraBusy(false)
    }
  }

  async function capture() {
    setCameraBusy(true)
    try {
      const source = video.current
      if (!source?.videoWidth)
        throw Error('Wait for the camera preview to start.')
      const canvas = document.createElement('canvas')
      canvas.width = source.videoWidth
      canvas.height = source.videoHeight
      try {
        const ctx = canvas.getContext('2d')
        if (!ctx) throw Error('Camera capture is unavailable.')
        ctx.drawImage(source, 0, 0)
        const blob = await canvasBlob(canvas, 'image/jpeg', 0.96)
        if (
          alive.current &&
          list([
            ...files,
            new File([blob], `capture-${Date.now()}.jpg`, { type: blob.type }),
          ])
        ) {
          setIndex(files.length)
          setStream(undefined)
        }
      } finally {
        canvas.width = canvas.height = 1
      }
    } catch (error) {
      if (alive.current) setCameraError(errorText(error))
    } finally {
      if (alive.current) setCameraBusy(false)
    }
  }

  async function toggleTorch() {
    try {
      const track = stream?.getVideoTracks()[0]
      if (!track) return
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      setTorch(value => !value)
    } catch { setCameraError('This camera could not change its flash setting.') }
  }

  async function previewScan(): Promise<Output[]> {
    if (!page || !file) return []
    const scan = await activeWorker(worker).render({
      type: 'render',
      file,
      edit: page.edit,
      preview: true,
      mime: 'image/png',
    })
    return [
      {
        name: 'scan-preview.png',
        blob: scan.blob,
        detail: scan.width + ' × ' + scan.height + ' px',
      },
    ]
  }

  async function exportScan(report: (n: number) => void): Promise<Output[]> {
    const items: Output[] = []
    for (const [i, photo] of files.entries()) {
      try {
        const edit = pages.get(photo)!.edit
        const mime =
          format === 'png' || (format === 'pdf' && edit.filter === 'bw')
            ? 'image/png'
            : 'image/jpeg'
        const result = await activeWorker(worker).render({
          type: 'render',
          file: photo,
          edit,
          preview: false,
          mime,
        })
        items.push({
          name: 'scan-' + (i + 1) + (mime === 'image/png' ? '.png' : '.jpg'),
          blob: result.blob,
          vaultFolder: 'Scanned Docs',
          detail: result.width + ' × ' + result.height + ' px',
        })
        report(((i + 1) / files.length) * (format === 'pdf' ? 90 : 100))
      } catch (error) {
        throw Error('Page ' + (i + 1) + ' · ' + errorText(error))
      }
    }
    if (format !== 'pdf') return items
    return [
      {
        name: 'document-scan.pdf',
        vaultFolder: 'Scanned Docs',
        blob: await activeWorker(worker).pdf(
          items.map(({ blob }) => blob),
          paper,
        ),
        detail: pageCountLabel(items.length),
      },
    ]
  }

  const cropReady =
    page && page.detection !== 'pending' && page.detection !== 'error'
  return (
    <>
      <div className="tool-layout">
        <Panel title="Document photos">
          <fieldset disabled={op.pending || cameraBusy}>
            {!stream && <Button className="camera-entry" disabled={files.length >= 20} onClick={() => void openCamera()}><Camera size={32} /><strong>{cameraBusy ? 'Opening camera…' : 'Open Camera / Scan Document'}</strong><span>Point, capture, straighten. Everything stays on your device.</span></Button>}
            {cameraError && !stream && <Button variant="secondary" onClick={() => nativeCamera.current?.click()}>Use device camera instead</Button>}
            {stream && <div className="action-row"><Button onClick={() => void capture()}>Capture photo</Button>{torchSupported && <Button variant="secondary" aria-pressed={torch} onClick={() => void toggleTorch()}><Zap size={16} />{torch ? 'Flash off' : 'Flash on'}</Button>}<Button variant="quiet" onClick={() => setStream(undefined)}>Close camera</Button></div>}
            <Dropzone
              compact
              label="Import from Gallery / Files"
              accept={[...images]}
              multiple
              onFiles={(all) => list([...files, ...all])}
            />
            <FileList files={files} ordered onChange={list} />
            <input ref={nativeCamera} hidden type="file" accept="image/*" capture="environment" aria-label="Capture with device camera" onChange={event => {
              const photo = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (photo) void validateFiles([photo], [...images]).then(() => list([...files, photo])).catch(error => setCameraError(errorText(error)))
            }} />
          </fieldset>
          {stream && (<div className="camera-viewfinder">
            <video
              ref={video}
              muted
              autoPlay
              playsInline
              className="scan-camera"
            />
            <div className="camera-alignment" aria-hidden="true" /><span>Keep the document inside the frame</span></div>)}
          <ErrorState error={cameraError} />
          <p className="mini">
            Scan up to 20 pages. Drag or use the move buttons to change the
            export order.
          </p>
        </Panel>
        <Panel title="Scan settings" className="tool-controls">
          <fieldset disabled={op.pending} className="form-grid">
            {page && (
              <>
                <Field label="Page to adjust">
                  <select
                    value={index}
                    onChange={(e) => {
                      op.reset()
                      setIndex(+e.target.value)
                    }}
                  >
                    {files.map((photo, i) => (
                      <option key={i} value={i}>
                        Page {i + 1} · {photo.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Rotate scan">
                  <select
                    value={page.edit.rotation}
                    onChange={(e) => {
                      const rotation = +e.target.value as ScanEdit['rotation']
                      update((current) => ({
                        ...current,
                        edit: { ...current.edit, rotation },
                      }))
                    }}
                  >
                    {[0, 90, 180, 270].map((n) => (
                      <option key={n} value={n}>
                        {n}°
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Scan filter">
                  <select
                    value={page.edit.filter}
                    onChange={(e) => {
                      const filter = e.target.value as ScanFilter
                      update((current) => ({
                        ...current,
                        edit: { ...current.edit, filter },
                      }))
                    }}
                  >
                    {filters.map(({ id, name }) => (
                      <option value={id} key={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="mini scan-filter-note">
                  {filters.find(({ id }) => id === page.edit.filter)?.detail}
                </p>
              </>
            )}
            <Field label="Export format">
              <select
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value)
                  op.reset()
                }}
              >
                <option value="pdf">Multi-page PDF</option>
                <option value="png">PNG images</option>
                <option value="images">JPEG images</option>
              </select>
            </Field>
          </fieldset>
          <div className="action-row">
            <Button
              variant="secondary"
              disabled={!cropReady || op.pending}
              onClick={() => void op.run(previewScan)}
            >
              Preview page
            </Button>
            <Button
              disabled={!files.length || !!candidate || !!failed || op.pending}
              onClick={() => void op.run(exportScan)}
            >
              Generate scan
            </Button>
          </div>
          {candidate && (
            <p className="mini" role="status">
              Finding page edges · {pendingCount} left
            </p>
          )}
          {failed && (
            <ErrorState
              error={
                'Could not prepare ' +
                failed.name +
                '. Select that page to retry or remove it.'
              }
            />
          )}
          {!!manualCount && (
            <p className="mini" role="status">
              {pageCountLabel(manualCount)} set to the full photo. Review the
              crop before exporting.
            </p>
          )}
          <Progress pending={op.pending} progress={op.progress} />
          <ErrorState error={op.error} />
        </Panel>
        {url && page && (
          <Panel title="Adjust the four corners">
            <p className="mini scan-crop-status" role="status">
              {page.detection === 'detected' &&
                'Page edges detected. Check that all content fits inside the crop.'}
              {page.detection === 'manual' &&
                'Full photo selected. Drag the handles or use arrow keys to fine-tune the crop.'}
              {page.detection === 'adjusted' &&
                'Manual crop. Preview the page to check the result.'}
              {page.detection === 'pending' &&
                'Checking this photo for document corners…'}
            </p>
            {page.error && <ErrorState error={page.error} />}
            <ScanCornerEditor
              key={url}
              url={url}
              corners={page.edit.corners}
              disabled={!cropReady || op.pending}
              onCorner={setCorner}
            />
            <div className="action-row">
              <Button
                variant="secondary"
                disabled={page.detection === 'pending' || op.pending}
                onClick={() =>
                  update((current) => ({
                    ...current,
                    detection: 'pending',
                    error: undefined,
                  }))
                }
              >
                Redetect edges
              </Button>
              <Button
                variant="quiet"
                disabled={!cropReady || op.pending}
                onClick={() =>
                  update((current) => ({
                    detection: 'manual',
                    edit: { ...current.edit, corners: fullScanFrame },
                  }))
                }
              >
                Reset to full photo
              </Button>
            </div>
          </Panel>
        )}
        {cropReady && (
          <Panel title="Straightened preview" className="scan-preview">
            {result ? (
              <>
                <FilePreview file={result.blob} label="Straightened page" />
                <p className="mini">
                  Downloads render at up to 4,000 pixels per side.
                </p>
              </>
            ) : (
              <div className="preview-empty">
                Choose Preview page to check the crop and filter.
              </div>
            )}
          </Panel>
        )}
      </div>
      <Results items={op.items.filter((item) => item !== result)} />
    </>
  )
}
