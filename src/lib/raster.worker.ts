import { processRaster, type RasterOptions } from './raster'
self.onmessage = async ({
  data,
}: {
  data: { blob: Blob; options: RasterOptions }
}) => {
  try {
    self.postMessage({ result: await processRaster(data.blob, data.options) })
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : String(e) })
  }
}
