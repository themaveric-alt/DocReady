import type {
  ScanDetection,
  ScanJob,
  ScanRender,
  ScanReply,
  ScanRequest,
  ScanResult,
} from './scan-image'

type Pending = {
  resolve: (value: ScanResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class ScanWorker {
  private worker: Worker
  private pending = new Map<number, Pending>()
  private id = 0
  closed = false

  constructor() {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined')
      throw Error(
        'Scanning needs a browser with Web Workers and OffscreenCanvas.',
      )
    this.worker = new Worker(new URL('./scan.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker.onmessage = ({ data }: MessageEvent<ScanReply>) => {
      const entry = this.pending.get(data.id)
      if (!entry) return
      clearTimeout(entry.timer)
      this.pending.delete(data.id)
      if ('error' in data) entry.reject(Error(data.error))
      else entry.resolve(data.result)
    }
    this.worker.onerror = () =>
      this.close('The scan worker stopped. Retry, or use a smaller photo.')
  }

  detect(file: Blob) {
    return this.run({ type: 'detect', file }) as Promise<ScanDetection>
  }

  render(job: Extract<ScanJob, { type: 'render' }>) {
    return this.run(job) as Promise<ScanRender>
  }

  pdf(sources: Blob[], paper: string) {
    return this.run({ type: 'pdf', sources, paper }) as Promise<Blob>
  }

  close(message = 'Scan cancelled.') {
    this.closed = true
    this.worker.terminate()
    for (const { timer, reject } of this.pending.values()) {
      clearTimeout(timer)
      reject(Error(message))
    }
    this.pending.clear()
  }

  private run(job: ScanRequest) {
    return new Promise<ScanResult>((resolve, reject) => {
      if (this.closed) return reject(Error('The scanner worker is closed.'))
      const id = ++this.id
      const timer = setTimeout(
        () => this.close('Scanning took too long. Retry with a smaller photo.'),
        60_000,
      )
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.worker.postMessage({ id, job })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }
}
