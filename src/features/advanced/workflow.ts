import {
  PDF,
  extension,
  fileKind,
  stem,
  sizeLabel,
  zipFiles,
  type ImageMime,
  type Output,
} from '../../lib/files'
import { editPdf, openEdit } from '../../lib/pdf-edit'
import { imageSize } from '../../lib/raster'
import { runRaster } from '../../lib/process-image'
import { defaultPhotoSheet, makePhotoSheet } from './printPhotos'
import { autoCredit, cropRatio, initialEdits } from './photo/photoState'
import { photoJob } from './photo/photoJobs'

export type Step = { id: string } & (
  | { op: 'crop'; ratio: number }
  | { op: 'auto' }
  | { op: 'resize'; width: number; height: number }
  | { op: 'encode'; format: ImageMime; quality: number }
  | { op: 'max'; kb: number }
  | { op: 'validate'; kb: number; width: number; height: number }
  | { op: 'signature'; threshold: number }
  | { op: 'merge' }
  | { op: 'number'; start: number }
  | { op: 'sheet'; width: number; height: number; copies: number }
)
type WithoutId<T> = T extends { id: string } ? Omit<T, 'id'> : never
type Spec = WithoutId<Step>
export const operations: Record<
  Step['op'],
  { label: string; initial: Spec }
> = {
  crop: { label: 'Center crop', initial: { op: 'crop', ratio: 0.8 } },
  auto: { label: 'Auto correct', initial: { op: 'auto' } },
  resize: {
    label: 'Resize image',
    initial: { op: 'resize', width: 400, height: 500 },
  },
  encode: {
    label: 'Convert image format',
    initial: { op: 'encode', format: 'image/jpeg', quality: 90 },
  },
  max: {
    label: 'Compress to a maximum size',
    initial: { op: 'max', kb: 100 },
  },
  validate: {
    label: 'Validate image dimensions and size',
    initial: { op: 'validate', kb: 250, width: 0, height: 0 },
  },
  signature: {
    label: 'Clean signature on white',
    initial: { op: 'signature', threshold: 170 },
  },
  merge: { label: 'Merge PDFs', initial: { op: 'merge' } },
  number: { label: 'Number PDF pages', initial: { op: 'number', start: 1 } },
  sheet: {
    label: 'Build A4 photo print sheet',
    initial: { op: 'sheet', width: 35, height: 45, copies: 6 },
  },
}
export const recipe: Record<string, Step['op'][]> = {
  'Passport photo sheet': ['crop', 'auto', 'sheet'],
  'Signature preparation': ['signature', 'encode', 'max', 'validate'],
  'Application images': ['crop', 'resize', 'encode', 'max', 'validate'],
  'Image format conversion': ['encode'],
  'PDF merge & page numbering': ['merge', 'number'],
  'Batch image resize': ['resize'],
  'Batch photo print preparation': ['auto', 'sheet'],
}
export const newStep = (op: Step['op']): Step => ({
  ...operations[op].initial,
  id: crypto.randomUUID(),
})
const positive = (n: number, max = 10000) =>
  Number.isFinite(n) && n > 0 && n <= max
