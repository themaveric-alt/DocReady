import type * as OpenCV from '@techstark/opencv-js'

export type OpenCv = typeof OpenCV
type Loader = OpenCv & {
  then?: (ready: (api: OpenCv) => void) => void
  onAbort?: (reason: unknown) => void
}

async function loadOpenCv() {
  const url = new URL('/libs/opencv.js', self.location.origin).href
  const { default: loader }: { default: Loader } = await import(
    /* @vite-ignore */ url
  )
  // Wrap the API because Emscripten resolves with a reference to its own thenable.
  return new Promise<{ cv: OpenCv }>((resolve, reject) => {
    if (loader.Mat) resolve({ cv: loader })
    else if (loader.then) {
      loader.onAbort = (reason) =>
        reject(Error('OpenCV could not start: ' + String(reason)))
      loader.then((cv) => resolve({ cv }))
    } else reject(Error('OpenCV is unavailable on this browser.'))
  })
}

let loading: ReturnType<typeof loadOpenCv> | undefined

export function getOpenCv() {
  return (loading ??= loadOpenCv().catch((error) => {
    loading = undefined
    throw error
  }))
}
