import { readdir, readFile, mkdir, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
const config = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'))
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${config.version}`) throw Error('Release tag must match the Tauri version.')
const root = join('src-tauri/target', process.env.DOCREADY_TARGET, 'release/bundle')
async function walk(path) {
  const output = []
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name)
    if (entry.isDirectory()) output.push(...await walk(file))
    else if (/(?:-setup\.exe|\.dmg|\.deb|\.AppImage)$/.test(entry.name)) output.push(file)
  }
  return output
}
const paths = await walk(root)
if (!paths.length) throw Error('No desktop installers were generated.')
await mkdir('desktop-artifacts', { recursive: true })
for (const path of paths) {
  if (path.endsWith('-setup.exe')) {
    await copyFile(path, `desktop-artifacts/DocReady_${config.version}_x64-setup.exe`)
    await copyFile(path, 'desktop-artifacts/DocReady_x64-setup.exe')
  } else await copyFile(path, join('desktop-artifacts', path.split(/[\\/]/).at(-1)))
}
