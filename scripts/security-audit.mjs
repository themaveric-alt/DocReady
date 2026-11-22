import { readdir, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
async function files(root) {
  const result = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = root + '/' + entry.name
    if (entry.isDirectory()) result.push(...await files(path))
    else result.push(path)
  }
  return result
}
const findings = []
for (const path of await files('src')) {
  if (!/\.(tsx?|js)$/.test(path)) continue
  const source = await readFile(path, 'utf8')
  if (/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\(|document\.write\(|\beval\(|new Function\(/.test(source)) findings.push(path + ': unsafe DOM/code sink')
  if (/console\.(debug|dir)\(/.test(source)) findings.push(path + ': verbose logging')
}
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n')
for (const path of tracked) {
  if (/(^|\/)\.env($|\.)|\.(pem|key|p12|keystore|vault|sqlite)$/.test(path)) findings.push(path + ': sensitive tracked file')
  if (!/\.(ts|tsx|js|json|yml|html|md)$/.test(path)) continue
  const source = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (source === null) continue
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|gh[pousr]_[A-Za-z0-9]{30,}/.test(source)) findings.push(path + ': potential secret (value withheld)')
}
for (const path of await files('dist')) {
  if (path.startsWith('dist/licenses/')) continue // Corresponding source and license obligations.
  if (/\.map$|\/(?:\.git|\.env|tests|scripts)(?:\/|$)|\.(vault|sqlite|pem|key)$/.test(path)) findings.push(path + ': internal file in public output')
}
const headers = await readFile('dist/_headers', 'utf8')
for (const rule of ["'wasm-unsafe-eval'", "worker-src 'self' blob:", "media-src 'self' blob:", 'X-Frame-Options: DENY', 'X-Content-Type-Options: nosniff', 'Strict-Transport-Security:']) if (!headers.includes(rule)) findings.push('Missing header ' + rule)
if (findings.length) throw Error(findings.join('\n'))
console.log('Static security audit passed. Source sinks, known secret patterns, tracked sensitive extensions, distribution hygiene and required headers checked. Manual penetration testing and every tool workflow remain separate checks.')
