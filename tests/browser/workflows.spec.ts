import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'
import JSZip from 'jszip'
const fixture = (name: string) => resolve('tests/fixtures', name)
const artifacts = process.env.DOCREADY_SCREENSHOTS || 'test-results/screenshots'
async function tool(page: Page, id: string) {
  await page.goto(
    id === 'application-ready' ? '/application-ready' : '/tools/' + id,
  )
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}
async function upload(page: Page, files: string | string[], nth = 0) {
  await page
    .locator('input[type="file"]')
    .nth(nth)
    .setInputFiles(Array.isArray(files) ? files.map(fixture) : fixture(files))
}
async function getDownload(page: Page, name: string) {
  const awaited = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Download ' + name, exact: true })
    .click()
  const file = await awaited
  expect(file.suggestedFilename()).toBe(name)
  expect(await file.failure()).toBeNull()
  return readFile((await file.path())!)
}
async function imageProperties(page: Page, bytes: Buffer, type: string) {
  return page.evaluate(
    async ({ data, type }) => {
      const blob = new Blob(
        [Uint8Array.from(atob(data), (c) => c.charCodeAt(0))],
        { type },
      )
      const bitmap = await createImageBitmap(blob),
        canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      const image = context.getImageData(0, 0, bitmap.width, bitmap.height).data
      const alpha = image[3],
        opaque = image.some((v, i) => i % 4 === 3 && v === 255)
      const center = [
        ...context.getImageData(bitmap.width >> 1, bitmap.height >> 1, 1, 1)
          .data,
      ]
      return {
        width: bitmap.width,
        height: bitmap.height,
        alpha,
        opaque,
        center,
      }
    },
    { data: bytes.toString('base64'), type },
  )
}
async function pdfText(bytes: Buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    standardFontDataUrl:
      resolve('node_modules/pdfjs-dist/standard_fonts') + '/',
  })
  const doc = await task.promise
  try {
    const texts: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n),
        content = await page.getTextContent()
      texts.push(
        content.items
          .flatMap((item) => ('str' in item ? [item.str] : []))
          .join(' '),
      )
    }
    return texts
  } finally {
    await task.destroy()
  }
}
test('desktop and mobile landing, dashboard, all catalog routes and keyboard palette', async ({
  page,
}) => {
  const failures: string[] = []
  page.on('pageerror', (e) => failures.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') failures.push(m.text())
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: /Your documents, ready for anything/i }),
  ).toBeVisible()
  await page.evaluate(() => document.fonts.ready.then(() => true))
  await page.screenshot({
    path: artifacts + '/desktop-home.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page
    .locator('summary')
    .filter({ hasText: 'Do I need an account?' })
    .click()
  await expect(
    page.getByText(
      'You can use the workspace and download your files without an account.',
    ),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Explore All Tools' }).click()
  await expect(
    page.getByRole('heading', { name: 'All Tools', exact: true }),
  ).toBeVisible()
  const links = await page
    .locator('.tool-card')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href')!))
  expect(links.length).toBeGreaterThanOrEqual(55)
  expect(links).toContain('/tools/remove-background')
  expect(links).toContain('/tools/e-card-cutter')
  expect(links).toContain('/tools/unlock-pdf')
  for (const link of links) {
    await page.goto(link)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('main .panel').first()).toBeVisible()
    expect(
      await page.locator('link[rel="canonical"]').getAttribute('href'),
    ).toContain(link)
  }
  await page.goto('/workspace')
  await expect(
    page.getByRole('heading', {
      name: 'What would you like to prepare today?',
    }),
  ).toBeVisible()
  await page.screenshot({
    path: artifacts + '/desktop-dashboard.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Search commands' })
    .fill('resize photo')
  await expect(page.getByRole('button', { name: 'Resize Image' })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/resize-image/)
  await page.goBack()
  await expect(page).toHaveURL(/workspace$/)
  await page.keyboard.press('Control+k')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.screenshot({
    path: artifacts + '/mobile-home.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page
    .getByRole('navigation', { name: 'Mobile site navigation' })
    .locator('summary').filter({ hasText: /^PDF Tools/ })
    .click()
  await page.getByRole('navigation', { name: 'Mobile site navigation' }).locator('summary').filter({ hasText: /^Organize PDF/ }).click()
  await page.getByRole('navigation', { name: 'Mobile site navigation' }).getByRole('link', { name: 'Merge PDF', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Merge PDF' })).toBeVisible()
  await page.getByRole('button', { name: 'Open workspace navigation' }).click()
  await page
    .getByRole('navigation', { name: 'Mobile workspace navigation' })
    .getByRole('link', { name: 'Settings' })
    .click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.screenshot({
    path: artifacts + '/mobile-settings.png',
    fullPage: true,
    animations: 'disabled',
  })
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 880 })
    for (const route of [
      '/',
      '/workspace',
      '/workspace/all',
      '/settings',
      '/application-ready',
      '/tools/resize-image',
      '/tools/scan-document',
      '/tools/e-card-cutter',
      '/tools/resume',
    ]) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
    }
  }
  expect(failures).toEqual([])
})
test('landing accepts a real input and sends it to the correct tool', async ({
  page,
}) => {
  await page.goto('/')
  await upload(page, 'sample.png')
  await expect(page).toHaveURL(/resize-image/)
  await expect(page.getByText('Original dimensions 240 × 160 px')).toBeVisible()
  await page.goto('/')
  await upload(page, 'two.pdf')
  await expect(page).toHaveURL(/preview-pdf/)
  await expect(page.getByAltText('PDF page 1')).toBeVisible()
})
test('image resize, conversion, compression, crop, metadata and batch', async ({
  page,
}) => {
  await tool(page, 'resize-image')
  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  })
  await expect(page.getByRole('alert')).toContainText('not a supported file')
  await upload(page, 'sample.png')
  await expect(page.getByText('Original dimensions 240 × 160 px')).toBeVisible()
  await page.getByLabel('Width (px)').fill('120')
  await expect(page.getByLabel('Height (px)')).toHaveValue('80')
  await page.getByLabel('Output format').selectOption('image/png')
  await page.getByRole('button', { name: 'Process image' }).click()
  await expect(page.getByAltText('Processed image')).toBeVisible()
  const png = await getDownload(page, 'sample-resize.png')
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect(await imageProperties(page, png, 'image/png')).toMatchObject({
    width: 120,
    height: 80,
    alpha: 0,
    opaque: true,
  })
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({
    path: artifacts + '/image-workspace.png',
    fullPage: true,
    animations: 'disabled',
  })
  await tool(page, 'convert-image')
  await upload(page, 'sample.png')
  await page.getByLabel('Output format').selectOption('image/webp')
  await page.getByRole('button', { name: 'Process image' }).click()
  const webp = await getDownload(page, 'sample-convert.webp')
  expect(webp.subarray(8, 12).toString()).toBe('WEBP')
  expect(await imageProperties(page, webp, 'image/webp')).toMatchObject({
    width: 240,
    height: 160,
    alpha: 0,
  })
  await page.getByLabel('Output format').selectOption('image/jpeg')
  await page.getByRole('button', { name: 'Process image' }).click()
  const jpg = await getDownload(page, 'sample-convert.jpg')
  expect(await imageProperties(page, jpg, 'image/jpeg')).toMatchObject({
    width: 240,
    height: 160,
    alpha: 255,
  })
  await tool(page, 'compress-image')
  await upload(page, 'document.jpg')
  await page.getByLabel('Compression mode').selectOption('target')
  await page.getByLabel('Target size', { exact: true }).fill('16')
  await page.getByRole('button', { name: 'Compress image', exact: true }).click()
  const compressed = await getDownload(page, 'document-compress.jpg')
  expect(compressed.length).toBeLessThanOrEqual(16 * 1024)
  await expect(page.getByText(/Original .* · Result/)).toBeVisible()
  await page.getByLabel('Target size', { exact: true }).fill('0.1')
  await page.getByRole('button', { name: 'Compress image', exact: true }).click()
  await expect(
    page.getByText(/Target not reached before safe downscale limit/).first(),
  ).toBeVisible()
  await tool(page, 'crop-image')
  await upload(page, 'sample.png')
  await page.getByLabel('Crop aspect ratio').selectOption('1')
  await page
    .getByRole('combobox', { name: 'Rotation', exact: true })
    .selectOption('90')
  await page.getByLabel('Grayscale').check()
  await page.getByLabel('Flip horizontally').check()
  await page.getByRole('button', { name: 'Process image' }).click()
  const cropped = await imageProperties(
    page,
    await getDownload(page, 'sample-crop.jpg'),
    'image/jpeg',
  )
  expect(cropped).toMatchObject({ width: 160, height: 160 })
  expect(Math.abs(cropped.center[0] - cropped.center[1])).toBeLessThan(4)
  await tool(page, 'image-info')
  await upload(page, 'sample.png')
  await expect(page.getByText('Metadata markers: tEXt')).toBeVisible()
  await tool(page, 'strip-metadata')
  await upload(page, 'sample.png')
  await page.getByRole('button', { name: 'Remove metadata' }).click()
  const clean = await getDownload(page, 'sample-clean.png')
  expect(clean.includes(Buffer.from('DocReadyApp synthetic'))).toBe(false)
  expect(await imageProperties(page, clean, 'image/png')).toMatchObject({
    width: 240,
    height: 160,
    alpha: 0,
  })
  await tool(page, 'batch-image')
  await upload(page, ['sample.png', 'document.jpg'])
  await page.getByLabel('Width (px)').fill('120')
  await page.getByRole('button', { name: 'Process images' }).click()
  const zip = await JSZip.loadAsync(
    await getDownload(page, 'processed-images.zip'),
  )
  expect(Object.keys(zip.files)).toEqual([
    'sample-batch.jpg',
    'document-batch.jpg',
  ])
  expect(
    await imageProperties(
      page,
      await zip.file('document-batch.jpg')!.async('nodebuffer'),
      'image/jpeg',
    ),
  ).toMatchObject({ width: 120, height: 91 })
})
test('PDF merge, split, rotate, reorder, preview and image conversion', async ({
  page,
}) => {
  await tool(page, 'merge-pdf')
  await upload(page, ['two.pdf', 'one.pdf'])
  await expect(page.getByText(/2 pages/)).toBeVisible()
  await page.getByRole('button', { name: 'Move one.pdf up' }).click()
  await page.getByRole('button', { name: 'Generate output' }).click()
  const merged = await getDownload(page, 'merged.pdf')
  expect(await pdfText(merged)).toEqual([
    'Third Document Page',
    'First Document Page',
    'Second Document Page',
  ])
  await expect(
    page.getByRole('heading', { name: 'Output PDF preview' }),
  ).toBeVisible()
  await page.screenshot({
    path: artifacts + '/pdf-workspace.png',
    fullPage: false,
  })
  await tool(page, 'split-pdf')
  await upload(page, 'two.pdf')
  await page.getByLabel(/Pages ·/).fill('9')
  await page.getByRole('button', { name: 'Generate output' }).click()
  await expect(page.getByRole('alert')).toContainText('between 1 and 2')
  await page.getByLabel(/Pages ·/).fill('2')
  await page.getByRole('button', { name: 'Generate output' }).click()
  expect(await pdfText(await getDownload(page, 'two-split.pdf'))).toEqual([
    'Second Document Page',
  ])
  await page.getByLabel(/Pages ·/).fill('1-2')
  await page.getByLabel('Split output').selectOption('separate')
  await page.getByRole('button', { name: 'Generate output' }).click()
  const split = await JSZip.loadAsync(await getDownload(page, 'two-split.zip'))
  expect(Object.keys(split.files)).toEqual(['page-1.pdf', 'page-2.pdf'])
  await tool(page, 'rotate-pdf')
  await upload(page, 'two.pdf')
  await page.getByLabel(/Pages ·/).fill('2')
  await page.getByLabel('Rotation angle').selectOption('270')
  await page.getByRole('button', { name: 'Generate output' }).click()
  const rotated = await PDFDocument.load(
    await getDownload(page, 'two-rotate.pdf'),
  )
  expect(rotated.getPages().map((p) => p.getRotation().angle)).toEqual([0, 270])
  await tool(page, 'reorder-pdf')
  await upload(page, 'two.pdf')
  await page.getByRole('button', { name: 'Move page 2 earlier' }).click()
  await page.getByRole('button', { name: 'Remove page 1' }).click()
  await page.getByRole('button', { name: 'Generate output' }).click()
  expect(await pdfText(await getDownload(page, 'two-reorder.pdf'))).toEqual([
    'Second Document Page',
  ])
  await tool(page, 'preview-pdf')
  await upload(page, 'two.pdf')
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByAltText('PDF page 2')).toBeVisible()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.getByText('125%')).toBeVisible()
  await page.getByRole('button', { name: 'Fit page' }).click()
  await expect(page.getByText('100%', { exact: true })).toBeVisible()
  await tool(page, 'image-to-pdf')
  await upload(page, ['sample.png', 'document.jpg'])
  await page.getByLabel('Paper size').selectOption('Letter')
  await page.getByLabel('Orientation').selectOption('landscape')
  await page.getByRole('button', { name: 'Generate output' }).click()
  const imagePdf = await PDFDocument.load(await getDownload(page, 'images.pdf'))
  expect(imagePdf.getPageCount()).toBe(2)
  expect(imagePdf.getPage(0).getSize()).toEqual({ width: 792, height: 612 })
  await tool(page, 'pdf-to-image')
  await upload(page, 'two.pdf')
  await page.getByLabel('Render scale').selectOption('1')
  await page.getByRole('button', { name: 'Generate output' }).click()
  const zip = await JSZip.loadAsync(await getDownload(page, 'two-pages.zip'))
  expect(
    await imageProperties(
      page,
      await zip.file('page-2.png')!.async('nodebuffer'),
      'image/png',
    ),
  ).toMatchObject({ width: 500, height: 530 })
})
test('PDF overlays remain in downloaded bytes and compression reports the real outcome', async ({
  page,
}) => {
  for (const [id, download, marker] of [
    ['watermark-pdf', 'two-watermark.pdf', 'CONFIDENTIAL SAMPLE'],
    ['number-pdf', 'two-number.pdf', '7 / 2'],
    ['annotate-pdf', 'two-annotate.pdf', 'Reviewed today'],
  ]) {
    await tool(page, id)
    await upload(page, 'two.pdf')
    if (id === 'number-pdf') await page.getByLabel('Starting number').fill('7')
    else await page.getByLabel('Overlay text').fill(marker)
    await page.getByRole('button', { name: 'Generate output' }).click()
    const text = await pdfText(await getDownload(page, download))
    expect(text[0]).toContain(marker)
  }
  await page.getByLabel('Annotation type').selectOption('rectangle')
  await page.getByRole('button', { name: 'Generate output' }).click()
  const rectangle = await getDownload(page, 'two-annotate.pdf')
  expect(rectangle.length).toBeGreaterThan(
    (await readFile(fixture('two.pdf'))).length,
  )
  await tool(page, 'compress-pdf')
  await upload(page, 'two.pdf')
  await page.getByRole('button', { name: 'Compress PDF', exact: true }).click()
  await expect(page.getByText(/Original kept/)).toBeVisible()
  expect(await getDownload(page, 'two.pdf')).toEqual(
    await readFile(fixture('two.pdf')),
  )
  const multi = await PDFDocument.create()
  const source = await multi.embedJpg(await readFile(fixture('document.jpg')))
  multi
    .addPage([350, 265])
    .drawImage(source, { x: 0, y: 0, width: 350, height: 265 })
  multi.setKeywords(['x'.repeat(170_000)])
  const input = Buffer.from(await multi.save())
  await page.locator('input[type=file]').setInputFiles({
    name: 'scan.pdf',
    mimeType: 'application/pdf',
    buffer: input,
  })
  await page.getByLabel('Compression mode').selectOption('target')
  await page.getByLabel('Target size', { exact: true }).fill('100')
  await page.getByRole('button', { name: 'Compress PDF', exact: true }).click()
  const out = await getDownload(page, 'scan-compressed.pdf')
  expect(out.length).toBeLessThan(input.length)
  expect(out.length).toBeLessThanOrEqual(100 * 1024)
  expect((await PDFDocument.load(out)).getPageCount()).toBe(1)
})
test('signature preparation and drawing export real pixels and format', async ({
  page,
}) => {
  await tool(page, 'prepare-signature')
  await upload(page, 'sample.png')
  await page.getByLabel('Crop aspect ratio').selectOption('1')
  await page.getByLabel('Width (px)').fill('120')
  await page.getByLabel('Height (px)').fill('60')
  await page.getByLabel('Required aspect ratio').fill('2')
  await page.getByLabel('Background').selectOption('transparent')
  await page.getByRole('button', { name: 'Process image' }).click()
  const png = await getDownload(page, 'sample-signature.png')
  expect(await imageProperties(page, png, 'image/png')).toMatchObject({
    width: 120,
    height: 60,
    alpha: 0,
    opaque: true,
  })
  await expect(page.getByText(/Meets configured requirements/)).toBeVisible()
  await page.getByLabel('Minimum size (KB)').fill('100')
  await page.getByRole('button', { name: 'Process image' }).click()
  await expect(page.getByText(/Below minimum size/).first()).toBeVisible()
  await tool(page, 'draw-signature')
  const canvas = page.getByLabel('Signature drawing area'),
    bounds = (await canvas.boundingBox())!
  const stroke = async (offset = 0) => {
    await page.mouse.move(bounds.x + 25, bounds.y + 25 + offset)
    await page.mouse.down()
    await page.mouse.move(bounds.x + 100, bounds.y + 35 + offset, { steps: 8 })
    await page.mouse.move(bounds.x + 190, bounds.y + 52 + offset, { steps: 8 })
    await page.mouse.up()
  }
  await stroke()
  await stroke(20)
  await page.getByRole('button', { name: 'Undo stroke' }).click()
  await page.getByRole('button', { name: 'Export PNG' }).click()
  expect(
    await imageProperties(
      page,
      await getDownload(page, 'signature.png'),
      'image/png',
    ),
  ).toMatchObject({ width: 1000, height: 350, alpha: 0, opaque: true })
  await page.getByRole('button', { name: 'Clear canvas' }).click()
  await expect(page.getByRole('button', { name: 'Export PNG' })).toBeDisabled()
})
test('Application Ready stores templates, rejects missing requirements, then exports verified files and a summary', async ({
  page,
}) => {
  await tool(page, 'application-ready')
  await page
    .getByLabel('Application template')
    .selectOption('Custom application')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Document label').fill('Photo')
  await page.getByLabel('Output filename').fill('college-photo')
  await page.getByLabel('Width (px)').fill('96')
  await page.getByLabel('Height (px)').fill('64')
  const formats = page.getByRole('group', { name: 'Accepted formats' })
  await formats.getByLabel('JPEG').uncheck()
  await formats.getByLabel('WEBP').uncheck()
  await formats.getByLabel('PDF').uncheck()
  await page.getByLabel('Maximum (KB)').fill('15')
  await page.getByLabel('Reusable template name').fill('My course photo')
  await page.getByRole('button', { name: 'Save local template' }).click()
  await expect(page.getByText('Template saved in this browser.')).toBeVisible()
  await page.reload()
  await page
    .getByLabel('Application template')
    .selectOption({ label: 'Saved · My course photo' })
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByLabel('Width (px)')).toHaveValue('96')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Prepare and validate' }).click()
  await expect(page.getByText('Missing', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await page.getByRole('button', { name: 'Back' }).click()
  await upload(page, 'document.jpg')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Prepare and validate' }).click()
  await expect(page.getByText('Valid', { exact: true })).toBeVisible()
  await page.screenshot({
    path: artifacts + '/application-validation.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Continue' }).click()
  const png = await getDownload(page, 'college-photo.png')
  expect(png.length).toBeLessThan(15 * 1024)
  expect(await imageProperties(page, png, 'image/png')).toMatchObject({
    width: 96,
    height: 64,
  })
  await page
    .getByRole('button', { name: 'Prepare ZIP with validation summary' })
    .click()
  const zip = await JSZip.loadAsync(
    await getDownload(page, 'application-ready.zip'),
  )
  expect(await zip.file('validation-summary.txt')!.async('string')).toContain(
    'Photo — Valid',
  )
  expect(await zip.file('college-photo.png')!.async('nodebuffer')).toEqual(png)
})
test('scanner straightens an image and builds a correctly ordered PDF', async ({
  page,
}) => {
  await tool(page, 'scan-document')
  await upload(page, ['document.jpg', 'sample.png'])
  await page.getByRole('button', { name: /Corner 1/ }).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await page.getByRole('button', { name: 'Preview page' }).click()
  await expect(page.getByAltText('Straightened page')).toBeVisible()
  await page.getByLabel('Rotate scan').selectOption('90')
  await page.getByLabel('Scan filter').selectOption('bw')
  await page.getByLabel('Export format').selectOption('images')
  await page.getByRole('button', { name: 'Generate scan' }).click()
  const first = await getDownload(page, 'scan-1.jpg')
  const shape = await imageProperties(page, first, 'image/jpeg')
  expect(shape.height).toBeGreaterThan(shape.width)
  expect(first[0]).toBe(255)
  await page.getByRole('button', { name: 'Move sample.png up' }).click()
  await page.getByLabel('Page to adjust').selectOption('0')
  await expect(page.getByLabel('Rotate scan')).toHaveValue('0')
  await page.getByRole('button', { name: 'Reset to full photo' }).click()
  await page.getByLabel('Export format').selectOption('pdf')
  await page.getByRole('button', { name: 'Generate scan' }).click()
  const pdf = await PDFDocument.load(
    await getDownload(page, 'document-scan.pdf'),
  )
  expect(pdf.getPageCount()).toBe(2)
  const images = pdf
    .getPage(0)
    .node.Resources()!
    .lookup(PDFName.of('XObject'), PDFDict)
  const firstImage = pdf.context.lookup(images.entries()[0][1], PDFRawStream)
  const sample = await imageProperties(
    page,
    await readFile(fixture('sample.png')),
    'image/png',
  )
  expect(
    firstImage.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber(),
  ).toBe(sample.width)
  expect(
    firstImage.dict.lookup(PDFName.of('Height'), PDFNumber).asNumber(),
  ).toBe(sample.height)
  await page.getByRole('button', { name: 'Remove document.jpg' }).click()
  await page.getByRole('button', { name: 'Generate scan' }).click()
  const remaining = await PDFDocument.load(
    await getDownload(page, 'document-scan.pdf'),
  )
  expect(remaining.getPageCount()).toBe(1)
})
test('local OCR recognizes English, Hindi, mixed text and PDF pages, then exports editable text', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const remote: string[] = [],
    responses: string[] = []
  page.on('request', (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith('http://127.0.0.1:4173/')
    )
      remote.push(r.url())
  })
  page.on('response', (r) => {
    if (r.url().includes('/ocr/')) responses.push(r.url())
  })
  await tool(page, 'ocr')
  const extract = async (name: string, lang: string) => {
    await upload(page, name)
    await page.getByLabel('OCR language').selectOption(lang)
    await page.getByRole('button', { name: 'Extract text' }).click()
    const box = page.getByRole('textbox', {
      name: 'Review or correct the text',
    })
    await expect(box).toBeVisible({ timeout: 40_000 })
    return box
  }
  await expect(await extract('english.png', 'eng')).toHaveValue(
    /DOCUMENT READY/i,
  )
  await expect(await extract('hindi.png', 'hin')).toHaveValue(/भारत.*देश/)
  const both = await extract('ocr.png', 'eng+hin')
  await expect(both).toHaveValue(/DOCUMENT READY/i)
  await expect(both).toHaveValue(/भारत.*देश/)
  const result = await extract('one.pdf', 'eng')
  await expect(result).toHaveValue(/Third Document Page/i)
  await result.fill('Corrected scan: Third Document Page')
  expect((await getDownload(page, 'one-text.txt')).toString()).toBe(
    'Corrected scan: Third Document Page',
  )
  expect(responses.some((x) => x.endsWith('eng.traineddata.gz'))).toBeTruthy()
  expect(responses.some((x) => x.endsWith('hin.traineddata.gz'))).toBeTruthy()
  expect(remote).toEqual([])
})
test('resume editing, layout and local draft export selectable text', async ({
  page,
}) => {
  await tool(page, 'resume')
  await page.getByLabel('Full name').fill('Alex Kumar')
  await page.getByLabel('Contact details').fill('alex@example.test')
  await page.getByLabel('Template').selectOption('Technical Resume')
  await page
    .getByRole('combobox', { name: 'Font', exact: true })
    .selectOption('mono')
  await page.getByLabel('Skills content').fill('TypeScript and document tools')
  await page.getByRole('button', { name: 'Move Skills up' }).click()
  await page.getByRole('button', { name: 'Add section' }).click()
  await page.getByLabel('Custom section content').fill('Verified sample work')
  await page.getByRole('button', { name: 'Save local draft' }).click()
  await expect(page.getByText('Draft saved in this browser.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Full name')).toHaveValue('Alex Kumar')
  await page.getByRole('button', { name: 'Generate resume PDF' }).click()
  const text = (
    await pdfText(await getDownload(page, 'Alex Kumar-resume.pdf'))
  )[0]
  expect(text).toContain('Alex Kumar')
  expect(text).toContain('TypeScript and document tools')
  expect(text).toContain('Verified sample work')
  await page.getByRole('button', { name: 'Delete saved draft' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Delete draft', exact: true }).click()
  await page.reload()
  await expect(page.getByLabel('Full name')).toHaveValue('')
})
test('file organizer verifies duplicates, safely renames ZIP entries and hashes files', async ({
  page,
}) => {
  await tool(page, 'organize')
  const buf = Buffer.from('abc')
  await page.locator('input[type=file]').setInputFiles([
    { name: 'a.txt', mimeType: 'text/plain', buffer: buf },
    { name: 'b.txt', mimeType: 'text/plain', buffer: buf },
  ])
  await page.getByRole('button', { name: 'Find duplicate contents' }).click()
  await expect(
    page.getByText('Duplicate contents', { exact: true }),
  ).toHaveCount(2)
  await page.getByLabel('Batch prefix').fill('job-')
  await page.getByRole('button', { name: 'Apply prefix' }).click()
  await page.getByLabel('Output filename').nth(1).fill('job-a.txt')
  await page.getByLabel('Sort by').selectOption('size')
  await page.getByLabel('Group by type').selectOption('yes')
  await page.getByRole('button', { name: 'Prepare ZIP' }).click()
  const archive = await JSZip.loadAsync(
    await getDownload(page, 'docready-files.zip'),
  )
  expect(Object.keys(archive.files)).toEqual(['job-a.txt', 'job-a-2.txt'])
  expect(await archive.file('job-a-2.txt')!.async('string')).toBe('abc')
  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Clear files' }).click()
  await expect(page.getByText('Choose files to get started.')).toBeVisible()
  await tool(page, 'hash-file')
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'a.txt', mimeType: 'text/plain', buffer: buf })
  await page.getByRole('button', { name: 'Calculate SHA-256' }).click()
  await expect(
    page.getByText(
      /ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/,
    ),
  ).toBeVisible()
})
test('saved preferences affect tools, opt-in recent history is searchable and settings clear explicitly', async ({
  page,
}) => {
  await page.goto('/settings')
  await page
    .getByRole('combobox', { name: 'Motion', exact: true })
    .selectOption('reduced')
  await page.getByLabel('Output format').selectOption('image/png')
  await page.getByLabel('Default PDF page size').selectOption('Letter')
  await page.getByLabel('Save recent tools on this browser').check()
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await expect(page.getByText('Settings saved.')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  await page.screenshot({
    path: artifacts + '/desktop-settings.png',
    fullPage: true,
    animations: 'disabled',
  })
  await tool(page, 'resize-image')
  await expect(page.getByLabel('Output format')).toHaveValue('image/png')
  await tool(page, 'image-to-pdf')
  await expect(page.getByLabel('Paper size')).toHaveValue('Letter')
  await page.keyboard.press('Control+k')
  await expect(page.getByText('Recent', { exact: true })).toHaveCount(2)
  await page.keyboard.press('Escape')
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Reset preferences' }).click()
  await page.getByRole('button', { name: 'Confirm clear' }).click()
  await expect(page.getByText('Preferences cleared.')).toBeVisible()
  await expect(
    page.getByLabel('Save recent tools on this browser'),
  ).not.toBeChecked()
})
test('installed service worker reopens tools and exports files offline', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBeTruthy()
  await context.setOffline(true)
  await page.goto('/tools/resize-image')
  await expect(page.getByText(/Offline · Cached tools/)).toBeVisible()
  await upload(page, 'sample.png')
  await page.getByRole('button', { name: 'Process image' }).click()
  const bytes = await getDownload(page, 'sample-resize.jpg')
  expect(bytes[0]).toBe(255)
})
test('a mobile touch viewport produces the same image download', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  try {
    await tool(page, 'resize-image')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Browse files' }).tap()
    await (await chooser).setFiles(fixture('sample.png'))
    await page.getByLabel('Width (px)').fill('60')
    await page.getByRole('button', { name: 'Process image' }).tap()
    const jpeg = await getDownload(page, 'sample-resize.jpg')
    expect(await imageProperties(page, jpeg, 'image/jpeg')).toMatchObject({
      width: 60,
      height: 40,
    })
  } finally {
    await context.close()
  }
})
test('cached Hindi OCR keeps working when the network goes offline', async ({
  page,
  context,
}) => {
  test.setTimeout(70_000)
  await tool(page, 'ocr')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBeTruthy()
  async function hindi() {
    await upload(page, 'hindi.png')
    await page.getByLabel('OCR language').selectOption('hin')
    await page.getByRole('button', { name: 'Extract text' }).click()
    await expect(
      page.getByRole('textbox', { name: 'Review or correct the text' }),
    ).toHaveValue(/भारत.*देश/, { timeout: 40_000 })
  }
  await hindi()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText(/Offline · Cached tools/)).toBeVisible()
  await hindi()
})

test('scanner captures and exports a frame from a simulated camera', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['camera'])
  await tool(page, 'scan-document')
  await page.getByRole('button', { name: 'Open camera' }).click()
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluate((video: HTMLVideoElement) => video.videoWidth),
    )
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Capture photo' }).click()
  await expect(page.getByAltText('Source document')).toBeVisible()
  await expect(page.locator('video')).toHaveCount(0)
  await page.getByLabel('Export format').selectOption('images')
  await page.getByRole('button', { name: 'Generate scan' }).click()
  const bytes = await getDownload(page, 'scan-1.jpg')
  expect(
    (await imageProperties(page, bytes, 'image/jpeg')).width,
  ).toBeGreaterThan(100)
})

test('PDF readers recover from damaged and encrypted input', async ({
  page,
}) => {
  await tool(page, 'preview-pdf')
  await upload(page, 'locked.pdf')
  await expect(page.getByRole('alert')).toContainText('password-protected')
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'damaged.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\ninvalid'),
    })
  await expect(page.getByRole('alert')).toContainText('Could not open this PDF')
  await upload(page, 'one.pdf')
  await expect(page.getByAltText('PDF page 1')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
