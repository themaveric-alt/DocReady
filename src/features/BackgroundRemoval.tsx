import { useEffect, useRef, useState } from 'react'
import { useJourneyOutputs } from '../components/ToolJourney'
import { VaultBridge } from '../lib/vault-bridge'
import { Download, Eraser, ShieldCheck } from 'lucide-react'
import {
  Button,
  Dropzone,
  ErrorState,
  Field,
  FileList,
  FilePreview,
  Panel,
  Progress,
  useObjectUrl,
} from '../components/shared'
import { errorText, images, saveFile, sizeLabel, stem } from '../lib/files'
import {
  runBackgroundJob,
  type BackgroundProgress,
} from '../lib/background-removal'

type Cutout = Awaited<ReturnType<typeof runBackgroundJob>>
const labels: Record<string, string> = {
  'compute:smart': 'Using the lightweight Smart Cutout fallback',
  'compute:initialize': 'Initializing the local model',
  'compute:decode': 'Decoding your image on-device',
  'compute:inference': 'Separating the subject from the background',
  'compute:mask': 'Applying the transparency mask',
  'compute:encode': 'Encoding the PNG',
}
const filename = (file: File, solid = false) =>
  stem(file.name) + (solid ? '-solid-background.png' : '-transparent.png')

export default function BackgroundRemoval() {
  const [smart, setSmart] = useState(false)
  const [file, setFile] = useState<File>()
  const [result, setResult] = useState<Cutout>()
  useJourneyOutputs(result ? 1 : 0)
  const [operation, setOperation] = useState<'remove' | 'paint'>()
  const [progress, setProgress] = useState<BackgroundProgress>()
  const [error, setError] = useState('')
  const [comparison, setComparison] = useState(48)
  const [fill, setFill] = useState<'transparent' | 'solid'>('transparent')
  const [color, setColor] = useState('#ffffff')
  const job = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => job.current?.abort(), [])
  const before = useObjectUrl(result ? file : undefined),
    after = useObjectUrl(result?.image)

  function select(f?: File) {
    setResult(undefined)
    setProgress(undefined)
    setComparison(48)
    setError('')
    if (f && f.size > 20 * 1024 * 1024) {
      setFile(undefined)
      setError('Choose an image no larger than 20 MB.')
    } else setFile(f)
  }

  async function process(type: 'remove' | 'paint', vault = false) {
    if (!file || job.current || (type === 'paint' && !result)) return
    const controller = new AbortController()
    job.current = controller
    setError('')
    setProgress(undefined)
    setOperation(type)
    if (type === 'remove') setResult(undefined)
    try {
      if (type === 'remove') {
        const cutout = await runBackgroundJob(
          { type, image: file, smart },
          controller.signal,
          setProgress,
        )
        if (!controller.signal.aborted) setResult(cutout)
      } else {
        const painted = await runBackgroundJob(
          { type, image: result!.image, color },
          controller.signal,
        )
        if (!controller.signal.aborted) {
          if (vault) VaultBridge.saveFile(painted.image, filename(file, true), 'Personal')
          else saveFile({ name: filename(file, true), blob: painted.image })
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(errorText(e))
    } finally {
      if (job.current === controller) {
        job.current = undefined
        setOperation(undefined)
      }
    }
  }
  function cancel() {
    job.current?.abort()
    job.current = undefined
    setOperation(undefined)
    setProgress(undefined)
  }
  const download = progress?.key.startsWith('fetch:')
  const stage =
    operation === 'paint'
      ? 'Rendering the solid background'
      : download && progress
        ? `Loading ${progress.key.slice(6)} · ${sizeLabel(progress.current)} of ${sizeLabel(progress.total)}`
        : labels[progress?.key || ''] || 'Opening the background removal worker'
  const percent =
    progress && progress.key !== 'compute:initialize'
      ? Math.min(100, (progress.current / progress.total) * 100)
      : undefined

  return (
    <>
      <div className="tool-layout">
        <Panel title="Source image">
          <fieldset disabled={Boolean(operation)}>
            <Dropzone
              accept={[...images]}
              label="Choose an image"
              description="JPEG, PNG, or WebP · Up to 20 MB and 8 megapixels"
              onFiles={([f]) => select(f)}
            />
            <FileList
              files={file ? [file] : []}
              onChange={([f]) => select(f)}
            />
          </fieldset>
          {file && !result && (
            <FilePreview file={file} label="Original image" />
          )}
        </Panel>
        <Panel title="Background removal" className="tool-controls">
          <Field label="Processing method"><select value={smart ? 'smart' : 'ai'} disabled={Boolean(operation)} onChange={e => setSmart(e.target.value === 'smart')}><option value="ai">Local AI with automatic fallback</option><option value="smart">Smart Cutout · simple backgrounds · no model</option></select></Field>
          <p className="notice">
            <ShieldCheck size={17} aria-hidden /> Your image stays on this
            device. The first run downloads a model and runtime from
            DocReadyApp, about 19 MB in total (a 4.6 MB model plus the runtime). Your browser can cache these
            assets for offline use.
          </p>
          <div className="action-row">
            <Button
              disabled={!file || Boolean(operation)}
              onClick={() => void process('remove')}
            >
              <Eraser size={17} /> Remove background
            </Button>
            {operation && (
              <Button variant="secondary" onClick={cancel}>
                Cancel
              </Button>
            )}
          </div>
          <Progress
            pending={Boolean(operation)}
            progress={percent}
            label={stage}
          />
          <ErrorState error={error} />
          <p className="mini">
            <a href="/licenses/background-source.zip" download>
              Background removal source and license
            </a>
          </p>
        </Panel>
      </div>
      {result && before && after && (
        <Panel title="Before and after">
          {result.notice && <p className="notice" role="status">{result.notice}</p>}
          <div className="background-result">
            <div
              className="background-stage checker"
              style={{
                aspectRatio: `${result.width} / ${result.height}`,
                maxWidth: `${Math.min(850, (520 * result.width) / result.height)}px`,
              }}
            >
              <div
                className="background-after"
                style={
                  fill === 'solid' ? { backgroundColor: color } : undefined
                }
              >
                <img src={after} alt="Background removed" draggable={false} />
              </div>
              <img
                className="background-before"
                src={before}
                alt="Original before background removal"
                draggable={false}
                style={{ clipPath: `inset(0 ${100 - comparison}% 0 0)` }}
              />
              <span
                className="background-boundary"
                aria-hidden
                style={{ left: `${comparison}%` }}
              />
              <span
                className="background-label background-label-before"
                aria-hidden
              >
                Before
              </span>
              <span
                className="background-label background-label-after"
                aria-hidden
              >
                After
              </span>
            </div>
            <Field label="Compare the original and result">
              <input
                type="range"
                min={0}
                max={100}
                value={comparison}
                onChange={(e) => setComparison(e.target.valueAsNumber)}
              />
            </Field>
          </div>
          <div className="action-row">
            <Field label="Background">
              <select
                value={fill}
                onChange={(e) => setFill(e.target.value as typeof fill)}
              >
                <option value="transparent">Transparent</option>
                <option value="solid">Solid color</option>
              </select>
            </Field>
            {fill === 'solid' && (
              <Field label="Solid background color">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </Field>
            )}
          </div>
          <div className="action-row">
            <Button
              disabled={Boolean(operation)}
              onClick={() => {
                if (!file) return
                if (fill === 'solid') void process('paint')
                else saveFile({ name: filename(file), blob: result.image })
              }}
            >
              <Download size={17} />{' '}
              {fill === 'solid'
                ? 'Download solid background PNG'
                : 'Download transparent PNG'}
            </Button>
            <Button variant="secondary" disabled={Boolean(operation)} onClick={() => {
              if (!file) return
              if (fill === 'solid') void process('paint', true)
              else VaultBridge.saveFile(result.image, filename(file), 'Personal')
            }}>Save to Encrypted Vault</Button>
          </div>
        </Panel>
      )}
    </>
  )
}
