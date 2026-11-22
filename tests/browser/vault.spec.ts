import { expect, test, type Page } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { resolve } from 'node:path'

const route = '/tools/encrypted-vault'
const master = 'silk valley blue month 2026'
const searchToken = 'cobalt orchard 99162'
const filename = 'Archive document.pdf'
const tag = 'Granite trail tag'
const fixture = (name: string) => resolve('tests/fixtures', name)

async function create(page: Page, secret = master) {
  await page.getByLabel('Master password or PIN', { exact: true }).fill(secret)
  await page.getByLabel('Confirm master password or PIN').fill(secret)
  await page.getByRole('button', { name: 'Create encrypted vault' }).click()
}
async function unlock(page: Page, secret = master) {
  await page.getByLabel('Master password or PIN', { exact: true }).fill(secret)
  await page.getByRole('button', { name: 'Unlock vault' }).click()
}
async function newPDF() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage().drawText('University transcript ' + searchToken, {
    x: 40,
    y: 760,
    size: 16,
    font,
  })
  return Buffer.from(await pdf.save())
}
function upload(page: Page, name: string, mimeType: string, buffer: Buffer) {
  return page
    .getByLabel('Add file to vault')
    .setInputFiles({ name, mimeType, buffer })
}
async function exportBackup(page: Page, plain = false) {
  await page.getByRole('button', { name: 'Backup All as ZIP' }).click()
  const dialog = page.getByRole('dialog', { name: 'Backup all as ZIP' })
  if (plain)
    await dialog.getByRole('radio', { name: /Unlocked Structured ZIP/ }).check()
  const wait = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download Full Backup ZIP' }).click()
  const download = await wait
  expect(download.suggestedFilename()).toMatch(
    plain ? /(?<!\.vault)\.zip$/ : /\.vault\.zip$/,
  )
  return readFile((await download.path())!)
}

