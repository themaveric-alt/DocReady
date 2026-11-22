import { readFile, writeFile } from 'node:fs/promises'
const path = 'src/config/desktop-release.json'
const current = JSON.parse(await readFile(path, 'utf8'))
const repository = process.env.DOCREADY_DESKTOP_REPOSITORY || current.repository
let result = { repository: null, downloadUrl: null, releasesUrl: null, verified: false }
if (repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw Error('Desktop release repository must be owner/repository.')
  const releasesUrl = `https://github.com/${repository}/releases/latest`
  result = { repository, downloadUrl: null, releasesUrl: null, verified: false }
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) })
    if (response.ok) {
      const release = await response.json()
      if (!release.draft && !release.prerelease) result.releasesUrl = releasesUrl
      const asset = release.assets?.find(item => item.name === 'DocReady_x64-setup.exe' && item.state === 'uploaded' && item.size > 0)
      if (!release.draft && !release.prerelease && asset) {
        const downloadUrl = `${releasesUrl}/download/DocReady_x64-setup.exe`
        const check = await fetch(downloadUrl, { method: 'HEAD', signal: AbortSignal.timeout(15000) })
        if (check.ok && !check.headers.get('content-type')?.includes('text/html')) result = { ...result, downloadUrl, verified: true }
      }
    }
  } catch { /* Keep the release-page fallback when the asset cannot be verified. */ }
}
await writeFile(path, JSON.stringify(result, null, 2) + '\n')
console.log(result.verified ? 'Windows release asset verified.' : repository ? 'Windows asset unverified; release-page fallback enabled.' : 'Desktop release repository is not configured.')
