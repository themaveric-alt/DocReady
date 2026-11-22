import { analyzePhoto, renderPhoto } from './engine'
import type { PhotoEdits } from './photoState'
import type { RenderChoice } from './engine'
export type PhotoJob =
  | { kind: 'analysis'; file: Blob }
  | { kind: 'render'; file: Blob; edit: PhotoEdits; options: RenderChoice }
self.onmessage = async ({ data }: MessageEvent<PhotoJob>) => {
  try {
    const result =
      data.kind === 'analysis'
        ? await analyzePhoto(data.file)
        : await renderPhoto(data.file, data.edit, data.options)
    self.postMessage({ result })
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