test('vault encrypts file bytes and metadata before storage, searches native PDF text, and auto-locks', async ({
  page,
}) => {
  const requests: { url: string; method: string; body: string | null }[] = []
  page.context().on('request', (request) =>
    requests.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
    }),
  )
  await page.addInitScript(() => {
    const original = URL.revokeObjectURL
    const revoked: string[] = []
    URL.revokeObjectURL = (url) => {
      revoked.push(url)
      original.call(URL, url)
    }
    Object.defineProperty(window, 'revokedVaultUrls', { value: revoked })
  })
  await page.clock.install()
  await page.goto(route)
  await create(page)
  await expect(
    page.getByRole('heading', { name: 'Vault overview' }),
  ).toBeVisible()
  const pdf = await newPDF()
  await upload(page, 'unnamed.pdf', 'application/pdf', pdf)
  const dialog = page.getByRole('dialog', {
    name: 'Save to Encrypted Vault',
  })
  await expect(dialog.getByLabel('Folder')).toHaveValue('Education')
  await dialog.getByLabel('Filename').fill(filename)
  await dialog.getByLabel('Folder').selectOption('Personal')
  await dialog.getByLabel('Tags (comma separated)').fill(tag)
  await dialog.getByRole('button', { name: 'Encrypt & Save' }).click()
  await expect(
    page.getByText('File encrypted and saved to this device.'),
  ).toBeVisible()
  const search = page.getByRole('searchbox', {
    name: 'Search encrypted vault',
  })
  await search.fill(searchToken)
  await expect(
    page.getByRole('button', { name: filename, exact: true }),
  ).toBeVisible()
  await search.fill('missing term')
  await expect(page.getByText('No files match this view.')).toBeVisible()
  await search.fill(tag)
  await page.getByRole('button', { name: 'List view' }).click()
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: filename, exact: true }).click()
  const preview = page.getByRole('dialog', { name: 'Private file preview' })
  const image = preview.getByAltText('PDF page 1')
  await expect(image).toBeVisible()
  const url = await image.getAttribute('src')
  await preview.getByRole('button', { name: 'Close dialog' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        (source) => Reflect.get(window, 'revokedVaultUrls').includes(source),
        url,
      ),
    )
    .toBe(true)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ' + filename }).click()
  expect(await readFile((await (await download).path())!)).toEqual(pdf)
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('docready-encrypted-vault')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    try {
      const tx = db.transaction(['config', 'index', 'chunks'], 'readonly')
      const all = <T>(key: string) =>
        new Promise<T[]>((resolve, reject) => {
          const request = tx.objectStore(key).getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      const [config, rows, contents] = await Promise.all([
        all<object>('config'),
        all<{ id: string; size: number; meta: Blob }>('index'),
        all<Blob>('chunks'),
      ])
      return {
        config,
        fields: Object.keys(rows[0]).sort(),
        meta: await rows[0].meta.text(),
        data: await contents[0].text(),
        local: JSON.stringify(localStorage),
        session: JSON.stringify(sessionStorage),
        assets: (
          await Promise.all(
            (await caches.keys()).map(async (key) => {
              const cache = await caches.open(key)
              return (await cache.keys()).map((item) => item.url)
            }),
          )
        ).flat(),
      }
    } finally {
      db.close()
    }
  })
  expect(stored.fields).toEqual(['chunked', 'id', 'meta', 'size'])
  for (const confidential of [filename, master, searchToken, tag, '%PDF-'])
    expect(JSON.stringify(stored)).not.toContain(confidential)
  await page.getByRole('button', { name: filename, exact: true }).click()
  await expect(image).toBeVisible()
  const activeUrl = await image.getAttribute('src')
  await page.clock.fastForward(181_000)
  await expect(preview).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(
        (source) => Reflect.get(window, 'revokedVaultUrls').includes(source),
        activeUrl,
      ),
    )
    .toBe(true)
  await expect(search).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Unlock vault' })).toBeVisible()
  await unlock(page, 'wrong master password')
  await expect(page.getByRole('alert')).toContainText('incorrect')
  await unlock(page)
  await expect(
    page.getByRole('button', { name: filename, exact: true }),
  ).toBeVisible()
  const origin = new URL(page.url()).origin
  expect(
    requests.filter(
      (r) =>
        r.url.startsWith('http') &&
        (new URL(r.url).origin !== origin || r.method !== 'GET' || r.body),
    ),
  ).toEqual([])
  for (const confidential of [filename, master, searchToken, tag])
    expect(JSON.stringify(requests)).not.toContain(confidential)
})

