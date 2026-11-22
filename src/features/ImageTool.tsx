import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import {
  Button,
  Check,
  Dropzone,
  ErrorState,
  Field,
  FileList,
  FilePreview,
  Panel,
  Progress,
  Results,
  useOperation,
} from '../components/shared'
import {
  extension,
  fileKind,
  images,
  sizeLabel,
  stem,
  zipFiles,
  errorText,
  type ImageMime,
  type Output,
} from '../lib/files'
import { usePrefs } from '../lib/prefs'
import {
  fullCrop,
  imageSize,
  resizeAspect,
  type RasterOptions,
} from '../lib/raster'
import { runRaster } from '../lib/process-image'
import { inspectImage } from '../lib/image-meta'
const CropEditor = lazy(() => import('../components/CropEditor'))
export function ImageFormats({
  format,
  onChange,
  signature = false,
}: {
  format: ImageMime
  onChange: (m: ImageMime) => void
  signature?: boolean
}) {
  return (
    <Field label="Output format">
      <select
        value={format}
        onChange={(e) => onChange(e.target.value as ImageMime)}
      >
        <option value="image/jpeg">JPEG</option>
        <option value="image/png">PNG</option>
        {!signature && <option value="image/webp">WebP</option>}
      </select>
    </Field>
  )
}
export default function ImageTool({
  id,
  initial,
}: {
  id: string
  initial?: File
}) {
  const pref = usePrefs((s) => s.prefs),
    [files, setFiles] = useState<File[]>(initial ? [initial] : []),
    [info, setInfo] = useState<{ width: number; height: number }>(),
    [meta, setMeta] = useState<string[]>([]),
    [loadErr, setLoadErr] = useState('')
  const signature = id === 'prepare-signature',
    cropMode = signature || id === 'crop-image',
    batch = id === 'batch-image',
    infoMode = id === 'image-info',
    strip = id === 'strip-metadata',
    compress = id === 'compress-image',
    multi = batch || compress
  const resize = id === 'resize-image' || signature || batch
  const [format, setFormat] = useState<ImageMime>(
      signature ? 'image/png' : pref.format,
    ),
    [quality, setQuality] = useState(pref.quality),
    [target, setTarget] = useState(''),
    [targetUnit, setTargetUnit] = useState<'KB' | 'MB' | 'GB'>('KB'),
    [compressionMode, setCompressionMode] = useState<'preset' | 'target'>(
      'preset',
    ),
    [compressionPreset, setCompressionPreset] = useState<
      'extreme' | 'recommended' | 'light'
    >('recommended'),
    [min, setMin] = useState(''),
    [expected, setExpected] = useState(''),
    [locked, setLocked] = useState(!signature),
    [width, setWidth] = useState(''),
    [height, setHeight] = useState(''),
    [percent, setPercent] = useState(100),
    [resizeMode, setResizeMode] = useState('pixels'),
    [preset, setPreset] = useState('custom')
  const [crop, setCrop] = useState(fullCrop),
    [ratio, setRatio] = useState('0'),
    [customRatio, setCustomRatio] = useState(1),
    [rot, setRot] = useState(0),
    [fh, setFh] = useState(false),
    [fv, setFv] = useState(false),
    [bright, setBright] = useState(100),
    [contrast, setContrast] = useState(100),
    [sat, setSat] = useState(100),
    [gray, setGray] = useState(signature),
    [threshold, setThreshold] = useState(signature ? 160 : 0),
    [background, setBackground] = useState(signature ? 'white' : 'keep'),
    [sharp, setSharp] = useState(false),
    [summary, setSummary] = useState('')
  const [livePreview, setLivePreview] = useState<Blob>()
  const op = useOperation(),
    file = files[0],
    activeRatio = ratio === 'custom' ? customRatio : +ratio
  const targetMultiplier =
    targetUnit === 'GB' ? 1024 ** 3 : targetUnit === 'MB' ? 1024 ** 2 : 1024
  const exactTarget =
    compress && compressionMode === 'target' && target.trim()
      ? Number(target) * targetMultiplier
      : undefined
  const presetQuality =
    compressionPreset === 'extreme'
      ? 0.34
      : compressionPreset === 'light'
        ? 0.86
        : 0.65
  const waitingForDimensions = !!file && !batch && !info
  useEffect(() => {
    let live = true
    setInfo(undefined)
    setLoadErr('')
    setMeta([])
    setWidth('')
    setHeight('')
    if (!file) return
    Promise.all([
      imageSize(file),
      infoMode ? inspectImage(file) : Promise.resolve([]),
    ])
      .then(([size, tags]) => {
        if (live) {
          setInfo(size)
          if (!batch) {
            setWidth(String(size.width))
            setHeight(String(size.height))
          }
          setMeta(tags)
        }
      })
      .catch((e) => {
        if (live) setLoadErr(errorText(e))
      })
    return () => {
      live = false
    }
  }, [file, infoMode, batch])
  useEffect(() => {
    if (info && signature) {
      const w = Math.max(1, Math.round(info.width * crop.width)),
        h = Math.max(1, Math.round(info.height * crop.height))
      setWidth(String(rot % 180 ? h : w))
      setHeight(String(rot % 180 ? w : h))
    }
  }, [crop, info, rot, signature])
  useEffect(() => {
    let current = true
    if (!signature || !file || !info) {
      setLivePreview(undefined)
      return
    }
    const w = +width || info.width,
      h = +height || info.height
    const cap = Math.min(1, 520 / Math.max(w, h))
    const delay = window.setTimeout(() => {
      void runRaster(file, {
        width: Math.max(1, Math.round(w * cap)),
        height: Math.max(1, Math.round(h * cap)),
        format: background === 'transparent' ? 'image/png' : format,
        quality: 0.8,
        crop,
        rotation: rot,
        flipH: fh,
        flipV: fv,
        brightness: bright,
        contrast,
        saturation: sat,
        grayscale: gray,
        threshold,
        transparent: background === 'transparent',
        white: background === 'white',
        sharp,
      })
        .then((result) => {
          if (current) setLivePreview(result.blob)
        })
        .catch(() => {
          if (current) setLivePreview(undefined)
        })
    }, 260)
    return () => {
      current = false
      window.clearTimeout(delay)
    }
  }, [
    signature,
    file,
    info,
    width,
    height,
    format,
    crop,
    rot,
    fh,
    fv,
    bright,
    contrast,
    sat,
    gray,
    threshold,
    background,
    sharp,
  ])
  function invalidate() {
    op.reset()
    setSummary('')
  }
  function dimension(axis: 'width' | 'height', value: string) {
    if (axis === 'width') setWidth(value)
    else setHeight(value)
    if (!locked || !info || !+value || batch) return
    const base = signature
      ? {
          width:
            rot % 180 ? info.height * crop.height : info.width * crop.width,
          height:
            rot % 180 ? info.width * crop.width : info.height * crop.height,
        }
      : info
    const d = resizeAspect(axis, +value, base)
    if (axis === 'width') setHeight(String(d.height))
    else setWidth(String(d.width))
  }
  function reset() {
    setCrop(fullCrop)
    setRatio('0')
    setRot(0)
    setFh(false)
    setFv(false)
    setBright(100)
    setContrast(100)
    setSat(100)
    setGray(signature)
    setThreshold(signature ? 160 : 0)
    setBackground(signature ? 'white' : 'keep')
    setSharp(false)
  }
  function changeCropRatio(value: string, r = customRatio) {
    setRatio(value)
    const target = value === 'custom' ? r : +value
    if (info && target > 0) {
      const w = Math.min(1, (target * info.height) / info.width),
        h = Math.min(1, info.width / (target * info.height))
      setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h })
    }
  }
  async function process(report: (p: number) => void, signal: AbortSignal) {
    setSummary('')
    if (
      ((signature || (!compress && batch)) &&
        target &&
        (!Number.isFinite(+target) || +target <= 0)) ||
      (compress &&
        compressionMode === 'target' &&
        (!Number.isFinite(exactTarget) || !exactTarget || exactTarget <= 0)) ||
      (min && (!Number.isFinite(+min) || +min <= 0)) ||
      (target && min && +min > +target)
    )
      throw Error('Enter a valid positive file size range.')
    if (expected && (!Number.isFinite(+expected) || +expected <= 0))
      throw Error('Enter a positive aspect ratio.')
    const result: Output[] = []
    for (const [i, file] of files.entries()) {
      signal.throwIfAborted()
      const source = await imageSize(file)
      let mime = strip ? ((await fileKind(file)) as ImageMime) : format
      const convertedPngForTarget =
        compress &&
        compressionMode === 'target' &&
        Boolean(exactTarget) &&
        mime === 'image/png'
      if (convertedPngForTarget) mime = 'image/webp'
      if (exactTarget && file.size <= exactTarget) {
        result.push({
          name: file.name,
          blob: file,
          detail: `Already smaller than ${sizeLabel(exactTarget)} · original kept`,
        })
        if (!batch)
          setSummary(
            `Original ${sizeLabel(file.size)} · File is already smaller than target ${sizeLabel(exactTarget)} · original kept`,
          )
        report(((i + 1) / files.length) * 90)
        continue
      }
      const doResize = resize
      let w = doResize && width !== '' ? Number(width) : undefined,
        h = doResize && height !== '' ? Number(height) : undefined
      if (doResize && resizeMode === 'percent') {
        w = Math.max(1, Math.round((source.width * percent) / 100))
        h = Math.max(1, Math.round((source.height * percent) / 100))
      }
      if (batch && locked && (w || h)) {
        const d = w
          ? resizeAspect('width', w, source)
          : resizeAspect('height', h!, source)
        w = d.width
        h = d.height
      }
      if (batch && w && !h) h = source.height
      if (batch && h && !w) w = source.width
      const options: RasterOptions = {
        width: w,
        height: h,
        format: mime,
        quality: compress ? (compressionMode === 'target' ? 0.98 : presetQuality) : quality,
        target: compress ? exactTarget : (target ? +target * 1024 : undefined),
      }
      if (cropMode)
        Object.assign(options, {
          crop,
          rotation: rot,
          flipH: fh,
          flipV: fv,
          brightness: bright,
          contrast,
          saturation: sat,
          grayscale: gray,
          threshold,
          transparent: background === 'transparent',
          white: background === 'white',
          sharp,
        })
      const img = await runRaster(file, options, signal)
      const errors = [
        !img.met ? 'Target not reached before safe downscale limit' : '',
        min && img.blob.size < +min * 1024 ? 'Below minimum size' : '',
        expected && Math.abs(img.width / img.height - +expected) > 0.01
          ? 'Aspect ratio outside ±0.01'
          : '',
      ].filter(Boolean)
      result.push({
        name:
          stem(file.name) +
          '-' +
          (signature
            ? 'signature'
            : strip
              ? 'clean'
              : id.replace('-image', '')) +
          '.' +
          extension(img.blob.type),
        blob: img.blob,
        detail: `${img.width} × ${img.height} px · ${sizeLabel(file.size)} → ${sizeLabel(img.blob.size)}${file.size > img.blob.size ? ` · ${((1 - img.blob.size / file.size) * 100).toFixed(1)}% saved` : ''}${convertedPngForTarget ? ' · PNG converted to lossy WebP for target size' : ''}${errors.length ? ' · ' + errors.join(' · ') : signature ? ' · Meets configured requirements' : ''}`,
      })
      if (!batch)
        setSummary(
          `Original ${sizeLabel(file.size)} · Result ${sizeLabel(img.blob.size)}${file.size > img.blob.size ? ` · ${((1 - img.blob.size / file.size) * 100).toFixed(1)}% saved` : ''}${convertedPngForTarget ? ' · PNG converted to WebP for lossy target compression' : ''}${errors.length ? ' · ' + errors.join(' · ') : ''}`,
        )
      report(((i + 1) / files.length) * 90)
    }
    return multi && result.length > 1
      ? [...result, await zipFiles(result, 'processed-images.zip')]
      : result
  }
  return (
    <>
      <div className="tool-layout">
        <Panel title={signature ? 'Signature photo' : 'Source images'}>
          <fieldset disabled={op.pending}>
            <Dropzone
              accept={[...images]}
              multiple={multi}
              onFiles={(next) => {
                op.reset()
                setSummary('')
                reset()
                setFiles(multi ? next : [next[0]])
              }}
            />
            <FileList
              files={files}
              onChange={(newFiles) => {
                op.reset()
                setSummary('')
                setFiles(newFiles)
              }}
            />
          </fieldset>
          {info && (
            <p className="mini">
              Original dimensions {info.width} × {info.height} px
            </p>
          )}
          <ErrorState error={loadErr} />
        </Panel>
        {infoMode ? (
          <Panel title="Image information">
            {info && file ? (
              <>
                <p>
                  {info.width} × {info.height} px · {sizeLabel(file.size)}
                </p>
                <p>
                  {meta.length
                    ? 'Metadata markers: ' + meta.join(', ')
                    : 'No common metadata markers found in the first 4 MB.'}
                </p>
              </>
            ) : (
              <p className="mini">
                Choose an image to view its dimensions and metadata markers.
              </p>
            )}
          </Panel>
        ) : (
          <Panel title="Output settings" className="tool-controls">
            <fieldset
              disabled={op.pending}
              className="form-grid"
              onChangeCapture={invalidate}
            >
              {!strip && (
                <ImageFormats
                  format={format}
                  signature={signature}
                  onChange={(next) => {
                    setFormat(next)
                    if (next === 'image/jpeg' && background === 'transparent')
                      setBackground('white')
                  }}
                />
              )}
              {strip && (
                <p className="mini full">
                  The image is decoded and re-encoded in the same format without
                  copying its original embedded metadata.
                </p>
              )}
              {resize && !signature && (
                <Field label="Resize mode">
                  <select
                    value={resizeMode}
                    onChange={(e) => setResizeMode(e.target.value)}
                  >
                    <option value="pixels">Pixels</option>
                    <option value="percent">Percentage</option>
                  </select>
                </Field>
              )}
              {resize && resizeMode === 'pixels' && (
                <>
                  <Field label="Width (px)">
                    <input
                      type="number"
                      min={1}
                      disabled={waitingForDimensions}
                      value={width}
                      placeholder={batch ? 'Keep original' : 'Width'}
                      onChange={(e) => dimension('width', e.target.value)}
                    />
                  </Field>
                  <Field label="Height (px)">
                    <input
                      type="number"
                      min={1}
                      disabled={waitingForDimensions}
                      value={height}
                      placeholder={batch ? 'Keep original' : 'Height'}
                      onChange={(e) => dimension('height', e.target.value)}
                    />
                  </Field>
                  <Check
                    label="Lock aspect ratio"
                    checked={locked}
                    onChange={setLocked}
                  />
                </>
              )}
              {resize && resizeMode === 'percent' && (
                <Field label={'Resize to ' + percent + '%'}>
                  <input
                    type="range"
                    min={5}
                    max={200}
                    value={percent}
                    onChange={(e) => setPercent(+e.target.value)}
                  />
                </Field>
              )}
              {id === 'resize-image' && resizeMode === 'pixels' && (
                <Field label="Size preset">
                  <select
                    disabled={waitingForDimensions}
                    value={preset}
                    onChange={(e) => {
                      const v = e.target.value
                      setPreset(v)
                      if (v !== 'custom') {
                        const [a, b] = v.split('x')
                        setWidth(a)
                        setHeight(b)
                        setLocked(false)
                      }
                    }}
                  >
                    <option value="custom">Custom</option>
                    <option value="600x600">Square · 600 × 600</option>
                    <option value="413x531">Portrait · 413 × 531</option>
                    <option value="1200x630">Landscape · 1200 × 630</option>
                  </select>
                </Field>
              )}
              {!strip && format !== 'image/png' && !compress && (
                <Field label={'Quality ' + Math.round(quality * 100) + '%'}>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.01}
                    value={quality}
                    onChange={(e) => setQuality(+e.target.value)}
                  />
                </Field>
              )}
              {compress && (
                <>
                  <Field label="Compression mode">
                    <select
                      value={compressionMode}
                      onChange={(e) => setCompressionMode(e.target.value as 'preset' | 'target')}
                    >
                      <option value="preset">Preset mode</option>
                      <option value="target">Exact target size</option>
                    </select>
                  </Field>
                  {compressionMode === 'preset' ? (
                    <Field label="Compression preset">
                      <select
                        value={compressionPreset}
                        onChange={(e) => setCompressionPreset(e.target.value as typeof compressionPreset)}
                      >
                        <option value="extreme">Extreme · smallest practical file</option>
                        <option value="recommended">Recommended · balanced</option>
                        <option value="light">Light · preserve more detail</option>
                      </select>
                    </Field>
                  ) : (
                    <>
                      <Field label="Target size">
                        <input
                          type="number"
                          min={0.001}
                          step="any"
                          value={target}
                          placeholder="e.g. 50 or 1.5"
                          onChange={(e) => setTarget(e.target.value)}
                        />
                      </Field>
                      <Field label="Target unit">
                        <select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value as typeof targetUnit)}>
                          <option value="KB">KB</option>
                          <option value="MB">MB</option>
                          <option value="GB">GB</option>
                        </select>
                      </Field>
                      <div className="action-row full" aria-label="Common target sizes">
                        {[
                          ['20', 'KB'],
                          ['50', 'KB'],
                          ['100', 'KB'],
                          ['200', 'KB'],
                          ['1', 'MB'],
                        ].map(([value, unit]) => (
                          <Button key={value + unit} variant="quiet" onClick={() => { setTarget(value); setTargetUnit(unit as typeof targetUnit) }}>
                            {value} {unit}
                          </Button>
                        ))}
                      </div>
                      <p className="notice full">The local encoder searches quality from 5% to 98%, then progressively downscales only when needed. PNG target compression switches to WebP so the file can be lossy; that conversion is reported with the result.</p>
                    </>
                  )}
                </>
              )}
              {(signature || (!compress && batch)) && (
                <Field label="Maximum size (KB)">
                  <input
                    type="number"
                    min={0.1}
                    step=".1"
                    placeholder="Optional"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  />
                </Field>
              )}
              {signature && (
                <>
                  <Field label="Minimum size (KB)">
                    <input
                      type="number"
                      min={0.1}
                      step=".1"
                      placeholder="Optional"
                      value={min}
                      onChange={(e) => setMin(e.target.value)}
                    />
                  </Field>
                  <Field label="Required aspect ratio">
                    <input
                      type="number"
                      min={0.01}
                      step=".01"
                      placeholder="Width divided by height"
                      value={expected}
                      onChange={(e) => setExpected(e.target.value)}
                    />
                  </Field>
                </>
              )}
            </fieldset>
            <div className="action-row">
              <Button
                disabled={!info || !!loadErr || op.pending}
                onClick={() => void op.run(process)}
              >
                {strip
                  ? 'Remove metadata'
                  : compress
                    ? 'Compress ' + (files.length > 1 ? 'images' : 'image')
                    : 'Process ' + (batch ? 'images' : 'image')}{' '}
                <ArrowRight size={17} />
              </Button>
            </div>
            <ErrorState error={op.error} />
            <Progress pending={op.pending} progress={op.progress} />
          </Panel>
        )}
        {cropMode && file && info && (
          <Panel className="full" title="Crop and adjustments">
            <fieldset
              disabled={op.pending}
              className="form-grid"
              onChangeCapture={invalidate}
            >
              <Field label="Crop aspect ratio">
                <select
                  value={ratio}
                  onChange={(e) => changeCropRatio(e.target.value)}
                >
                  <option value="0">Free crop</option>
                  <option value="1">Square · 1:1</option>
                  <option value={4 / 3}>4:3</option>
                  <option value={16 / 9}>16:9</option>
                  <option value="custom">Custom ratio</option>
                </select>
              </Field>
              {ratio === 'custom' && (
                <Field label="Custom crop ratio">
                  <input
                    type="number"
                    min={0.1}
                    max={10}
                    step=".1"
                    value={customRatio}
                    onChange={(e) => {
                      const v = Math.max(0.1, Math.min(10, +e.target.value))
                      setCustomRatio(v)
                      changeCropRatio('custom', v)
                    }}
                  />
                </Field>
              )}
              <Field label="Rotation">
                <select value={rot} onChange={(e) => setRot(+e.target.value)}>
                  {[0, 90, 180, 270].map((x) => (
                    <option key={x} value={x}>
                      {x}°
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={'Brightness ' + bright + '%'}>
                <input
                  type="range"
                  min={30}
                  max={200}
                  value={bright}
                  onChange={(e) => setBright(+e.target.value)}
                />
              </Field>
              <Field label={'Contrast ' + contrast + '%'}>
                <input
                  type="range"
                  min={30}
                  max={230}
                  value={contrast}
                  onChange={(e) => setContrast(+e.target.value)}
                />
              </Field>
              {!signature && (
                <Field label={'Saturation ' + sat + '%'}>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={sat}
                    onChange={(e) => setSat(+e.target.value)}
                  />
                </Field>
              )}
              <Field label={'Threshold ' + (threshold || 'off')}>
                <input
                  type="range"
                  min={0}
                  max={250}
                  value={threshold}
                  onChange={(e) => setThreshold(+e.target.value)}
                />
              </Field>
              <Field label="Background">
                <select
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                >
                  <option value="keep">Keep original</option>
                  <option value="white">White</option>
                  {format !== 'image/jpeg' && (
                    <option value="transparent">Transparent ink cleanup</option>
                  )}
                </select>
              </Field>
              <Check label="Grayscale" checked={gray} onChange={setGray} />
              <Check label="Flip horizontally" checked={fh} onChange={setFh} />
              <Check label="Flip vertically" checked={fv} onChange={setFv} />
              <Check label="Sharpen" checked={sharp} onChange={setSharp} />
            </fieldset>
            <div className="action-row">
              <Button
                variant="quiet"
                disabled={op.pending}
                onClick={() => {
                  invalidate()
                  reset()
                }}
              >
                Reset adjustments
              </Button>
            </div>
            <Suspense fallback={<p>Loading crop preview…</p>}>
              <CropEditor
                file={file}
                crop={crop}
                change={(value) => {
                  invalidate()
                  setCrop(value)
                }}
                ratio={activeRatio}
                disabled={op.pending}
              />
            </Suspense>
          </Panel>
        )}
        {!!file && !loadErr && (
          <Panel className="full" title="Preview">
            <div className="preview-grid">
              <FilePreview file={file} label="Original image" />
              {!infoMode && (
                <FilePreview
                  file={op.items[0]?.blob ?? livePreview}
                  label={
                    op.items[0] || !signature
                      ? 'Processed image'
                      : 'Live signature preview'
                  }
                />
              )}
            </div>
            {summary && (
              <p className="size-compare" role="status">
                {summary}
              </p>
            )}
          </Panel>
        )}
      </div>
      <Results items={op.items} />
    </>
  )
}
