import { createHash } from 'node:crypto'
import { dirname, relative } from 'node:path'
import { cp, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { tools, categories, toolPath } from '../src/catalog.ts'
const out = 'dist'
// Tesseract's browser loader imports the self-contained .wasm.js builds. Their
// embedded WASM is identical to the adjacent standalone files, which are not
// requested by that loader. Omit only verified duplicates from deployment,
// retaining scalar, SIMD and relaxed-SIMD support and every language pack.
for (const name of ['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm']) {
  const js = await readFile(`${out}/ocr/core/${name}.wasm.js`, 'utf8')
  const encoded = js.match(/wa\?\?=Ga\("([A-Za-z0-9+/=]+)"\)/)?.[1]
  const raw = await readFile(`${out}/ocr/core/${name}.wasm`).catch(() => null)
  if (raw) {
    if (!encoded || !Buffer.from(encoded, 'base64').equals(raw))
      throw Error(`Cannot safely deduplicate Tesseract runtime: ${name}`)
    await unlink(`${out}/ocr/core/${name}.wasm`)
  }
}
const build = await readFile(out + '/index.html', 'utf8')
const origin = (process.env.VITE_PUBLIC_ORIGIN || '').replace(/\/$/, '')
const escape = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
const routes = new Map([
  ['/desktop-download', { title: 'DocReady Desktop Software', desc: 'Desktop installer availability and release details.' }],
  [
    '/workspace',
    { title: 'Workspace', desc: 'Prepare files on your device.' },
  ],
  [
    '/workspace/all',
    { title: 'All Tools', desc: 'Browse the DocReadyApp document tools.' },
  ],
  [
    '/privacy',
    { title: 'Privacy', desc: 'How DocReadyApp processes and stores files.' },
  ],
  [
    '/settings',
    {
      title: 'Settings',
      desc: 'Manage defaults and local data in DocReadyApp.',
    },
  ],
])
for (const [id, [title, desc]] of Object.entries(categories))
  routes.set('/workspace/' + id, { title, desc })
for (const item of tools) routes.set(toolPath(item.id), item)
function page(html, path, title, desc) {
  let value = html
  if (title)
    value = value.replace(
      /<title>.*?<\/title>/,
      `<title>${escape(title)} | DocReadyApp</title>`,
    )
  if (desc)
    value = value.replace(
      /(<meta\s+name="description"\s+content=")[^"]*(")/,
      (_match, start, end) => start + escape(desc) + end,
    )
  return origin
    ? value.replace(
        '</head>',
        `<link rel="canonical" href="${escape(origin + path)}"></head>`,
      )
    : value
}
await writeFile(out + '/index.html', page(build, '/'))
for (const [path, entry] of routes) {
  await mkdir(dirname(out + path), { recursive: true })
  await writeFile(
    out + path + '.html',
    page(build, path, entry.title, entry.desc),
  )
}
if (origin)
  await writeFile(
    out + '/sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', ...routes.keys()].map((path) => `<url><loc>${escape(origin + path)}</loc></url>`).join('')}</urlset>`,
  )
const assets = (
  await readdir(out + '/assets', { recursive: true, withFileTypes: true })
)
  .filter((file) => file.isFile())
  .map((file) => '/' + relative(out, file.parentPath + '/' + file.name))
  .sort()
const cardVision = assets.find((name) =>
  /\/cardDetection\.worker-/.test(name),
)
const scannerAssets = (
  await readdir(out + '/libs', { withFileTypes: true })
).filter((entry) => entry.isFile()).map((entry) => '/libs/' + entry.name).sort()
const files = [
  ...scannerAssets,
  '/',
  '/logo.svg',
  '/background-assets/ort-wasm-simd-threaded.mjs',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  ...assets.filter((name) => name !== cardVision),
]
for (const folder of ['cmaps', 'standard_fonts', 'iccs', 'wasm'])
  for (const file of await readdir(out + '/pdf/' + folder)) {
    if (!file.toLowerCase().startsWith('license'))
      files.push('/pdf/' + folder + '/' + file)
  }
const buildHash = createHash('sha256').update(build + JSON.stringify(assets))
for (const path of scannerAssets) buildHash.update(await readFile(out + path))
const version = buildHash
  .digest('hex')
  .slice(0, 14)
const ocrHash = createHash('sha256')
for (const file of [
  'worker.min.js',
  'eng.traineddata.gz',
  'hin.traineddata.gz',
  'spa.traineddata.gz',
  'fra.traineddata.gz',
  'deu.traineddata.gz',
  ...(await readdir(out + '/ocr/core')).sort().map((name) => 'core/' + name),
])
  ocrHash.update(await readFile(out + '/ocr/' + file))
const ocrVersion = ocrHash.digest('hex').slice(0, 10)
const sw = `
const CACHE = 'docready-${version}';
const OCR_CACHE = 'docready-ocr-${ocrVersion}';
const CORE = new Set(${JSON.stringify(files)});
const CARD_VISION = ${JSON.stringify(cardVision ?? '')};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...CORE]))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('docready-') && key !== CACHE && key !== OCR_CACHE && key !== 'docready-translation-assets-v2' && key !== 'docready-background-v1' && key !== 'docready-background-small-v1') await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => {
      const cached = await (await caches.open(CACHE)).match('/', { ignoreVary: true });
      if (!cached) return Response.error();
      const headers = new Headers(cached.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      // The cached document can distinguish a failed navigation even if navigator.onLine stays true.
      const html = (await cached.text()).replace('<html', '<html data-offline-navigation');
      return new Response(html, { status: cached.status, statusText: cached.statusText, headers });
    }));
    return;
  }
  if (url.pathname.startsWith('/translation-assets/')) {
    event.respondWith(caches.open('docready-translation-assets-v2').then(cache => cache.match(event.request, { ignoreVary: true })).then(cached => cached || fetch(event.request)));
    return;
  }
  const optional = url.pathname.startsWith('/ocr/');
  if (!CORE.has(url.pathname) && url.pathname !== CARD_VISION && !optional) return;
  event.respondWith((async () => {
    const cache = await caches.open(optional ? OCR_CACHE : CACHE);
    const stored = await cache.match(optional ? event.request : url.pathname, {ignoreVary: true});
    if (stored) return stored;
    const response = await fetch(event.request);
    if (response.ok && !response.headers.get('content-type')?.includes('text/html')) await cache.put(event.request, response.clone()).catch(() => {});
    return response;
  })());
});
`
await writeFile(out + '/sw.js', sw)

// Retain the license and notice files supplied by the bundled packages.
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
await mkdir(out + '/licenses', { recursive: true })
await cp('TRANSLATION.md', out + '/licenses/translation-model-notices.md')
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/') || entry.dev) continue
  const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
  for (const file of entries) {
    if (!file.isFile() || !/^(license|notice|copying)(\.|$)/i.test(file.name))
      continue
    const name = path.slice('node_modules/'.length).replaceAll('/', '--')
    await cp(
      path + '/' + file.name,
      out + '/licenses/' + name + '-' + file.name,
    )
  }
}
