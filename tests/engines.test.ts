import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { editPdf, imagesPdf, openEdit } from '../src/lib/pdf-edit'
import {
  fileKind,
  parsePages,
  safeName,
  sha256,
  zipFiles,
} from '../src/lib/files'
import { resizeAspect } from '../src/lib/raster'
import { warpRgba } from '../src/lib/perspective'
import {
  blankRequirement,
  requirementErrors,
  readyFile,
} from '../src/lib/requirements'
import { makeResume } from '../src/lib/resume-pdf'
const fixture = async (name: string) =>
  new File(
    [
      new Uint8Array(
        await readFile(new URL('./fixtures/' + name, import.meta.url)),
      ),
    ],
    name,
  )
describe('PDF manipulation', () => {
  it('merges page counts and order', async () => {
    const output = await editPdf(
      'merge-pdf',
      [await fixture('one.pdf'), await fixture('two.pdf')],
      { pages: [] },
    )
    expect(await fileKind(output)).toBe('application/pdf')
    const doc = await openEdit(output)
    expect(doc.getPages().map((p) => p.getWidth())).toEqual([430, 430, 500])
  })
  it('splits and reorders by original page index', async () => {
    const input = await fixture('two.pdf')
    expect(
      (await openEdit(await editPdf('split-pdf', [input], { pages: [1] })))
        .getPage(0)
        .getWidth(),
    ).toBe(500)
    expect(
      (await openEdit(await editPdf('reorder-pdf', [input], { pages: [1, 0] })))
        .getPages()
        .map((p) => p.getWidth()),
    ).toEqual([500, 430])
  })
  it('rotates selected pages and preserves other pages', async () => {
    const doc = await openEdit(
      await editPdf('rotate-pdf', [await fixture('two.pdf')], {
        pages: [1],
        angle: 270,
      }),
    )
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 270])
  })
  it('detects a corrupted PDF', async () => {
    await expect(openEdit(new Blob(['%PDF-1.7\ncorrupt']))).rejects.toThrow(
      'could not be read',
    )
  })
  it('embeds images with appropriate paper geometry', async () => {
    const f = await fixture('sample.png')
    const pdf = await openEdit(
      await imagesPdf([f], {
        paper: 'Letter',
        landscape: true,
        fit: 'contain',
        margin: 12,
      }),
    )
    expect(pdf.getPage(0).getSize()).toEqual({ width: 792, height: 612 })
  })
})
describe('File and image helpers', () => {
  it('validates and deduplicates page ranges', () => {
    expect(parsePages('3, 1-2, 1', 3)).toEqual([2, 0, 1])
    expect(() => parsePages('2-4', 3)).toThrow()
    expect(() => parsePages('0', 3)).toThrow()
    expect(parsePages('', 2)).toEqual([0, 1])
  })
  it('preserves resize aspect ratio', () => {
    expect(resizeAspect('width', 120, { width: 240, height: 160 })).toEqual({
      width: 120,
      height: 80,
    })
    expect(resizeAspect('height', 40, { width: 240, height: 160 })).toEqual({
      width: 60,
      height: 40,
    })
  })
  it('verifies image magic bytes independently of extension', async () => {
    expect(await fileKind(await fixture('sample.png'))).toBe('image/png')
    expect(await fileKind(new Blob(['fake'], { type: 'image/png' }))).toBe('')
  })
  it('sanitizes zip entry names and avoids case-insensitive collisions', async () => {
    const blob = new Blob(['data'])
    const zip = await zipFiles([
      { name: '../a.txt', blob },
      { name: '../A.txt', blob },
    ])
    const opened = await JSZip.loadAsync(await zip.blob.arrayBuffer())
    expect(Object.keys(opened.files)).toEqual(['_a.txt', '_A-2.txt'])
    expect(await opened.file('_a.txt')?.async('string')).toBe('data')
    expect(safeName('CON.txt')).toBe('_CON.txt')
  })
  it('checks SHA-256 against a known value', async () => {
    expect(await sha256(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
  it('preserves full-image sample pixels through identity perspective', () => {
    const src = Uint8ClampedArray.from({ length: 4 * 5 * 4 }, (_, i) => i)
    const result = warpRgba(src, 4, 5, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ])
    expect([result.width, result.height]).toEqual([4, 5])
    expect(result.data).toEqual(src)
  })
  it('rejects crossed scanner corners', () => {
    expect(() =>
      warpRgba(new Uint8ClampedArray(100), 5, 5, [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]),
    ).toThrow('clockwise')
  })
})
describe('Application and resume exports', () => {
  it('rejects contradictory and unsupported requirements', () => {
    const r = {
      ...blankRequirement('Certificate', ['application/pdf']),
      min: '5',
      max: '1',
    }
    expect(requirementErrors(r)).toBe('Minimum size exceeds maximum size.')
    expect(requirementErrors({ ...r, max: '6', width: '250' })).toBe(
      'Pixel dimensions apply to image formats.',
    )
  })
  it('validates readable PDFs and confirms original bytes', async () => {
    const file = await fixture('two.pdf')
    const r = {
      ...blankRequirement('Certificate', ['application/pdf']),
      filename: 'supporting.pdf',
      max: '100',
    }
    const output = await readyFile(file, r)
    expect(output.status).toBe('Valid')
    expect(output.item?.name).toBe('supporting.pdf')
    expect(output.item?.blob.size).toBe(file.size)
    expect(output.detail).toBe('2 pages')
  })
  it('paginates text resumes', async () => {
    const output = await makeResume(
      {
        name: 'QA Applicant',
        contact: 'applicant@example.com',
        layout: 'Clean Editorial',
        font: 'sans',
        margin: 40,
        color: '#5452b6',
        spacing: 1,
        sections: [
          {
            id: '1',
            title: 'Projects',
            body: 'A portfolio document.\n'.repeat(100),
          },
        ],
      },
      'Letter',
    )
    expect(output.pages).toBeGreaterThan(1)
    expect(
      (await PDFDocument.load(await output.blob.arrayBuffer())).getPageCount(),
    ).toBe(output.pages)
  })
})
