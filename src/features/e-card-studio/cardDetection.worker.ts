import { getOpenCv } from '../../lib/opencv-worker'
import { detectCardRegions } from './cardDetector'
import type { PageAnalysis } from './documentRegions'

self.onmessage = async ({ data }: MessageEvent<{ id: number; rgba: ImageData; ratio: number; page?: PageAnalysis }>) => {
  try {
    const { cv } = await getOpenCv()
    if (!cv.Mat) throw Error('OpenCV could not start on this device.')
    self.postMessage({ id: data.id, candidates: detectCardRegions(cv, data.rgba, data.ratio, data.page) })
  } catch (error) {
    self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) })
  }
}
