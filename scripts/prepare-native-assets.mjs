import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
try { await readFile('public/libs/opencv-4.12.0.wasm') }
catch {
  const response = await fetch('https://docs.opencv.org/4.12.0/opencv.js', { signal: AbortSignal.timeout(180000) })
  if (!response.ok) throw Error('Pinned OpenCV build could not be downloaded.')
  await writeFile('opencv-upstream.js', new Uint8Array(await response.arrayBuffer()))
  execFileSync(process.execPath, ['scripts/scanner-opencv.mjs', 'opencv-upstream.js'], { stdio: 'inherit' })
}
