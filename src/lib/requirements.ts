import {
  pageCountLabel,
  extension,
  fileKind,
  images,
  PDF,
  safeName,
  sizeLabel,
  stem,
  type ImageMime,
  type Output,
} from './files'
import { openEdit } from './pdf-edit'
import { runRaster } from './process-image'
import { imageSize } from './raster'
export type Requirement = {
  id: string
  label: string
  types: string[]
  width: string
  height: string
  min: string
  max: string
  required: boolean
  filename: string
}
export const blankRequirement = (
  label = 'New document',
  types: string[] = [...images],
): Requirement => ({
  id: crypto.randomUUID(),
  label,
  types,
  width: '',
  height: '',
  min: '',
  max: '',
  required: true,
  filename: '',
})
export function requirementErrors(r: Requirement) {
  const limits = [r.width, r.height, r.min, r.max]
  if (!r.label.trim() || !r.types.length)
    return 'Enter a label and at least one accepted format.'
  if (limits.some((s) => s && (!Number.isFinite(+s) || +s <= 0)))
    return 'File size and dimension limits must be positive.'
  if (
    [r.width, r.height].some((s) => s && (!Number.isInteger(+s) || +s > 10000))
  )
    return 'Dimensions must be whole numbers up to 10,000 px.'
  if (+r.width * +r.height > 16_000_000) return 'Choose at most 16 megapixels.'
  if (r.min && r.max && +r.min > +r.max)
    return 'Minimum size exceeds maximum size.'
  if ((r.width || r.height) && !r.types.some((t) => t !== PDF))
    return 'Pixel dimensions apply to image formats.'
  return ''
}
export async function readyFile(
  file: File,
  r: Requirement,
): Promise<{ status: string; item?: Output; detail?: string }> {
  const kind = await fileKind(file)
  if (!kind)
    return {
      status: 'Processing failed',
      detail: 'Choose a valid PDF, JPEG, PNG or WebP file.',
    }
  let blob: Blob = file.slice(0, file.size, kind),
    mime = kind,
    detail = ''
  if (kind === PDF) {
    if (!r.types.includes(PDF))
      return {
        status: 'Needs conversion',
        detail:
          'This requirement accepts images. Export a page with PDF to Images first.',
      }
    const doc = await openEdit(file)
    detail = pageCountLabel(doc.getPageCount())
  } else {
    if (!r.types.some((t) => t !== PDF))
      return {
        status: 'Needs conversion',
        detail:
          'Convert the image with Images to PDF, then replace the source.',
      }
    const source = await imageSize(file)
    const width = r.width
      ? +r.width
      : r.height
        ? Math.max(1, Math.round((source.width * +r.height) / source.height))
        : source.width
    const height = r.height
      ? +r.height
      : r.width
        ? Math.max(1, Math.round((source.height * +r.width) / source.width))
        : source.height
    mime = r.types.includes(kind) ? kind : r.types.find((t) => t !== PDF)!
    if (
      mime !== kind ||
      width !== source.width ||
      height !== source.height ||
      (r.max && file.size > +r.max * 1024)
    ) {
      const result = await runRaster(file, {
        format: mime as ImageMime,
        width,
        height,
        quality: 0.91,
        target: r.max ? +r.max * 1024 : undefined,
      })
      blob = result.blob
      const actual = await imageSize(blob)
      if (actual.width !== width || actual.height !== height)
        return {
          status: 'Needs resizing',
          detail: 'Output dimensions could not be verified.',
        }
    }
    detail = width + ' × ' + height + ' px'
  }
  if (r.max && blob.size > +r.max * 1024)
    return {
      status: 'Exceeds maximum size',
      detail:
        'Result ' +
        sizeLabel(blob.size) +
        '. Try different dimensions, another accepted format or a smaller source.',
    }
  if (r.min && blob.size < +r.min * 1024)
    return {
      status: 'Below minimum size',
      detail:
        'Result ' +
        sizeLabel(blob.size) +
        '. Try a higher-resolution source or change the format.',
    }
  const requested = r.filename.trim()
  const name = r.filename.trim()
    ? safeName(requested.replace(/\.(pdf|jpg|jpeg|png|webp)$/i, '')) +
      '.' +
      extension(mime)
    : stem(file.name) + '.' + extension(mime)
  return { status: 'Valid', detail, item: { blob, name, detail } }
}
