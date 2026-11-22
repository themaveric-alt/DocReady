import { mkdir, readFile, writeFile } from 'node:fs/promises'
import JSZip from 'jszip'
const zip = new JSZip()
for (const path of ['src/lib/background-removal.ts', 'src/lib/background-removal.worker.ts', 'src/lib/smart-cutout.ts', 'src/lib/segment-small.ts', 'scripts/background-assets.mjs', 'public/licenses/U2Net-Apache-2.0.txt']) zip.file(path, await readFile(path))
zip.file('README.md', 'Local U²-NetP segmentation with ONNX Runtime WASM. The model comes from https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx. SHA256 309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8. U²-Net upstream https://github.com/xuebinqin/U-2-Net, Apache-2.0. Browser adapter sources retain their license notices.')
await mkdir('dist/licenses', { recursive: true })
await writeFile('dist/licenses/background-source.zip', await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}))