test('encrypted backup restores on a fresh device and safely merges, rejects tampering, and supports offline access', async ({
  page,
  browser,
  context,
}) => {
  await page.goto(route)
  await create(page)
  await expect(
    page.getByRole('heading', { name: 'Vault overview' }),
  ).toBeVisible()
  await upload(
    page,
    'Bills.txt',
    'text/plain',
    Buffer.from('GSTIN invoice amount due lantern 413'),
  )
  await expect(
    page
      .getByRole('dialog', { name: 'Save to Encrypted Vault' })
      .getByLabel('Folder', { exact: true }),
  ).toHaveValue('Finance & Bills')
  await page.getByRole('button', { name: 'Encrypt & Save' }).click()
  await expect(
    page.getByRole('button', { name: 'Bills.txt', exact: true }),
  ).toBeVisible()
  const bytes = await exportBackup(page)
  expect(bytes.subarray(0, 2).toString()).toBe('PK')
  expect(bytes.includes(Buffer.from('Bills.txt'))).toBe(false)
  expect(bytes.includes(Buffer.from('Finance & Bills'))).toBe(false)
  expect(bytes.includes(Buffer.from('lantern 413'))).toBe(false)
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true)
  await context.setOffline(true)
  await page.reload()
  await unlock(page)
  await page.getByRole('searchbox').fill('lantern 413')
  await expect(
    page.getByRole('button', { name: 'Bills.txt', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(async () =>
      Boolean(await caches.match('/libs/jszip.min.js')),
    ),
  ).toBe(true)
  expect((await exportBackup(page)).subarray(0, 2).toString()).toBe('PK')
  await context.setOffline(false)
  const clean = await browser.newContext()
  try {
    const restore = await clean.newPage()
    await restore.goto(new URL(page.url()).origin + route)
    const open = () =>
      restore
        .getByRole('button', { name: /^Restore backup$/i })
        .click()
    await open()
    const dialog = restore.getByRole('dialog', {
      name: 'Restore vault backup',
    })
    const load = async (payload: Buffer, password: string) => {
      await dialog.getByLabel('Backup file (.zip or .vault)').setInputFiles({
        name: 'test.vault.zip',
        mimeType: 'application/octet-stream',
        buffer: payload,
      })
      await dialog.getByLabel('Backup password or PIN').fill(password)
      await dialog.getByRole('button', { name: 'Restore backup' }).click()
    }
    await load(bytes, 'wrong master password')
    await expect(dialog.getByRole('alert')).toContainText('incorrect')
    const archive = await JSZip.loadAsync(bytes)
    const member = archive.file(/\/[a-f\d-]{36}\.enc$/)[0]
    const damaged = await member.async('nodebuffer')
    damaged[damaged.length - 1] ^= 1
    archive.file(member.name, damaged)
    const tampered = await archive.generateAsync({ type: 'nodebuffer' })
    await load(tampered, master)
    await expect(dialog.getByRole('alert')).toContainText('integrity')
    await load(bytes, master)
    await expect(
      restore.getByRole('button', { name: 'Bills.txt', exact: true }),
    ).toBeVisible()
    await open()
    await load(bytes, master)
    await expect(
      restore.getByRole('status').filter({ hasText: 'already in this vault' }),
    ).toBeVisible()
    await restore.getByRole('button', { name: 'Delete Bills.txt' }).click()
    await restore
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete file' })
      .click()
    await expect(
      restore.getByRole('button', { name: 'Bills.txt', exact: true }),
    ).toHaveCount(0)
  } finally {
    await clean.close()
  }
})

test('scanner OCR and image converter can save results directly to the encrypted vault', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.goto('/tools/scan-document')
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(fixture('english.png'))
  await page.getByRole('button', { name: 'Reset to full photo' }).click()
  await page.getByLabel('Scan filter').selectOption('original')
  await page.getByRole('button', { name: 'Generate scan' }).click()
  await page
    .getByRole('button', {
      name: /Save to Encrypted Vault document-scan.pdf/i,
    })
    .click()
  await create(page)
  const dialog = page.getByRole('dialog', {
    name: 'Save to Encrypted Vault',
  })
  await expect(
    dialog.getByRole('button', { name: 'Encrypt & Save' }),
  ).toBeEnabled({ timeout: 50_000 })
  await dialog.getByRole('button', { name: 'Encrypt & Save' }).click()
  await page.getByRole('link', { name: 'Open vault', exact: true }).click()
  await page
    .getByRole('searchbox', { name: 'Search encrypted vault' })
    .fill('document ready')
  await expect(
    page.getByRole('button', { name: 'document-scan.pdf', exact: true }),
  ).toBeVisible()
  await page.goto('/tools/resize-image')
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(fixture('sample.png'))
  await page.getByRole('button', { name: 'Process image' }).click()
  await page
    .getByRole('button', {
      name: /Save to Encrypted Vault sample-resize.jpg/i,
    })
    .click()
  await unlock(page)
  await dialog
    .getByRole('button', { name: 'Encrypt & Save' })
    .click({ timeout: 50_000 })
  await page.getByRole('link', { name: 'Open vault', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'sample-resize.jpg', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: 'test-results/screenshots/vault-desktop.png',
  })
  await page.setViewportSize({ width: 320, height: 760 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  )
  await page.screenshot({
    path: 'test-results/screenshots/vault-mobile.png',
    fullPage: true,
  })
})

test('custom folder hierarchy and metadata round-trip through a structured ZIP and safe folder deletion', async ({
  page,
  browser,
}) => {
  await page.goto(route)
  await create(page)
  await expect(
    page.getByRole('heading', { name: 'Vault overview' }),
  ).toBeVisible()
  const newFolder = async (name: string, parent?: string) => {
    await page
      .getByRole('button', { name: 'Create New Folder', exact: true })
      .first()
      .click()
    const dialog = page.getByRole('dialog', { name: 'Create new folder' })
    await dialog.getByLabel('Folder name').fill(name)
    if (parent)
      await dialog.getByLabel('Parent folder').selectOption({ label: parent })
    await dialog.getByLabel('Folder color').selectOption('teal')
    await dialog.getByLabel('Folder icon').selectOption('briefcase')
    await dialog
      .getByRole('button', { name: 'Create folder', exact: true })
      .click()
    await expect(dialog).toHaveCount(0)
  }
  await newFolder('My projects')
  await newFolder('2026 proofs', 'My projects')
  const text = 'Searchable project content 1755'
  await upload(page, 'Proof.txt', 'text/plain', Buffer.from(text))
  const save = page.getByRole('dialog', { name: 'Save to Encrypted Vault' })
  await expect(
    save.getByRole('button', { name: 'Encrypt & Save' }),
  ).toBeEnabled()
  await save
    .getByLabel('Folder')
    .selectOption({ label: 'My projects / 2026 proofs' })
  await save.getByLabel('Tags (comma separated)').fill('Portable')
  await save.getByRole('button', { name: 'Encrypt & Save' }).click()
  await expect(
    page.getByRole('button', { name: 'Proof.txt', exact: true }),
  ).toBeVisible()

  const bytes = await exportBackup(page, true)
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
  const member = zip.file(/\/My projects\/2026 proofs\/Proof\.txt$/)[0]
  expect(await member.async('string')).toBe(text)
  const manifest = JSON.parse(
    await zip.file(/\/manifest\.json$/)[0].async('string'),
  )
  expect(manifest.folders).toContainEqual(
    expect.objectContaining({
      name: '2026 proofs',
      color: 'teal',
      icon: 'briefcase',
    }),
  )
  expect(manifest.files).toContainEqual(
    expect.objectContaining({ tags: ['Portable'], text }),
  )
  const clean = await browser.newContext()
  try {
    const restore = await clean.newPage()
    await restore.goto(new URL(page.url()).origin + route)
    const open = async () => {
      await restore
        .getByRole('button', { name: /^Restore backup$/i })
        .click()
      const dialog = restore.getByRole('dialog', {
        name: 'Restore vault backup',
      })
      await dialog
        .getByLabel('Backup file (.zip or .vault)')
        .setInputFiles({
          name: 'plain.zip',
          mimeType: 'application/zip',
          buffer: bytes,
        })
      return dialog
    }
    let dialog = await open()
    await dialog
      .getByLabel('New vault password or PIN')
      .fill('completely new vault phrase')
    await dialog.getByRole('button', { name: 'Restore backup' }).click()
    await expect(
      restore.getByRole('button', {
        name: 'My projects / 2026 proofs',
        exact: true,
      }),
    ).toBeVisible()
    await restore.getByRole('searchbox').fill('portable 1755')
    await expect(
      restore.getByRole('button', { name: 'Proof.txt', exact: true }),
    ).toBeVisible()
    dialog = await open()
    await dialog.getByRole('button', { name: 'Restore backup' }).click()
    await expect(restore.getByText(/1 already in this vault/)).toBeVisible()
    await restore
      .getByRole('button', { name: 'Edit folder My projects / 2026 proofs' })
      .click()
    await restore.getByRole('dialog').getByLabel('Folder name').fill('Evidence')
    await restore
      .getByRole('button', { name: 'Save folder', exact: true })
      .click()
    await expect(
      restore.getByRole('button', {
        name: 'My projects / Evidence',
        exact: true,
      }),
    ).toBeVisible()
    await restore
      .getByRole('button', { name: 'Delete folder My projects', exact: true })
      .click()
    await restore
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete folder', exact: true })
      .click()
    await expect(
      restore.getByRole('button', { name: 'Personal / Evidence', exact: true }),
    ).toBeVisible()
    await restore
      .getByRole('button', { name: 'Edit Proof.txt', exact: true })
      .click()
    await restore
      .getByRole('dialog')
      .getByLabel('Folder')
      .selectOption('Education')
    await restore.getByRole('button', { name: 'Save changes' }).click()
    await expect(restore.getByText(/Education ·/)).toBeVisible()
  } finally {
    await clean.close()
  }
})

test('large files use bounded encrypted chunks and stream a readback and ZIP backup', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const bytes = Buffer.alloc(51 * 1024 ** 2 + 13, 10)
  bytes.write('large private marker')
  bytes.write('trailing test bytes', bytes.length - 19)
  const video = info.outputPath('long-recording.mp4')
  await writeFile(video, bytes)
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      value: async ({ suggestedName }: { suggestedName: string }) => ({
        createWritable() {
          const pieces: Blob[] = []
          return new WritableStream<Uint8Array<ArrayBuffer>>({
            write(chunk) {
              pieces.push(new Blob([chunk]))
            },
            close() {
              const a = document.createElement('a')
              const url = URL.createObjectURL(new Blob(pieces))
              a.href = url
              a.download = suggestedName
              a.click()
              setTimeout(() => URL.revokeObjectURL(url), 0)
            },
          })
        },
      }),
    })
  })
  await page.goto(route)
  await create(page)
  await page.getByLabel('Add file to vault').setInputFiles(video)
  await page.getByRole('button', { name: 'Encrypt & Save' }).click()
  await expect(
    page.getByRole('button', { name: 'long-recording.mp4', exact: true }),
  ).toBeVisible({ timeout: 25_000 })
  const chunkSizes = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('docready-encrypted-vault')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const request = db.transaction('chunks').objectStore('chunks').getAll()
    return new Promise<number[]>((resolve) => {
      request.onsuccess = () => {
        resolve(request.result.map((part: Blob) => part.size))
        db.close()
      }
    })
  })
  expect(chunkSizes).toHaveLength(26)
  expect(Math.max(...chunkSizes)).toBe(2 * 1024 ** 2 + 28)
  const pending = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Download long-recording.mp4' })
    .click()
  expect(
    Buffer.compare(await readFile((await (await pending).path())!), bytes),
  ).toBe(0)
  const zip = await JSZip.loadAsync(await exportBackup(page, true))
  const actual = await zip.file(/long-recording\.mp4$/)[0].async('nodebuffer')
  expect(Buffer.compare(actual, bytes)).toBe(0)
})

