import { warpRgba } from '../../lib/perspective'
import type { Quad } from './geometry'
type Job = { rgba: ImageData; corners: Quad; maxSide: number }
self.onmessage = ({ data }: MessageEvent<Job>) => {
  try {
    const result = warpRgba(
      data.rgba.data,
      data.rgba.width,
      data.rgba.height,
      data.corners,
      data.maxSide,
    )
    self.postMessage(result, { transfer: [result.data.buffer] })
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
