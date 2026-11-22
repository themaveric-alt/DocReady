import { getOpenCv } from './opencv-worker'
import { processScan, type ScanRequest, type ScanReply } from './scan-image'
import { imagesPdf } from './pdf-edit'

let queue = Promise.resolve()

self.onmessage = ({ data }: MessageEvent<{ id: number; job: ScanRequest }>) => {
  queue = queue.then(async () => {
    let reply: ScanReply
    try {
      const { id, job } = data
      if (job.type === 'pdf') {
        const result = await imagesPdf(job.sources, {
          paper: job.paper,
          landscape: false,
          fit: 'contain',
          margin: 12,
        })
        reply = { id, result }
      } else {
        const { cv } = await getOpenCv()
        reply = { id, result: await processScan(cv, job) }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'OpenCV could not process this photo. Try a smaller or clearer image.'
      reply = { id: data.id, error: message }
    }
    self.postMessage(reply)
  })
}