test('persistent storage requests report only granted protection and live estimated quota', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let requests = 0
    Object.defineProperties(navigator.storage, {
      persisted: { value: async () => requests >= 2 },
      persist: { value: async () => ++requests >= 2 },
      estimate: {
        value: async () => ({ usage: 2 * 1024 ** 2, quota: 10 * 1024 ** 2 }),
      },
    })
  })
  await page.goto(route)
  await create(page)
  await expect(
    page.getByText('8.00 MB available of 10.00 MB browser quota'),
  ).toBeVisible()
  const enable = page.getByRole('button', { name: 'Enable Storage Protection' })
  await expect(enable).toBeVisible()
  await enable.click()
  await expect(page.getByText('Storage Protected (Persistent)')).toBeVisible()
  await expect(enable).toHaveCount(0)
})

test('homepage puts the interactive vault and workstation links first down to 320px', async ({
  page,
}) => {
  await page.goto('/')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Smart Vault' })).toBeVisible()
  await main.getByRole('button', { name: 'Education', exact: true }).click()
  await expect(main.getByText('Semester transcript.pdf')).toBeVisible()
  await expect(
    main.getByRole('link', { name: 'Open Encrypted Vault' }),
  ).toHaveAttribute('href', route)
  await expect(
    main.getByRole('link', { name: /AI Document Scanner/ }),
  ).toHaveAttribute('href', '/tools/scan-document')
  await main
    .getByRole('link', { name: /Advanced Document Workstation/ })
    .click()
  await expect(page).toHaveURL(/\/workspace\/advanced$/)
  await page.goto('/')
  await page.screenshot({
    path: 'test-results/screenshots/vault-home-desktop.png',
  })
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 820 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
  }
  await page.setViewportSize({ width: 390, height: 820 })
  await page.screenshot({
    path: 'test-results/screenshots/vault-home-mobile.png',
    fullPage: true,
  })
})
