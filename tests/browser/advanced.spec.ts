import { expect, test, type Page } from '@playwright/test'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import JSZip from 'jszip'
import { mmToPoints } from '../../src/features/e-card-studio/printLayout'

function portrait(shift = 0) {
  const canvas = createCanvas(432, 648),
    ctx = canvas.getContext('2d')
  ctx.fillStyle = '#343f50'
  ctx.fillRect(0, 0, 432, 648)
  ctx.fillStyle = '#806347'
  ctx.fillRect(0, 0, 120, 648)
  ctx.fillStyle = '#5f4c48'
  ctx.beginPath()
  ctx.ellipse(216 + shift, 520, 170, 200, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#b9816f'
  ctx.fillRect(182 + shift, 270, 68, 55)
  ctx.fillStyle = '#b9816f'
  ctx.beginPath()
  ctx.ellipse(216 + shift, 208, 83, 112, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#302824'
  ctx.beginPath()
  ctx.ellipse(215 + shift, 133, 84, 46, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#342a24'
  ctx.fillRect(176 + shift, 205, 19, 7)
  ctx.fillRect(229 + shift, 201, 19, 7)
  return canvas
}
function orientJPG() {
  const app = new Uint8Array([
    0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a, 0,
    8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
  ])
  const raw = portrait().toBuffer('image/jpeg')
  return Buffer.concat([raw.subarray(0, 2), app, raw.subarray(2)])
}
const attachment = (name: string, buffer: Buffer, type = 'image/png') => ({
  name,
  buffer,
  mimeType: type,
})
async function choose(
  page: Page,
  label: string,
  buffer: Buffer,
  name = 'privacy-fixture.png',
  type = 'image/png',
) {
  await page
    .getByLabel(label, { exact: true })
    .setInputFiles(attachment(name, buffer, type))
}
async function clickFile(page: Page, button: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button, exact: true }).click(),
  ])
  expect(await download.failure()).toBeNull()
  return {
    name: download.suggestedFilename(),
    bytes: await readFile((await download.path())!),
  }
}
async function getPixels(bytes: Buffer) {
  const image = await loadImage(bytes),
    canvas = createCanvas(image.width, image.height),
    ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  return {
    width: image.width,
    height: image.height,
    at: (x: number, y: number) =>
      Array.from(ctx.getImageData(x, y, 1, 1).data),
    data: Buffer.from(ctx.getImageData(0, 0, image.width, image.height).data),
  }
}
async function makeText(lines: string[]) {
  const doc = await PDFDocument.create(),
    page = doc.addPage([595.28, 841.89]),
    font = await doc.embedFont(StandardFonts.Helvetica)
  lines.forEach((line, i) =>
    page.drawText(line, { x: 42, y: 780 - i * 23, font, size: 14 }),
  )
  return Buffer.from(await doc.save())
}
async function pdfText(bytes: Buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl:
      resolve('node_modules/pdfjs-dist/standard_fonts') + '/',
  })
  try {
    const pdf = await task.promise,
      chunks = []
    for (let i = 1; i <= pdf.numPages; i++)
      chunks.push(
        (await (await pdf.getPage(i)).getTextContent()).items
          .flatMap((x) => ('str' in x ? [x.str] : []))
          .join(' '),
      )
    return chunks
  } finally {
    await task.destroy()
  }
}
async function studio(page: Page, source = portrait().toBuffer('image/png')) {
  await page.goto('/printdesk')
  await choose(page, 'Choose a studio photo', source)
  await expect(page.getByAltText('Edited portrait preview')).toBeVisible({
    timeout: 20000,
  })
}

