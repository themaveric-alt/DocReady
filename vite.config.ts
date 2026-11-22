import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
const headers: Record<string, string> = {}
for (const row of readFileSync('public/_headers', 'utf8')
  .split('\n')
  .slice(1)) {
  if (!row.startsWith('  ')) break
  const colon = row.indexOf(':')
  headers[row.slice(0, colon).trim()] = row.slice(colon + 1).trim()
}
export default defineConfig({
  build: { sourcemap: false },
  plugins: [react(), tailwind()],
  // Translation uses the audited CPU runtime and separately staged local WASM files.
  resolve: {
    alias: [
      // Keep the renderer compatible on browsers without newer built-ins.
      {
        find: /^pdfjs-dist$/,
        replacement: 'pdfjs-dist/legacy/build/pdf.mjs',
      },
      { find: 'onnxruntime-web/webgpu', replacement: 'onnxruntime-web/wasm' },
    ],
    conditions: [
      'onnxruntime-web-use-extern-wasm',
      'module',
      'browser',
      'development|production',
    ],
  },
  optimizeDeps: { exclude: ['@imgly/background-removal'] },
  preview: { headers },
})
