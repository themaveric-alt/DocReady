import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { Button, ErrorState, Modal } from '../../components/shared'
import { canvasBlob } from '../../lib/raster'

export function CardCamera({
  close,
  captured,
  browse,
}: {
  close: () => void
  captured: (file: File) => void
  browse: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [taking, setTaking] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(false)

  useEffect(() => {
    active.current = true
    let cancelled = false
    let stream: MediaStream | undefined
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw Error('Camera access is unavailable here.')
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1600 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        if (video.current) video.current.srcObject = stream
      } catch {
        if (!cancelled)
          setError(
            'Camera unavailable. Check camera permission or choose a saved image.',
          )
      }
    }
    void start()
    return () => {
      active.current = false
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])
  async function snapshot() {
    const frame = video.current
    if (!frame?.videoWidth || taking) return
    const canvas = document.createElement('canvas')
    canvas.width = frame.videoWidth
    canvas.height = frame.videoHeight
    setTaking(true)
    try {
      const context = canvas.getContext('2d')
      if (!context) throw Error('Camera capture is unavailable.')
      context.drawImage(frame, 0, 0)
      const image = await canvasBlob(canvas, 'image/jpeg', 0.97)
      if (active.current)
        captured(new File([image], 'camera-card.jpg', { type: image.type }))
    } catch {
      if (active.current)
        setError(
          'Could not capture the image. Try again or choose a saved image.',
        )
    } finally {
      canvas.width = canvas.height = 0
      if (active.current) setTaking(false)
    }
  }
  return (
    <Modal title="Capture a card photo" onClose={close}>
      <p className="muted">
        Place the entire card in view. The camera closes after capture.
      </p>
      {!error && (
        <video
          className="ecard-camera"
          ref={video}
          onCanPlay={() => setReady(true)}
          autoPlay
          playsInline
          muted
          aria-label="Live card camera preview"
        />
      )}
      <ErrorState error={error} />
      <div className="ecard-actions">
        <Button
          onClick={() => void snapshot()}
          disabled={!ready || taking || Boolean(error)}
        >
          <Camera size={17} /> Capture photo
        </Button>
        <Button variant="secondary" onClick={browse}>
          Choose an image instead
        </Button>
      </div>
    </Modal>
  )
}
