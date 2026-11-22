import { useState } from 'react'
import { useJourneySources } from '../../components/ToolJourney'
import {
  Button,
  Check,
  Dropzone,
  ErrorState,
  Field,
  FilePreview,
  Panel,
  Progress,
  Results,
  useOperation,
} from '../../components/shared'
import {
  extension,
  fileKind,
  images,
  PDF,
  sizeLabel,
  stem,
  type ImageMime,
  type Output,
} from '../../lib/files'
import { loadRender, renderBlob } from '../../lib/pdf-render'
import { editPdf, openEdit, pdfBlob } from '../../lib/pdf-edit'
import { autoCredit, initialEdits } from './photo/photoState'
import { photoJob } from './photo/photoJobs'
import { Count } from './PhotoPrintPanels'
import './advanced.css'

type Diagnosis =
  | {
      kind: 'pdf'
      pages: number
      rotated: number
      label: string
      preview: Blob
      findings: string[]
    }
  | {
      kind: 'image'
      photo: Awaited<ReturnType<typeof imageDiagnosis>>
      label: string
      preview: Blob
      findings: string[]
    }
const imageDiagnosis = (file: Blob) =>
  photoJob({ kind: 'analysis', file }, new AbortController().signal)

async function diagnose(
  file: File,
  max: number,
  format: string,
  physical: number,
): Promise<Diagnosis> {
  const kind = await fileKind(file)
  if (!kind) throw Error('This file has an invalid or unsupported header.')
  const found: string[] = []
  if (max > 0 && file.size > max * 1024)
    found.push('File size exceeds your ' + max + ' KB limit.')
  if (format && kind !== format)
    found.push(
      'The file format differs from the required ' +
        format.split('/')[1].toUpperCase() +
        '.',
    )
  if (kind === PDF) {
    const doc = await loadRender(file, { workerRendering: true })
    try {
      let rotated = 0,
        broken = 0,
        empty = 0,
        varied = 0
      const n = Math.min(doc.numPages, 30)
      let first = ''
      for (let i = 0; i < n; i++) {
        const page = await doc.getPage(i + 1),
          view = page.getViewport({ scale: 1 }),
          key = Math.round(view.width) + '×' + Math.round(view.height)
        if (i === 0) first = key
        else varied += Number(key !== first)
        rotated += Number(page.rotate !== 0)
        const text = (await page.getTextContent()).items
          .flatMap((i) => ('str' in i ? [i.str] : []))
          .join(' ')
          .trim()
        if (text.length < 4) empty++
        if (/[\uFFFD\x00]/.test(text)) broken++
        page.cleanup()
      }
      if (rotated)
        found.push(
          rotated +
            ' inspected pages have a stored rotation flag. Review their orientation.',
        )
      if (varied) found.push('The inspected pages use mixed page sizes.')
      if (empty)
        found.push(
          empty +
            ' inspected pages have little selectable text. These may be scans or blank pages.',
        )
      if (broken)
        found.push(
          broken +
            ' inspected pages show damaged text encoding. Verify visually or use OCR.',
        )
      if (n < doc.numPages)
        found.push(
          'Text and rotation diagnostics covered the first ' + n + ' pages.',
        )
      const cover = await doc.getPage(1),
        size = cover.getViewport({ scale: 1 })
      return {
        kind: 'pdf',
        pages: doc.numPages,
        rotated,
        label: doc.numPages + ' pages · first: ' + first + ' pt',
        preview: await renderBlob(
          doc,
          0,
          Math.min(1.2, 920 / Math.max(size.width, size.height)),
        ),
        findings: found,
      }
    } finally {
      await doc.dispose()
    }
  }
  const photo = await imageDiagnosis(file)
  if (photo.width < 180 || photo.height < 180)
    found.push('Small pixel dimensions can limit legibility.')
  if (photo.contrast < 43)
    found.push('Low contrast detected by luminance variation.')
  if (photo.brightness < 90 || photo.brightness > 224)
    found.push('The image may be underexposed or washed out.')
  if (photo.sharpness < 9)
    found.push(
      'Low edge contrast. Review small text and signatures at full size.',
    )
  if (physical > 0 && (photo.width / physical) * 25.4 < 300)
    found.push('Below 300 effective source DPI at the requested width.')
  if (photo.orientation && photo.orientation !== 1)
    found.push(
      'The decoder applied EXIF orientation ' +
        photo.orientation +
        '. Re-encoding will bake that orientation into the pixels.',
    )
  return {
    kind: 'image',
    photo,
    label:
      photo.width +
      ' × ' +
      photo.height +
      ' px · ' +
      kind.split('/')[1].toUpperCase(),
    preview: file,
    findings: found,
  }
}
export default function DocumentDoctor() {
  const [file, setFile] = useState<File>(),
    [diagnosis, setDiagnosis] = useState<Diagnosis>(),
    [preview, setPreview] = useState<Blob>()
  const [target, setTarget] = useState(0),
    [required, setRequired] = useState(''),
    [physical, setPhysical] = useState(0)
  const [rotate, setRotate] = useState(0),
    [contrast, setContrast] = useState(true),
    [trim, setTrim] = useState(0)
  const [format, setFormat] = useState<ImageMime>('image/png'),
    [fix, setFix] = useState<Output>()
  const op = useOperation()
  useJourneySources(file ? 1 : 0)
  function clear() {
    setDiagnosis(undefined)
    setFix(undefined)
    setPreview(undefined)
    op.reset()
  }
  return (
    <div className="advanced-space">
      <div className="advanced-columns">
        <Panel title="Inspect a document">
          <Dropzone
            label="Choose document to diagnose"
            accept={[PDF, ...images]}
            compact
            onFiles={(f) => {
              setFile(f[0])
              clear()
            }}
          />
          <div className="form-grid">
            <Count
              label="Maximum file size (KB, 0 skips)"
              value={target}
              min={0}
              onChange={(v) => {
                setTarget(v)
                clear()
              }}
            />
            <Count
              label="Target print width (mm, 0 skips)"
              value={physical}
              min={0}
              onChange={(v) => {
                setPhysical(v)
                clear()
              }}
            />
            <Field label="Required format">
              <select
                value={required}
                onChange={(e) => {
                  setRequired(e.target.value)
                  clear()
                }}
              >
                <option value="">Any supported format</option>
                {[PDF, ...images].map((f) => (
                  <option value={f} key={f}>
                    {f.split('/')[1].toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button
            disabled={!file || op.pending}
            onClick={() =>
              void op.run(async () => {
                const d = await diagnose(file!, target, required, physical)
                setDiagnosis(d)
                setPreview(d.preview)
                return []
              })
            }
          >
            Run diagnostics
          </Button>
          <Progress
            pending={op.pending}
            label="Checking document on this device"
          />
          <ErrorState error={op.error} />
          {diagnosis && (
            <>
              <p role="status">
                {diagnosis.label} · {sizeLabel(file!.size)}
              </p>
              {diagnosis.findings.length ? (
                <ul className="advanced-warning">
                  {diagnosis.findings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : (
                <p>No issue found by these checks.</p>
              )}
            </>
          )}
        </Panel>
        <Panel title="Review the document">
          {diagnosis ? (
            <FilePreview
              file={preview ?? diagnosis.preview}
              label={
                fix
                  ? 'Corrected first-page preview'
                  : 'Original first-page or image preview'
              }
            />
          ) : (
            <p className="muted">
              Run diagnostics to display the document preview.
            </p>
          )}
        </Panel>
      </div>
      {diagnosis && (
        <Panel title="Apply supported fixes">
          <div className="form-grid">
            <Field label="Rotate clockwise">
              <select
                value={rotate}
                onChange={(e) => setRotate(+e.target.value)}
              >
                {[0, 90, 180, 270].map((r) => (
                  <option value={r} key={r}>
                    {r}°
                  </option>
                ))}
              </select>
            </Field>
            {diagnosis.kind === 'image' && (
              <>
                <Field label="Corrected image format">
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as ImageMime)}
                  >
                    {images.map((f) => (
                      <option value={f} key={f}>
                        {f.split('/')[1].toUpperCase()}
                      </option>
                    ))}
                  </select>
                </Field>
                <Count
                  label="Trim each margin (%)"
                  min={0}
                  max={35}
                  step={1}
                  value={trim}
                  onChange={setTrim}
                />
                <Check
                  label="Conservative tone correction"
                  checked={contrast}
                  onChange={setContrast}
                />
              </>
            )}
          </div>
          {diagnosis.kind === 'pdf' && (
            <p className="muted">
              Save an independently parsed PDF and optionally rotate every
              page. Damaged or encrypted source PDFs may require another tool.
            </p>
          )}
          <div className="action-row">
            <Button
              disabled={op.pending}
              onClick={() =>
                void op.run(async () => {
                  let blob: Blob
                  if (diagnosis.kind === 'pdf') {
                    const original = await openEdit(file!)
                    blob = rotate
                      ? await editPdf('rotate-pdf', [file!], {
                          pages: original.getPageIndices(),
                          angle: rotate,
                        })
                      : pdfBlob(await original.save())
                    const doc = await loadRender(blob, {
                      workerRendering: true,
                    })
                    try {
                      setPreview(await renderBlob(doc, 0, 0.85))
                    } finally {
                      await doc.dispose()
                    }
                  } else {
                    if (!Number.isFinite(trim) || trim < 0 || trim > 35)
                      throw Error('Choose a margin trim from 0 to 35%.')
                    const n = trim / 100,
                      crop = {
                        x: n,
                        y: n,
                        width: 1 - n * 2,
                        height: 1 - n * 2,
                      }
                    blob = (
                      await photoJob(
                        {
                          kind: 'render',
                          file: file!,
                          edit: {
                            ...initialEdits,
                            crop,
                            rotation: rotate,
                            color: contrast
                              ? autoCredit(diagnosis.photo)
                              : initialEdits.color,
                          },
                          options: {
                            limit: 12_000_000,
                            format,
                            quality: 0.94,
                          },
                        },
                        new AbortController().signal,
                      )
                    ).blob
                    setPreview(blob)
                  }
                  const item = {
                    name:
                      stem(file!.name) + '-corrected.' + extension(blob.type),
                    blob,
                    detail:
                      (blob.size - file!.size >= 0 ? '+' : '') +
                      (blob.size - file!.size) +
                      ' bytes vs source',
                  }
                  setFix(item)
                  return [item]
                })
              }
            >
              Apply fixes
            </Button>
            <Button
              variant="secondary"
              disabled={!fix || op.pending}
              onClick={() => {
                setPreview(diagnosis.preview)
                setFix(undefined)
                op.reset()
              }}
            >
              Undo fixes
            </Button>
          </div>
          <Results items={op.items} />
        </Panel>
      )}
    </div>
  )
}
