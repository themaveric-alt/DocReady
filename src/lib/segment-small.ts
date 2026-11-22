import * as ort from 'onnxruntime-web/wasm'
export async function segmentSmall(image: OffscreenCanvas, progress: (key: string, current: number, total: number) => void) {
  ort.env.wasm.numThreads = 1
  ort.env.wasm.simd = true
  ort.env.wasm.proxy = false
  ort.env.wasm.wasmPaths = {
    mjs: location.origin + '/background-assets/ort-wasm-simd-threaded.mjs',
    wasm: location.origin + '/translation-assets/ort-1.31/ort-wasm-simd-threaded.wasm',
  }
  const path = '/libs/u2netp.onnx'
  const cache = await caches.open('docready-background-small-v1').catch(() => undefined)
  progress('fetch:Small segmentation model', 0, 4574861)
  let response = await cache?.match(path)
  if (!response) {
    response = await fetch(path)
    if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw Error('The local segmentation model is unavailable.')
    await cache?.put(path, response.clone()).catch(() => {})
  }
  let model: Uint8Array<ArrayBuffer> | undefined = new Uint8Array(await response.arrayBuffer())
  progress('fetch:Small segmentation model', model.length, model.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', model))
  const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
  if (hash !== '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8') {
    await cache?.delete(path)
    throw Error('The local segmentation model failed its integrity check. Reload and retry.')
  }
  let session: ort.InferenceSession | undefined
  const feeds: Record<string, ort.Tensor> = {}
  let outputs: ort.InferenceSession.ReturnType | undefined
  const input = new OffscreenCanvas(320, 320)
  try {
    progress('compute:initialize', 0, 1)
    session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], executionMode: 'sequential', graphOptimizationLevel: 'all', enableCpuMemArena: false, enableMemPattern: false })
    model = undefined
    const context = input.getContext('2d', { willReadFrequently: true })!
    context.drawImage(image, 0, 0, 320, 320)
    const pixels = context.getImageData(0, 0, 320, 320).data
    const tensor = new Float32Array(3 * 320 * 320)
    let max = 1
    for (let i = 0; i < pixels.length; i += 4) max = Math.max(max, pixels[i], pixels[i + 1], pixels[i + 2])
    const mean = [.485, .456, .406], deviation = [.229, .224, .225]
    for (let i = 0; i < 320 * 320; i++) for (let c = 0; c < 3; c++) tensor[c * 320 * 320 + i] = (pixels[i * 4 + c] / max - mean[c]) / deviation[c]
    feeds[session.inputNames[0]] = new ort.Tensor('float32', tensor, [1, 3, 320, 320])
    progress('compute:inference', 1, 4)
    outputs = await session.run(feeds)
    const values = outputs[session.outputNames[0]].data as Float32Array
    let low = Infinity, high = -Infinity
    for (const value of values) { low = Math.min(low, value); high = Math.max(high, value) }
    const mask = context.createImageData(320, 320)
    for (let i = 0; i < 320 * 320; i++) {
      mask.data[i * 4] = mask.data[i * 4 + 1] = mask.data[i * 4 + 2] = 255
      mask.data[i * 4 + 3] = Math.round(255 * (values[i] - low) / Math.max(.000001, high - low))
    }
    context.putImageData(mask, 0, 0)
    progress('compute:mask', 3, 4)
    return await createImageBitmap(input)
  } finally {
    for (const tensor of Object.values(feeds)) tensor.dispose()
    for (const tensor of Object.values(outputs ?? {})) tensor.dispose()
    await session?.release()
    model = undefined
    input.width = input.height = 0
  }
}
