import { PDFDocument } from 'pdf-lib'
let output: PDFDocument | undefined
self.onmessage = async ({ data }: MessageEvent) => {
  try {
    if (data.type === 'start') output = await PDFDocument.create()
    else if (data.type === 'page') {
      if (!output) throw Error('PDF compression session is unavailable.')
      const image = await output.embedJpg(await data.blob.arrayBuffer())
      output.addPage([data.width, data.height]).drawImage(image, {
        x: 0, y: 0, width: data.width, height: data.height,
      })
    } else if (data.type === 'finish') {
      if (!output) throw Error('PDF compression session is unavailable.')
      const bytes = await output.save({ useObjectStreams: true })
      output = undefined
      self.postMessage({ bytes }, { transfer: [bytes.buffer] })
      return
    }
    self.postMessage({ ok: true })
  } catch (error) {
    output = undefined
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
