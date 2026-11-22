import { errorText } from './files'
import { ocrDocx } from './ocr-docx'
import { bicubicGray, enhanceOCR, type OCRFilter } from './ocr-pixels'
import type {
  OCRPreparationRequest,
  OCRPreparationResponse,
} from './ocr-preparation'

type Surface = {
  canvas: OffscreenCanvas
  context: OffscreenCanvasRenderingContext2D
}
class WorkerCanvasFactory {
  create(width: number, height: number): Surface {
    const canvas = new OffscreenCanvas(Math.ceil(width), Math.ceil(height))
    return {
      canvas,
      context: canvas.getContext('2d', { willReadFrequently: true })!,
    }
  }
  reset(surface: Surface, width: number, height: number) {
    surface.canvas.width = Math.ceil(width)
    surface.canvas.height = Math.ceil(height)
  }
  destroy(surface: Surface) {
    this.reset(surface, 0, 0)
  }
}

const factory = new WorkerCanvasFactory()

function enhance({ canvas, context }: Surface, filter: OCRFilter) {
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  enhanceOCR(image.data, canvas.width, canvas.height, filter)
  context.putImageData(image, 0, 0)
}

async function prepare(image: Blob, filter: OCRFilter = 'adaptive') {
  if (typeof OffscreenCanvas !== 'function')
    throw Error(
      'This browser cannot prepare scans in a worker. Try a current browser.',
    )
  const source = await createImageBitmap(image)
  const scale = Math.min(
    2,
    2600 / Math.max(source.width, source.height),
    Math.sqrt(4_500_000 / (source.width * source.height)),
  )
  const surface = factory.create(source.width * scale, source.height * scale)
  try {
    const { canvas, context } = surface
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    if (scale > 1) {
      const original = factory.create(source.width, source.height)
      try {
        original.context.fillStyle = '#fff'
        original.context.fillRect(0, 0, source.width, source.height)
        original.context.drawImage(source, 0, 0)
        const pixels = original.context.getImageData(0, 0, source.width, source.height)
        const scaled = context.createImageData(canvas.width, canvas.height)
        scaled.data.set(bicubicGray(pixels.data, source.width, source.height, canvas.width, canvas.height))
        context.putImageData(scaled, 0, 0)
      } finally { factory.destroy(original) }
    } else {
      context.imageSmoothingQuality = 'high'
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
    }
    enhance(surface, filter)
    return await canvas.convertToBlob({ type: 'image/png' })
  } finally {
    source.close()
    factory.destroy(surface)
  }
}

self.onmessage = async ({ data }: MessageEvent<OCRPreparationRequest>) => {
  const send = (response: OCRPreparationResponse) => self.postMessage(response)
  try {
    const value =
      data.type === 'docx'
        ? await ocrDocx(data.text)
        : await prepare(data.image, data.filter)
    send({ value })
  } catch (error) {
    send({ error: errorText(error) })
  }
}
