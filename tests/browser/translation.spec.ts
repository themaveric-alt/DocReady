import { test, expect, type Browser, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDict, PDFDocument, PDFName, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import {
  addSearchLayer,
  searchFonts,
} from '../../src/features/translation/pdf-translator/pdfSearchLayer'

async function sourceFor(
  page: Page,
  data: Buffer,
  name: string,
  mimeType: string,
) {
  await page
    .locator('input[type=file]')
    .setInputFiles({ buffer: data, name, mimeType })
}
async function clickDownload(page: Page, name: string) {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name, exact: true }).click()
  const download = await event
  expect(await download.failure()).toBeNull()
  return readFile((await download.path())!)
}
async function translate(page: Page, label: string) {
  await page.getByRole('button', { name: 'Translate remaining text' }).click()
  await expect(
    page.getByRole('textbox', { name: label, exact: true }),
  ).not.toHaveValue('', { timeout: 90000 })
  await expect(
    page
      .getByText('Translation is ready to review.', { exact: false })
      .first(),
  ).toBeVisible({ timeout: 90000 })
}
async function readPDF(data: Buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    standardFontDataUrl:
      resolve('node_modules/pdfjs-dist/standard_fonts') + '/',
  })
  const doc = await task.promise
  try {
    const text = []
    for (let i = 1; i <= doc.numPages; i++)
      text.push(
        (await (await doc.getPage(i)).getTextContent()).items
          .flatMap((item) => ('str' in item ? [item.str] : []))
          .join(' '),
      )
    return text
  } finally {
    await task.destroy()
  }
}
const unicode =
  'नमस्कार। हिंदी अनुवाद। मेरा भारत महान है। कृपया दस्तावेज़ पढ़ें। विद्यालय में शिक्षा आवश्यक है। क्षमा, त्रिकोण, ज्ञान, श्रद्धा। क्रिया, प्रक्रिया, विद्यार्थी। DocReadyApp 123'
async function hindiDocument(browser: Browser) {
  const tab = await browser.newPage()
  try {
    const font = await readFile(
      'node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2',
      'base64',
    )
    const sample = 'कृपया खिड़की बंद मत करो। विद्यालय में शिक्षा आवश्यक है।'
    await tab.setViewportSize({ width: 595, height: 842 })
    await tab.setContent(
      `<meta charset="utf-8"><style>@font-face{font-family:test;src:url(data:font/woff2;base64,${font})}body{font:17px test,Arial;margin:44px}</style><p>${sample}</p>`,
    )
    await tab.evaluate(() => document.fonts.ready)
    const pdf = await PDFDocument.create(),
      page = pdf.addPage([595, 842])
    const visual = await pdf.embedPng(await tab.screenshot())
    page.drawImage(visual, { x: 0, y: 0, width: 595, height: 842 })
    pdf.registerFontkit(fontkit)
    const fonts = await searchFonts(pdf, [
      await pdf.embedFont(
        await readFile('public/assets/fonts/NotoSans-Regular.ttf'),
      ),
      await pdf.embedFont(
        await readFile('public/assets/fonts/NotoSansDevanagari-Regular.ttf'),
      ),
    ])
    addSearchLayer(
      pdf,
      page,
      [{ text: sample, x: 44, baseline: 75, width: 430, size: 17 }],
      fonts,
    )
    return Buffer.from(await pdf.save())
  } finally {
    await tab.close()
  }
}