export function validStep(step: Step) {
  switch (step.op) {
    case 'crop':
      return positive(step.ratio, 8) && step.ratio >= 0.12
    case 'resize':
      return (
        positive(step.width) &&
        positive(step.height) &&
        Number.isInteger(step.width) &&
        Number.isInteger(step.height) &&
        step.width * step.height <= 16_000_000
      )
    case 'encode':
      return (
        ['image/png', 'image/jpeg', 'image/webp'].includes(step.format) &&
        positive(step.quality, 100)
      )
    case 'max':
      return positive(step.kb, 25000)
    case 'validate':
      return [step.width, step.height, step.kb].every(
        (n) => Number.isFinite(n) && n >= 0 && n <= 25000,
      )
    case 'signature':
      return positive(step.threshold, 255)
    case 'number':
      return positive(step.start, 100000) && Number.isInteger(step.start)
    case 'sheet':
      return (
        positive(step.width, 450) &&
        positive(step.height, 450) &&
        positive(step.copies, 100) &&
        Number.isInteger(step.copies)
      )
    default:
      return step.op === 'merge' || step.op === 'auto'
  }
}
export async function executeWorkflow(
  input: File[],
  steps: Step[],
  signal: AbortSignal,
  report: (value: number, label: string) => void,
) {
  if (!input.length || !steps.length)
    throw Error('Choose source files and at least one workflow step.')
  if (
    input.length > 20 ||
    steps.length > 16 ||
    input.some((f) => f.size > 36 * 1024 * 1024) ||
    input.reduce((n, f) => n + f.size, 0) > 105 * 1024 * 1024
  )
    throw Error('Use up to 20 inputs, 16 steps, and 105 MB total per run.')
  if (steps.some((step) => !validStep(step)))
    throw Error('Check the values in each workflow step.')
  let bundle: Output[] = []
  for (const file of input) {
    const kind = await fileKind(file)
    if (!kind) throw Error('Unsupported source file: ' + file.name)
    bundle.push({ blob: file.slice(0, file.size, kind), name: file.name })
  }
  let changed = false
  for (const [index, step] of steps.entries()) {
    signal.throwIfAborted()
    const info = operations[step.op].label
    report((index / steps.length) * 100, info)
    if (step.op === 'merge') {
      if (bundle.some((f) => f.blob.type !== PDF))
        throw Error('Merge PDFs requires PDF inputs.')
      bundle = [
        {
          blob: await editPdf(
            'merge-pdf',
            bundle.map((f) => f.blob),
            { pages: [] },
          ),
          name: 'docready-merged.pdf',
        },
      ]
      changed = true
      continue
    }
    if (step.op === 'sheet') {
      if (bundle.some((f) => f.blob.type === PDF))
        throw Error('Photo print sheets require images.')
      // Normalize encoded orientation before the physical PDF placement.
      const ready: Blob[] = []
      for (const item of bundle) {
        signal.throwIfAborted()
        ready.push(
          (await runRaster(item.blob, { format: 'image/png', quality: 0.94 }))
            .blob,
        )
      }
      bundle = [
        await makePhotoSheet(
          ready,
          {
            ...defaultPhotoSheet,
            photo: { width: step.width, height: step.height },
            copies: step.copies,
          },
          signal,
        ),
      ]
      changed = true
      continue
    }
    const next: Output[] = []
    for (const [i, item] of bundle.entries()) {
      signal.throwIfAborted()
      report(
        ((index + i / bundle.length) / steps.length) * 100,
        info + ' · ' + (i + 1) + '/' + bundle.length,
      )
      let blob = item.blob
      if (step.op === 'number') {
        if (blob.type !== PDF)
          throw Error('Page numbering requires PDF inputs.')
        const doc = await openEdit(blob)
        blob = await editPdf('number-pdf', [blob], {
          pages: doc.getPageIndices(),
          text: '{n}',
          start: step.start,
          position: 'bottom-center',
        })
        changed = true
      } else {
        if (blob.type === PDF)
          throw Error(
            info +
              ' requires an image. Move PDF steps after building the sheet.',
          )
        const kind = blob.type as ImageMime
        if (step.op === 'validate') {
          const size = await imageSize(blob)
          if (
            (step.width && step.width !== size.width) ||
            (step.height && step.height !== size.height) ||
            (step.kb && blob.size > step.kb * 1024)
          )
            throw Error(
              item.name +
                ' failed validation (' +
                size.width +
                ' × ' +
                size.height +
                ' px, ' +
                sizeLabel(blob.size) +
                ').',
            )
          next.push({
            ...item,
            detail: 'Validated · ' + size.width + ' × ' + size.height + ' px',
          })
          continue
        }
        if (step.op === 'auto') {
          const analysis = await photoJob(
            { kind: 'analysis', file: blob },
            signal,
          )
          blob = (
            await photoJob(
              {
                kind: 'render',
                file: blob,
                edit: { ...initialEdits, color: autoCredit(analysis) },
                options: { limit: 12_000_000, format: kind, quality: 0.94 },
              },
              signal,
            )
          ).blob
        } else if (step.op === 'crop') {
          const source = await imageSize(blob)
          blob = (
            await runRaster(blob, {
              format: kind,
              quality: 0.94,
              crop: cropRatio(source.width, source.height, step.ratio),
            })
          ).blob
        } else if (step.op === 'resize') {
          const source = await imageSize(blob)
          blob = (
            await runRaster(blob, {
              format: kind,
              quality: 0.94,
              width: step.width,
              height: step.height,
              crop: cropRatio(
                source.width,
                source.height,
                step.width / step.height,
              ),
            })
          ).blob
        } else if (step.op === 'encode') {
          blob = (
            await runRaster(blob, {
              format: step.format,
              quality: step.quality / 100,
            })
          ).blob
        } else if (step.op === 'max') {
          if (blob.size > step.kb * 1024)
            blob = (
              await runRaster(blob, {
                format: kind,
                quality: 0.92,
                target: step.kb * 1024,
              })
            ).blob
          if (blob.size > step.kb * 1024)
            throw Error(
              'This image cannot reach ' +
                step.kb +
                ' KB at its present dimensions. Resize it first.',
            )
        } else if (step.op === 'signature') {
          blob = (
            await runRaster(blob, {
              format: 'image/png',
              quality: 1,
              white: true,
              threshold: step.threshold,
            })
          ).blob
        }
        changed = true
      }
      next.push({ name: stem(item.name) + '.' + extension(blob.type), blob })
    }
    bundle = next
  }
  signal.throwIfAborted()
  const regular = bundle.map((item) => ({
    ...item,
    name:
      changed && !item.name.startsWith('docready-')
        ? stem(item.name) + '-processed.' + extension(item.blob.type)
        : item.name,
  }))
  return regular.length > 1
    ? [await zipFiles(regular, 'docready-workflow.zip'), ...regular]
    : regular
}