test('homepage showcases the six functional advanced routes', async ({
  page,
}) => {
  await page.goto('/')
  const deck = page.getByLabel('Advanced workstations')
  await expect(deck.locator('a')).toHaveCount(6)
  const routes = [
    '/printdesk',
    '/tools/document-doctor',
    '/tools/smart-application-pack',
    '/tools/workflow-automation',
    '/tools/bilingual-composer',
    '/tools/smart-form-assistant',
  ]
  expect(
    await deck
      .locator('a')
      .evaluateAll((list) => list.map((a) => a.getAttribute('href'))),
  ).toEqual(routes)
  await page.setViewportSize({ width: 360, height: 800 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360)
  await deck.getByRole('link', { name: /PrintDesk Pro/ }).click()
  await expect(
    page.getByRole('heading', { name: 'PrintDesk Pro' }),
  ).toBeVisible()
})
test('photo orientation, tone correction, crop, history, compare and PNG export are real', async ({
  page,
}) => {
  await page.goto('/printdesk')
  await choose(
    page,
    'Choose a studio photo',
    orientJPG(),
    'orientation-test.jpg',
    'image/jpeg',
  )
  await expect(
    page.getByText('6 · applied by decoder', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('648 × 432 px', { exact: true })).toBeVisible()
  const plain = await getPixels(
    (await clickFile(page, 'Download edited photo')).bytes,
  )
  expect([plain.width, plain.height]).toEqual([648, 432])
  await page.getByRole('button', { name: 'Auto Fix My Photo' }).click()
  const brighter = await getPixels(
    (await clickFile(page, 'Download edited photo')).bytes,
  )
  expect(brighter.data.equals(plain.data)).toBe(false)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(
    (
      await getPixels((await clickFile(page, 'Download edited photo')).bytes)
    ).data.equals(plain.data),
  ).toBe(true)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page
    .getByRole('button', { name: 'Crop & Rotate', exact: true })
    .click()
  await page.getByLabel('Crop ratio', { exact: true }).selectOption('1')
  await page.getByRole('button', { name: 'Rotate right' }).click()
  const square = await getPixels(
    (await clickFile(page, 'Download edited photo')).bytes,
  )
  expect([square.width, square.height]).toEqual([432, 432])
  await page
    .getByRole('slider', { name: 'Compare original and edited' })
    .fill('45')
  await expect(page.getByAltText('Edited portrait preview')).toHaveAttribute(
    'style',
    /55%/,
  )
})
test('studio outfit library has 40 actionable previews, preserves the face and requires approval', async ({
  page,
}) => {
  await studio(page, portrait(-18).toBuffer('image/png'))
  const original = await getPixels(
    (await clickFile(page, 'Download edited photo')).bytes,
  )
  await page.getByRole('button', { name: 'Outfits', exact: true }).click()
  const category = page.getByLabel('Outfit category')
  const names: string[] = []
  for (let n = 0; n < 4; n++) {
    await category.selectOption(String(n))
    const buttons = page.locator('.outfit-grid button')
    await expect(buttons).toHaveCount(10)
    names.push(...(await buttons.allTextContents()))
    for (const button of await buttons.all()) {
      await button.click()
      await expect(button).toHaveAttribute('aria-pressed', 'true')
    }
  }
  expect(new Set(names).size).toBe(40)
  await category.selectOption('0')
  await page
    .getByRole('button', { name: 'Navy business', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Download edited photo' }),
  ).toBeDisabled()
  await page
    .getByRole('slider', { name: 'Adjust shoulder width' })
    .fill('0.87')
  await page
    .getByRole('slider', { name: 'Move outfit horizontally' })
    .fill('0.46')
  await page.getByLabel('Approve outfit for export').check()
  const fitted = await getPixels(
    (await clickFile(page, 'Download edited photo')).bytes,
  )
  expect(fitted.at(175, 200)).toEqual(original.at(175, 200))
  expect(fitted.at(138, 484)).not.toEqual(original.at(138, 484))
  await page
    .getByRole('button', { name: 'Protect original hair and details' })
    .click()
  const painter = page.getByAltText(
    'Original photo for painting a localized correction',
  )
  await painter.scrollIntoViewIfNeeded()
  const area = (await painter.boundingBox())!
  await page.mouse.click(
    area.x + (area.width * 138) / 432,
    area.y + (area.height * 484) / 648,
  )
  await expect(
    page.getByRole('button', { name: 'Download edited photo' }),
  ).toBeDisabled()
  await page.getByLabel('Approve outfit for export').check()
  const protectedSource = await getPixels(
    (await clickFile(page, 'Download edited photo')).bytes,
  )
  expect(protectedSource.at(138, 484)).toEqual(original.at(138, 484))
  await page.getByRole('button', { name: 'Remove outfit' }).click()
  expect(
    (
      await getPixels((await clickFile(page, 'Download edited photo')).bytes)
    ).data.equals(original.data),
  ).toBe(true)
})
test('manual background paint and local model produce changed alpha and solid exported pixels', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90000)
  const requests: { url: string; method: string; data: string | null }[] = []
  context.on('request', (r) =>
    requests.push({ url: r.url(), method: r.method(), data: r.postData() }),
  )
  await studio(page)
  await page.getByRole('button', { name: 'Background', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Remove background locally' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Manual mask' }).click()
  const brush = page.getByAltText(
    'Original photo for painting a localized correction',
  )
  await brush.scrollIntoViewIfNeeded()
  const box = (await brush.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.18, box.y + box.height * 0.22)
  await expect(page.getByLabel('Background treatment')).toHaveValue(
    'transparent',
  )
  const hole = await getPixels(
    (await clickFile(page, 'Download edited photo')).bytes,
  )
  expect(
    hole.at(Math.round(hole.width * 0.18), Math.round(hole.height * 0.22))[3],
  ).toBeLessThan(100)
  await page.getByRole('button', { name: 'Light Blue', exact: true }).click()
  const solid = await getPixels(
    (await clickFile(page, 'Download edited photo')).bytes,
  )
  expect(
    solid.at(Math.round(solid.width * 0.18), Math.round(solid.height * 0.22)),
  ).toEqual([204, 226, 244, 255])
  await choose(
    page,
    'Choose a studio photo',
    await readFile('tests/fixtures/document.jpg'),
    'privacy-fixture.jpg',
    'image/jpeg',
  )
  await expect(page.getByAltText('Edited portrait preview')).toBeVisible({
    timeout: 20000,
  })
  await page.getByLabel('Advanced Local AI').check()
  await page
    .getByRole('button', { name: 'Remove background locally' })
    .click()
  await expect(page.getByText(/Background mask ready/)).toBeVisible({
    timeout: 50000,
  })
  const cut = await getPixels(
    (await clickFile(page, 'Download edited photo')).bytes,
  )
  expect(cut.data.some((alpha, i) => i % 4 === 3 && alpha < 100)).toBe(true)
  expect(requests.some((r) => r.url.includes('/background-assets/'))).toBe(
    true,
  )
  expect(
    requests
      .filter((r) => r.url.startsWith('http'))
      .every(
        (r) =>
          new URL(r.url).origin === new URL(baseURL!).origin &&
          r.method === 'GET' &&
          !r.data &&
          !r.url.includes('privacy-fixture'),
      ),
  ).toBe(true)
  const stored = await context.storageState({ indexedDB: true })
  expect(JSON.stringify(stored)).not.toContain('privacy-fixture')
})
test('passport and batch previews produce exact A4 and 4 by 6 inch outputs', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await studio(page)
  await page
    .getByRole('button', { name: 'Passport Photo Maker', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Print & Export', exact: true })
    .click()
  await page.getByRole('button', { name: 'Crop to the print ratio' }).click()
  await expect(
    page.getByLabel('Actual photo placement preview'),
  ).toBeVisible()
  const portraitPNG = await getPixels(
    (await clickFile(page, 'Download edited photo')).bytes,
  )
  expect([portraitPNG.width, portraitPNG.height]).toEqual([413, 531])
  const print = await PDFDocument.load(
    (await clickFile(page, 'Download print-ready PDF')).bytes,
  )
  expect(print.getPageCount()).toBe(1)
  expect(print.getPage(0).getWidth()).toBeCloseTo(mmToPoints(210), 6)
  expect(print.getPage(0).getHeight()).toBeCloseTo(mmToPoints(297), 6)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  if (process.env.DOCREADY_QA_SCREENSHOTS)
    await page
      .locator('.photo-editor')
      .screenshot({ path: info.outputPath('printdesk-mobile.png') })
  await page.getByRole('button', { name: 'Batch Print Layout' }).click()
  await choose(
    page,
    'Select batch photos',
    portrait(23).toBuffer('image/png'),
  )
  await page
    .getByLabel('Paper size', { exact: true })
    .selectOption('4 × 6 inches')
  await page.getByRole('button', { name: 'Prepare PDF', exact: true }).click()
  const batch = await PDFDocument.load(
    (await clickFile(page, 'Download docready-photo-sheet.pdf')).bytes,
  )
  expect(batch.getPage(0).getWidth()).toBeCloseTo(288, 7)
  expect(batch.getPage(0).getHeight()).toBeCloseTo(432, 7)
  await page.getByRole('button', { name: 'Print Quality Inspector' }).click()
  await page.getByRole('button', { name: 'Inspect quality' }).click()
  await expect(page.getByText(/Effective print resolution/)).toBeVisible()
})
test('Document Doctor measures a file, applies rotation and exposes a real corrected PDF', async ({
  page,
}) => {
  await page.goto('/tools/document-doctor')
  await choose(
    page,
    'Choose document to diagnose',
    await makeText(['A readable diagnostic fixture.']),
    'diagnostic.pdf',
    'application/pdf',
  )
  await page.getByRole('button', { name: 'Run diagnostics' }).click()
  await expect(
    page.getByAltText('Original first-page or image preview'),
  ).toBeVisible()
  await page.getByLabel('Rotate clockwise').selectOption('90')
  await page.getByRole('button', { name: 'Apply fixes' }).click()
  await expect(
    page.getByAltText('Corrected first-page preview'),
  ).toBeVisible()
  const doc = await PDFDocument.load(
    (await clickFile(page, 'Download diagnostic-corrected.pdf')).bytes,
  )
  expect(doc.getPage(0).getRotation().angle).toBe(90)
  await page.getByRole('button', { name: 'Undo fixes' }).click()
  await expect(
    page.getByAltText('Original first-page or image preview'),
  ).toBeVisible()
})
test('Smart Application Pack finds measured PDF notice requirements and exports a validated ZIP', async ({
  page,
}) => {
  await page.goto('/tools/smart-application-pack')
  const pdf = await makeText([
    'Photograph: JPEG, 240 x 160 px, max 200 KB.',
    'Signature: PNG, 95 x 35 px, max 50 KB.',
  ])
  await choose(
    page,
    'Choose the application notice',
    pdf,
    'notice.pdf',
    'application/pdf',
  )
  await page.getByRole('button', { name: 'Read notification' }).click()
  await expect(page.getByText(/240 × 160 px · max 200 KB/)).toBeVisible()
  await page.getByLabel('Signature', { exact: true }).uncheck()
  await page
    .getByRole('button', { name: 'Review selected requirements' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Requirements', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page
    .getByLabel('Upload Photograph', { exact: true })
    .setInputFiles('tests/fixtures/sample.png')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page
    .getByRole('button', { name: 'Prepare and validate', exact: true })
    .click()
  await expect(page.getByText('Valid', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page
    .getByRole('button', {
      name: 'Prepare ZIP with validation summary',
      exact: true,
    })
    .click()
  const zipButton = page.getByRole('button', {
    name: 'Download application-ready.zip',
    exact: true,
  })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    zipButton.click(),
  ])
  const archive = await JSZip.loadAsync(
    await readFile((await download.path())!),
  )
  const image = Object.values(archive.files).find((entry) =>
    entry.name.endsWith('.jpg'),
  )
  expect(image).toBeTruthy()
  const pixels = await getPixels(await image!.async('nodebuffer'))
  expect([pixels.width, pixels.height]).toEqual([240, 160])
})
test('workflow saves operations, merges PDFs and writes actual page numbers', async ({
  page,
}) => {
  await page.goto('/tools/workflow-automation')
  await page
    .getByLabel('Choose workflow inputs', { exact: true })
    .setInputFiles(['tests/fixtures/one.pdf', 'tests/fixtures/two.pdf'])
  await page
    .getByLabel('Start from a workflow')
    .selectOption('PDF merge & page numbering')
  await page.getByLabel('First page number').fill('12')
  await page.getByLabel('Workflow name').fill('Number merged papers')
  await page.getByRole('button', { name: 'Save workflow settings' }).click()
  await page.getByRole('button', { name: 'Run workflow' }).click()
  const file = await clickFile(page, 'Download docready-merged.pdf')
  expect(await pdfText(file.bytes)).toHaveLength(3)
  expect((await pdfText(file.bytes))[0]).toMatch(/12\s*$/)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Load Number merged papers' }),
  ).toBeVisible()
  await expect(page.getByText('one.pdf', { exact: false })).toHaveCount(0)
})
test('composer exports edited Hindi and English as selectable Unicode', async ({
  page,
}) => {
  await page.goto('/tools/bilingual-composer')
  await page
    .getByLabel('Document category')
    .selectOption({ label: 'Leave request' })
  await page.getByLabel('Your name').fill('Example Person')
  await page
    .getByLabel('Facts or message in English')
    .fill('Please approve my leave for the stated dates.')
  await page
    .getByLabel('तथ्य या संदेश हिंदी में')
    .fill('कृपया विद्यालय में मेरा अवकाश स्वीकृत करें।')
  await page.getByRole('button', { name: 'Build editable draft' }).click()
  await expect(page.getByLabel('Editable document preview')).toHaveValue(
    /विद्यालय/,
  )
  await page.getByRole('button', { name: 'Prepare Unicode PDF' }).click()
  const file = await clickFile(
    page,
    'Download docready-composed-document.pdf',
  )
  const text = (await pdfText(file.bytes)).join(' ').replace(/\s+/gu, ' ')
  expect(text).toContain('Please approve my leave')
  expect(text.normalize()).toContain('विद्यालय')
  expect((await clickFile(page, 'Download TXT')).bytes.toString()).toContain(
    'स्वीकृत',
  )
})
test('form assistant fills real field values and exports a separate flat-form worksheet', async ({
  page,
}) => {
  const doc = await PDFDocument.create(),
    paper = doc.addPage([595, 842]),
    form = doc.getForm()
  form
    .createTextField('Applicant name')
    .addToPage(paper, { x: 60, y: 700, width: 250, height: 32 })
  form
    .createCheckBox('Include enclosure')
    .addToPage(paper, { x: 60, y: 625, width: 20, height: 20 })
  const select = form.createDropdown('Preferred region')
  select.addOptions(['Central', 'Coastal'])
  select.addToPage(paper, { x: 60, y: 560, width: 150, height: 22 })
  await page.goto('/tools/smart-form-assistant')
  await choose(
    page,
    'Choose a PDF form',
    Buffer.from(await doc.save()),
    'form.pdf',
    'application/pdf',
  )
  await page.getByRole('button', { name: 'Find PDF fields' }).click()
  await expect(page.getByText('3 editable fields found.')).toBeVisible()
  await page.getByLabel('Applicant name').fill('Synthetic Applicant')
  await page.getByLabel('Include enclosure').check()
  await page.getByLabel('Preferred region').selectOption('Central')
  await page
    .getByRole('button', { name: 'Preview and prepare filled PDF' })
    .click()
  await expect(page.getByAltText('Filled PDF page')).toBeVisible()
  const completed = await PDFDocument.load(
    (await clickFile(page, 'Download form-completed.pdf')).bytes,
  )
  expect(completed.getForm().getTextField('Applicant name').getText()).toBe(
    'Synthetic Applicant',
  )
  expect(
    completed.getForm().getCheckBox('Include enclosure').isChecked(),
  ).toBe(true)
  expect(
    completed.getForm().getDropdown('Preferred region').getSelected(),
  ).toEqual(['Central'])
  await choose(
    page,
    'Choose a PDF form',
    await makeText(['A flat form for testing with readable source text.']),
    'flat.pdf',
    'application/pdf',
  )
  await page.getByRole('button', { name: 'Find PDF fields' }).click()
  await page
    .getByRole('button', { name: 'Extract reference text with local OCR' })
    .click()
  await expect(page.getByLabel('Editable worksheet')).toHaveValue(
    /flat form for testing/,
  )
  const worksheet = await clickFile(page, 'Download worksheet')
  expect(worksheet.bytes.toString()).toContain('Answers to enter')
})

test('Lite software fallback exports a restored photo when worker canvas is unavailable', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'OffscreenCanvas', { value: undefined })
    Object.defineProperty(navigator, 'deviceMemory', { value: 2 })
  })
  const session = await context.newCDPSession(page)
  await studio(page, portrait(22).toBuffer('image/png'))
  const start = await session.send('Runtime.getHeapUsage')
  const mark = Date.now()
  const first = await getPixels(
    (await clickFile(page, 'Download edited photo')).bytes,
  )
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await page.getByRole('button', { name: 'Restore faded tones' }).click()
  await page
    .getByRole('button', { name: 'Paint small scratch cleanup' })
    .click()
  const painting = page.getByAltText(
    'Original photo for painting a localized correction',
  )
  await painting.scrollIntoViewIfNeeded()
  const region = (await painting.boundingBox())!
  await page.mouse.click(
    region.x + region.width * 0.25,
    region.y + region.height * 0.12,
  )
  const second = await getPixels(
    (await clickFile(page, 'Download edited photo')).bytes,
  )
  expect(second.data.equals(first.data)).toBe(false)
  expect([second.width, second.height]).toEqual([432, 648])
  const end = await session.send('Runtime.getHeapUsage')
  console.log(
    'Lite Chromium fixture sample',
    JSON.stringify({
      elapsedMs: Date.now() - mark,
      rendererHeapBytesBefore: start.usedSize,
      rendererHeapBytesAfter: end.usedSize,
    }),
  )
  await page.getByLabel('Advanced Local AI').click()
  await expect(
    page.getByText(/lacks worker canvas or WebAssembly/),
  ).toBeVisible()
})
