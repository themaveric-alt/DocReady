import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import JSZip from 'jszip'

async function download(page: Page, label: string, filename: string) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: label, exact: true }).click()
  const result = await pending
  expect(result.suggestedFilename()).toBe(filename)
  return readFile((await result.path())!)
}

test('OCR cleans and recognizes multiple PDF pages, then exports corrected Unicode text to Word and TXT', async ({
  page,
}) => {
  test.setTimeout(100_000)
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const line of ['FIRST PAGE DOCUMENT', 'SECOND PAGE DOCUMENT']) {
    pdf.addPage([450, 360]).drawText(line, { font, size: 25, x: 40, y: 270 })
  }
  await page.goto('/tools/ocr')
  await page.locator('input[type=file]').setInputFiles({
    name: 'two-page.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  })
  await page.getByRole('button', { name: 'Extract text' }).click()
  const result = page.getByLabel('Review or correct the text')
  await expect(result.or(page.getByRole('alert'))).toBeVisible({
    timeout: 45_000,
  })
  expect(await page.getByRole('alert').allTextContents()).toEqual([])
  await expect(result).toHaveValue(
    /Page 1\s+FIRST PAGE DOCUMENT\s+Page 2\s+SECOND PAGE DOCUMENT/i,
    { timeout: 60_000 },
  )
  const text =
    'Page 1\nClean & editable <copy>\n\nPage 2\nमेरा भारत महान है।\tEnglish + Hindi'
  await result.fill(text)
  const payload = await download(
    page,
    'Download Word (.docx)',
    'two-page-text.docx',
  )
  const docx = await JSZip.loadAsync(payload)
  expect(Object.keys(docx.files)).toContain('[Content_Types].xml')
  const document = await docx.file('word/document.xml')!.async('string')
  expect(document).toContain('Clean &amp; editable &lt;copy&gt;')
  expect(document).toContain('मेरा भारत महान है।')
  expect(document).toContain('<w:tab/>')
  const txt = await download(
    page,
    'Download two-page-text.txt',
    'two-page-text.txt',
  )
  expect(txt.toString()).toBe(text)
})

async function pixels(page: Page, bytes: Buffer) {
  return page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(
      new Blob([Uint8Array.from(atob(base64), (s) => s.charCodeAt(0))], {
        type: 'image/png',
      }),
    )
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let transparentIndex = -1,
      min = 255,
      max = 0
    for (let i = 3; i < rgba.length; i += 4) {
      min = Math.min(min, rgba[i])
      max = Math.max(max, rgba[i])
      if (rgba[i] === 0 && transparentIndex < 0) transparentIndex = i - 3
    }
    return {
      width: canvas.width,
      height: canvas.height,
      min,
      max,
      transparentIndex,
    }
  }, bytes.toString('base64'))
}
test('uses the local model, supports the comparison slider and downloads real transparent and solid PNGs', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(160_000)
  const requests: { url: string; method: string; body: string | null }[] = []
  const errors: string[] = []
  context.on('request', (r) =>
    requests.push({ url: r.url(), method: r.method(), body: r.postData() }),
  )
  page.on('pageerror', (err) => errors.push(err.message))
  await page.goto('/tools/remove-background')
  await expect(
    page.getByRole('heading', { name: 'AI Background Remover' }),
  ).toBeVisible()
  await page
    .getByLabel('Choose an image')
    .setInputFiles('tests/fixtures/document.jpg')
  await page
    .getByRole('button', { name: 'Remove background', exact: true })
    .click()
  await expect(page.getByRole('progressbar')).toBeVisible()
  const slider = page.getByRole('slider', {
    name: 'Compare the original and result',
  })
  await expect(slider.or(page.getByRole('alert'))).toBeVisible({
    timeout: 95_000,
  })
  expect(await page.getByRole('alert').allTextContents()).toEqual([])
  await expect(slider).toBeVisible()
  await slider.focus()
  await slider.press('End')
  await expect(slider).toHaveValue('100')
  await slider.press('Home')
  await expect(slider).toHaveValue('0')
  const transparent = await download(
    page,
    'Download transparent PNG',
    'document-transparent.png',
  )
  const cutout = await pixels(page, transparent)
  expect(cutout.min).toBeLessThan(64)
  expect(cutout.max).toBeGreaterThan(200)
  expect(cutout.transparentIndex).toBeGreaterThanOrEqual(0)
  await page.getByLabel('Background', { exact: true }).selectOption('solid')
  await page.getByLabel('Solid background color').fill('#d1295a')
  const solid = await download(
    page,
    'Download solid background PNG',
    'document-solid-background.png',
  )
  const opaque = await pixels(page, solid)
  expect([opaque.width, opaque.height]).toEqual([cutout.width, cutout.height])
  expect(opaque.min).toBe(255)
  const color = await page.evaluate(
    async ({ base64, pos }) => {
      const bitmap = await createImageBitmap(
        new Blob([Uint8Array.from(atob(base64), (s) => s.charCodeAt(0))], {
          type: 'image/png',
        }),
      )
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
        ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      return [...rgba.slice(pos, pos + 4)]
    },
    { base64: solid.toString('base64'), pos: cutout.transparentIndex },
  )
  expect(color).toEqual([209, 41, 90, 255])
  const http = requests.filter((r) => r.url.startsWith('http'))
  expect(
    http.some(
      (r) => r.url.includes('/background-assets/') && r.url.endsWith('.pack'),
    ),
  ).toBe(true)
  expect(
    http.every(
      (r) =>
        new URL(r.url).origin === new URL(baseURL!).origin &&
        r.method === 'GET' &&
        !r.body,
    ),
  ).toBe(true)
  const cached = await page.evaluate(async () =>
    [...(await (await caches.open('docready-background-v1')).keys())].map(
      (r) => r.url,
    ),
  )
  expect(cached.length).toBe(13)
  expect(
    cached.every(
      (url) =>
        url.includes('/background-assets/') ||
        url.includes('/translation-assets/ort-1.31/'),
    ),
  ).toBe(true)
  expect(errors).toEqual([])
})
