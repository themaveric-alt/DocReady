import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import createQpdf from '@soulehshaikh99/qpdf-wasm'

const tool = '/tools/unlock-pdf'
const protectedFile = 'tests/fixtures/ecard/locked.pdf'
const field = (page: Page) => page.getByLabel('Current PDF password')
async function pick(
  page: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
) {
  await page.goto(tool)
  await page.getByLabel('Choose a PDF to unlock').setInputFiles(file)
}
async function submit(page: Page, password: string) {
  await field(page).fill(password)
  await page.getByRole('button', { name: 'Unlock PDF', exact: true }).click()
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ' + name }).click()
  const file = await pending
  expect(file.suggestedFilename()).toBe(name)
  return readFile((await file.path())!)
}
async function encrypted(user: string, owner: string) {
  const qpdf = await createQpdf()
  qpdf.FS.writeFile('/original.pdf', await readFile('tests/fixtures/two.pdf'))
  const code = qpdf.callMain([
    '/original.pdf',
    '--encrypt',
    '--user-password=' + user,
    '--owner-password=' + owner,
    '--bits=256',
    '--extract=n',
    '--',
    '/locked.pdf',
  ])
  expect(code).toBe(0)
  return Buffer.from(qpdf.FS.readFile('/locked.pdf'))
}

test('existing password unlocks AES-128, a wrong password does not, and input stays local', async ({
  page,
  context,
  baseURL,
}) => {
  const requests: { url: string; method: string; body: string | null }[] = []
  const leaks: string[] = []
  context.on('request', (r) =>
    requests.push({ url: r.url(), method: r.method(), body: r.postData() }),
  )
  page.on('console', (message) => {
    if (
      /local-test-password|UNLOCK_TEST_INCORRECT|Private Sample E-42/.test(
        message.text(),
      )
    )
      leaks.push(message.text())
  })
  await pick(page, protectedFile)
  await submit(page, 'UNLOCK_TEST_INCORRECT')
  await expect(page.getByRole('alert')).toHaveText(/Incorrect password/)
  await expect(
    page.getByRole('button', { name: 'Download locked-unlocked.pdf' }),
  ).toHaveCount(0)
  await submit(page, 'local-test-password')
  await expect(page.getByText('Your unlocked PDF is ready.')).toBeVisible()
  await expect(field(page)).toHaveValue('')
  const bytes = await download(page, 'locked-unlocked.pdf')
  const pdf = await PDFDocument.load(bytes)
  expect(pdf.isEncrypted).toBe(false)
  expect(pdf.getPageCount()).toBe(1)
  const reader = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = reader.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl:
      resolve('node_modules/pdfjs-dist/standard_fonts') + '/',
  })
  try {
    const content = await (
      await (await task.promise).getPage(1)
    ).getTextContent()
    const text = content.items
      .flatMap((item) => ('str' in item ? [item.str] : []))
      .join(' ')
    expect(text).toContain('FRONT SIDE')
    expect(text).toContain('BACK SIDE')
  } finally {
    await task.destroy()
  }
  const state = await page.evaluate(async () => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    dbNames: (await indexedDB.databases()).map((item) => item.name),
    cachedUrls: (
      await Promise.all(
        (await caches.keys()).map(async (name) =>
          (await (await caches.open(name)).keys()).map((r) => r.url),
        ),
      )
    ).flat(),
  }))
  const http = requests.filter((r) => r.url.startsWith('http'))
  expect(
    http.every(
      (r) =>
        new URL(r.url).origin === new URL(baseURL!).origin &&
        r.method === 'GET' &&
        !r.body,
    ),
  ).toBe(true)
  expect(JSON.stringify([http, state])).not.toMatch(
    /local-test-password|UNLOCK_TEST_INCORRECT|Private Sample E-42|locked\.pdf|unlocked\.pdf/,
  )
  expect(leaks).toEqual([])
})

test('unlocks AES-256 with a Unicode password after the app is cached for offline use', async ({
  page,
  context,
}) => {
  const password = '-नमस्ते- café 42 '
  const buffer = await encrypted(password, 'owner-for-synthetic-testing')
  await page.goto(tool)
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true)
  await context.setOffline(true)
  await page.reload()
  await page.getByLabel('Choose a PDF to unlock').setInputFiles({
    name: 'sample-256.pdf',
    mimeType: 'application/pdf',
    buffer,
  })
  await submit(page, password)
  const result = await download(page, 'sample-256-unlocked.pdf')
  const original = await PDFDocument.load(
    await readFile('tests/fixtures/two.pdf'),
  )
  const decoded = await PDFDocument.load(result)
  expect(decoded.getPages().map((p) => p.getSize())).toEqual(
    original.getPages().map((p) => p.getSize()),
  )
})

test('identifies already open PDFs, leaves permissions-only files alone, and rejects damaged input', async ({
  page,
}) => {
  await pick(page, 'tests/fixtures/one.pdf')
  await submit(page, 'unused')
  await expect(
    page.getByText('This PDF already opens without a password.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Results' })).toHaveCount(0)
  const buffer = await encrypted('', 'owner-for-synthetic-testing')
  await page.getByLabel('Choose a PDF to unlock').setInputFiles({
    name: 'permissions.pdf',
    mimeType: 'application/pdf',
    buffer,
  })
  await submit(page, 'owner-for-synthetic-testing')
  await expect(
    page.getByText(/may have editing or printing restrictions/),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Results' })).toHaveCount(0)
  await page.getByLabel('Choose a PDF to unlock').setInputFiles({
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nBroken data\n%%EOF'),
  })
  await submit(page, 'unused')
  await expect(page.getByRole('alert')).toHaveText(/damaged|unsupported/)
})