test('English PDF translates in a worker, preserves tables and identifiers, and downloads selectable Hindi', async ({
  page,
  context,
}) => {
  test.setTimeout(150000)
  const outgoing: string[] = []
  context.on('request', (r) => {
    const url = new URL(r.url())
    if (url.protocol === 'http:' || url.protocol === 'https:')
      if (
        url.origin !== 'http://127.0.0.1:4173' ||
        r.method() !== 'GET' ||
        r.postData() ||
        url.search.includes('PRIVATE-MARKER')
      )
        outgoing.push(r.method() + ' ' + url.origin)
  })
  const src = await PDFDocument.create(),
    font = await src.embedFont(StandardFonts.Helvetica)
  const one = src.addPage([595, 842])
  one.drawText('Education is necessary in school.', {
    x: 50,
    y: 735,
    size: 17,
    font,
  })
  for (let i = 0; i < 3; i++) {
    one.drawText('Item ' + (i + 1), {
      x: 50,
      y: 660 - i * 23,
      font,
      size: 12,
    })
    one.drawText('AB-' + (41 + i), {
      x: 320,
      y: 660 - i * 23,
      font,
      size: 12,
    })
  }
  const two = src.addPage([595, 842])
  two.drawText('Do not close the window. PRIVATE-MARKER-99', {
    x: 50,
    y: 730,
    font,
    size: 15,
  })
  await page.goto('/tools/pdf-translator')
  await sourceFor(
    page,
    Buffer.from(await src.save()),
    'translation-fixture.pdf',
    'application/pdf',
  )
  await page.getByLabel('Translate from').selectOption('en')
  await page
    .getByRole('button', { name: 'Extract text', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Original text 1', exact: true }),
  ).toHaveValue(/Education/)
  await translate(page, 'Translated text 1')
  await expect(
    page.getByRole('textbox', { name: 'Translated text 1', exact: true }),
  ).toHaveValue(/शिक्षा/)
  await expect(
    page.locator('.translation-review td').filter({ hasText: 'AB-42' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(
    page.getByRole('textbox', { name: 'Translated text 1', exact: true }),
  ).toHaveValue(/(?:नहीं|मत).*PRIVATE-MARKER-99/u)
  await page.getByRole('button', { name: 'Previous page' }).click()
  await page
    .getByRole('textbox', { name: 'Translated text 1', exact: true })
    .fill(unicode)
  await page.getByLabel('Document layout').selectOption('bilingual-columns')
  await expect(
    page.getByRole('textbox', { name: 'Translated text 1', exact: true }),
  ).toHaveValue(unicode)
  await expect(
    page.locator('.translation-review .translation-bilingual'),
  ).toBeVisible()
  await page.getByLabel('Document layout').selectOption('reflow')
  const html = (await clickDownload(page, 'Download HTML')).toString('utf8')
  expect(html).toContain(unicode)
  expect(html).toContain('data:font/woff2;base64,')
  const txt = (await clickDownload(page, 'Download TXT')).toString('utf8')
  expect(txt).toContain(unicode)
  const printed = await clickDownload(page, 'Download translated PDF')
  const { context: pdfContext } = await PDFDocument.load(printed)
  expect(
    pdfContext
      .enumerateIndirectObjects()
      .filter(
        ([, object]) =>
          object instanceof PDFDict && object.has(PDFName.of('FontFile2')),
      ),
  ).toHaveLength(2)
  const { writeFile } = await import('node:fs/promises')
  await writeFile('/tmp/docready-hindi-translation-proof.pdf', printed)
  const pages = await readPDF(printed)
  expect(pages).toHaveLength(2)
  const copy = pages[0].replaceAll(/\s+/gu, ' ').normalize('NFC')
  for (const phrase of [
    'नमस्कार',
    'हिंदी अनुवाद',
    'मेरा भारत महान है',
    'दस्तावेज़ पढ़ें',
    'क्षमा',
    'त्रिकोण',
    'ज्ञान',
    'श्रद्धा',
    'विद्यार्थी',
    'DocReadyApp 123',
  ])
    expect(copy).toContain(phrase.normalize('NFC'))
  expect(outgoing).toEqual([])
  const storage = await page.evaluate(() =>
    [...Object.values(localStorage), ...Object.values(sessionStorage)].join(
      '\n',
    ),
  )
  expect(storage).not.toContain('PRIVATE-MARKER-99')
  expect(storage).not.toContain('त्रिकोण')
})

test('native Hindi PDF and scanned page both translate using the correct extraction path', async ({
  page,
  browser,
}) => {
  test.setTimeout(160000)
  await page.goto('/tools/pdf-translator')
  await page.getByLabel('Translate to').selectOption('en')
  await page.getByLabel('Translate from').selectOption('hi')
  await sourceFor(
    page,
    await hindiDocument(browser),
    'hindi-source.pdf',
    'application/pdf',
  )
  await page
    .getByRole('button', { name: 'Extract text', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Original text 1', exact: true }),
  ).toHaveValue(/खिड़की/u)
  await translate(page, 'Translated text 1')
  await expect(
    page.getByRole('textbox', { name: 'Translated text 1', exact: true }),
  ).toHaveValue(/(?:do not|don't).*window/iu)
  const document = await PDFDocument.create()
  const image = await document.embedPng(
    await readFile('tests/fixtures/english.png'),
  )
  document
    .addPage([430, 110])
    .drawImage(image, { x: 0, y: 0, width: 430, height: 110 })
  await sourceFor(
    page,
    Buffer.from(await document.save()),
    'scan.pdf',
    'application/pdf',
  )
  await page.getByLabel('Translate from').selectOption('en')
  await page.getByLabel('OCR language').selectOption('eng')
  await page
    .getByRole('button', { name: 'Extract text', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Original text 1', exact: true }),
  ).toHaveValue(/DOCUMENT READY/i, { timeout: 60000 })
  await translate(page, 'Translated text 1')
  await expect(
    page.getByRole('textbox', { name: 'Translated text 1', exact: true }),
  ).toHaveValue(/(?:दस्ताव[ेेज़ज़]|तैयार)/u)
})

test('image translator recognizes both scripts, keeps edits, and downloads PNG, JPEG and PDF', async ({
  page,
}) => {
  test.setTimeout(180000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tools/image-translator')
  await page.getByLabel('Translate from').selectOption('en')
  await page.getByLabel('OCR language').selectOption('eng')
  await page
    .locator('input[type=file]')
    .setInputFiles(resolve('tests/fixtures/english.png'))
  await page
    .getByRole('button', { name: 'Extract text', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Original text 1', exact: true }),
  ).toHaveValue(/DOCUMENT READY/i, { timeout: 60000 })
  await translate(page, 'Translated text 1')
  const translated = page.getByRole('textbox', {
    name: 'Translated text 1',
    exact: true,
  })
  await expect(translated).toHaveValue(/दस्तावेज़|तैयार/u)
  await translated.fill('दस्तावेज़ तैयार है। श्रद्धा 123')
  await page.getByLabel('Image layout').selectOption('captions')
  await expect(translated).toHaveValue('दस्तावेज़ तैयार है। श्रद्धा 123')
  await expect(
    page.getByAltText('Preview of the translated image'),
  ).toBeVisible()
  const png = await clickDownload(page, 'Download translated image')
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect(png.includes(Buffer.from('pHYs'))).toBeTruthy()
  expect(png.readUInt32BE(16)).toBe(1050)
  expect(png.readUInt32BE(20)).toBeGreaterThan(250)
  await page.getByLabel('Image output format').selectOption('image/jpeg')
  const jpeg = await clickDownload(page, 'Download translated image')
  expect([...jpeg.subarray(0, 3)]).toEqual([255, 216, 255])
  await page.getByLabel('Image output format').selectOption('application/pdf')
  expect(
    (
      await PDFDocument.load(
        await clickDownload(page, 'Download translated image'),
      )
    ).getPageCount(),
  ).toBe(1)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await page
    .locator('input[type=file]')
    .setInputFiles(resolve('tests/fixtures/hindi.png'))
  await page.getByLabel('Translate from').selectOption('hi')
  await page.getByLabel('OCR language').selectOption('hin')
  await page
    .getByRole('button', { name: 'Extract text', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Original text 1', exact: true }),
  ).toHaveValue(/भारत/u, { timeout: 60000 })
  await translate(page, 'Translated text 1')
  await expect(translated).toHaveValue(/India|Bharat/i)
  await page.getByRole('button', { name: 'Add manual text box' }).click()
  await expect(
    page.getByRole('textbox', { name: 'Original text 2', exact: true }),
  ).toBeVisible()
  const blank = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 125
    canvas.height = 80
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 125, 80)
    return canvas.toDataURL().split(',')[1]
  })
  await sourceFor(
    page,
    Buffer.from(blank, 'base64'),
    'blank.png',
    'image/png',
  )
  await page
    .getByRole('button', { name: 'Extract text', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'could not locate readable text',
  )
})

test('saving static model assets enables offline inference and removal', async ({
  page,
  context,
}) => {
  test.setTimeout(180000)
  await page.goto('/tools/image-translator')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true)
  await page.getByLabel('Translate from').selectOption('en')
  await page.getByRole('button', { name: 'Save offline' }).click()
  await expect(
    page.getByText('Saved for offline use', { exact: false }),
  ).toBeVisible({ timeout: 100000 })
  const contents = await page.evaluate(async () => {
    const store = await caches.open('docready-translation-assets-v2')
    return (await store.keys()).map((row) => new URL(row.url).pathname)
  })
  expect(contents.length).toBeGreaterThan(5)
  expect(
    contents.every((item) => item.startsWith('/translation-assets/')),
  ).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(
    page.getByText('Saved for offline use', { exact: false }),
  ).toBeVisible()
  await page
    .locator('input[type=file]')
    .setInputFiles(resolve('tests/fixtures/english.png'))
  await page.getByLabel('Translate from').selectOption('en')
  await page.getByRole('button', { name: 'Add manual text box' }).click()
  await page
    .getByRole('textbox', { name: 'Original text 1', exact: true })
    .fill('Education is necessary in school.')
  await translate(page, 'Translated text 1')
  await expect(
    page.getByRole('textbox', { name: 'Translated text 1', exact: true }),
  ).toHaveValue(/शिक्षा/u)
  await page.getByRole('button', { name: 'Remove model' }).click()
  await expect(
    page.getByText('Available to load', { exact: false }),
  ).toBeVisible()
})

test('image translation joins wrapped OCR lines and stays inside the scanned region', async ({
  page,
}) => {
  await page.goto('/tools/image-translator')
  await page.getByLabel('OCR language').selectOption('eng')
  const input = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 330
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#e3ebf6'
    ctx.fillRect(0, 0, 900, 330)
    ctx.fillStyle = '#1a2740'
    ctx.font = '42px sans-serif'
    ctx.fillText('Please read the complete', 64, 105)
    ctx.fillText('document before signing.', 64, 149)
    return canvas.toDataURL().split(',')[1]
  })
  await sourceFor(
    page,
    Buffer.from(input, 'base64'),
    'wrapped.png',
    'image/png',
  )
  await page
    .getByRole('button', { name: 'Extract text', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Original text 1', exact: true }),
  ).toHaveValue('Please read the complete document before signing.')
  await expect(
    page.getByRole('textbox', { name: 'Original text 2', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('textbox', { name: 'Translated text 1', exact: true })
    .fill('कृपया पूरा दस्तावेज़ पढ़ें।')
  await expect(
    page.getByAltText('Preview of the translated image'),
  ).toBeVisible()
  await page
    .locator('.translation-review-grid')
    .screenshot({ path: '/tmp/docready-image-translator-visual.png' })
  const pixels = await page
    .getByAltText('Preview of the translated image')
    .evaluate((image: HTMLImageElement) => {
      const canvas = document.createElement('canvas')
      canvas.width = 900
      canvas.height = 330
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      return {
        originalTextArea: [...ctx.getImageData(68, 88, 1, 1).data],
        unaffected: [...ctx.getImageData(25, 25, 1, 1).data],
      }
    })
  expect(pixels.originalTextArea).toEqual([227, 235, 246, 255])
  expect(pixels.unaffected).toEqual([227, 235, 246, 255])
  const output = await clickDownload(page, 'Download translated image')
  expect(output.readUInt32BE(16)).toBe(900)
  expect(output.readUInt32BE(20)).toBe(330)
})
