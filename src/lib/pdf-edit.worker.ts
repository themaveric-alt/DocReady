import { editPdf, imagesPdf, openEdit, type PDFAction, type PDFOptions } from './pdf-edit'
type Job = { kind: 'edit'; action: PDFAction; files: Blob[]; options: PDFOptions } | { kind: 'images'; files: Blob[]; options: Parameters<typeof imagesPdf>[1] } | { kind: 'counts'; files: Blob[] }
self.onmessage = async ({ data }: MessageEvent<Job>) => {
  try {
    const result = data.kind === 'edit' ? await editPdf(data.action, data.files, data.options)
      : data.kind === 'images' ? await imagesPdf(data.files, data.options)
      : await Promise.all(data.files.map(async file => (await openEdit(file)).getPageCount()))
    self.postMessage({ result })
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }) }
}
