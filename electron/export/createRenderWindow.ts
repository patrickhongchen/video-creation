import { BrowserWindow, type Rectangle } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHANNELS } from './channels'
import { VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH, type DesktopExportJob, type DesktopRenderStart } from './types'

export type InputPixelFormat = 'bgra' | 'rgba'

type Resolver<T> = { resolve: (value: T) => void; reject: (reason?: unknown) => void }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function withFailureTimeout<T>(promise: Promise<T>, durationMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), durationMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export class OffscreenRenderSession {
  readonly window: BrowserWindow
  private latestFrame: Buffer | null = null
  private frameSequence = 0
  private calibrationSignal = deferred<InputPixelFormat>()
  private calibrationRequested = false
  private readySignals = new Map<string, Resolver<void>>()
  private startedSignals = new Map<string, Resolver<void>>()
  private frameWaiters: Array<{ after: number; signal: Resolver<void> }> = []

  constructor(preloadPath: string) {
    // Cancellation can destroy the window while loadURL is still pending,
    // before waitForCalibration attaches its await. Mark this deferred handled
    // immediately while preserving the original rejection for later awaiters.
    void this.calibrationSignal.promise.catch(() => undefined)
    this.window = new BrowserWindow({
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      show: false,
      frame: false,
      transparent: false,
      backgroundColor: '#000000',
      useContentSize: true,
      webPreferences: {
        preload: preloadPath,
        offscreen: true,
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        zoomFactor: 1,
      },
    })
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.window.webContents.on('will-navigate', (event) => event.preventDefault())
    this.window.webContents.setFrameRate(VIDEO_FPS)
    this.window.webContents.on('paint', (_event, dirty, image) => this.acceptPaint(dirty, image.getSize(), image.toBitmap()))
    this.window.on('closed', () => this.rejectPending(new Error('The offscreen render window closed unexpectedly.')))
  }

  async load(rendererUrl: string | null, rendererFile: string) {
    const loaded = new Promise<void>((resolve, reject) => {
      this.window.webContents.once('did-finish-load', () => resolve())
      this.window.webContents.once('did-fail-load', (_event, code, description) => {
        reject(new Error(`The export renderer failed to load (${code}): ${description}`))
      })
    })
    if (rendererUrl) {
      const url = new URL(rendererUrl)
      url.searchParams.set('mode', 'export-render')
      await this.window.loadURL(url.toString())
    } else {
      const url = new URL(pathToFileURL(rendererFile))
      url.searchParams.set('mode', 'export-render')
      await this.window.loadURL(url.toString())
    }
    await loaded
  }

  handleCalibrationReady() {
    this.calibrationRequested = true
    this.window.webContents.invalidate()
  }

  async waitForCalibration() {
    return withFailureTimeout(
      this.calibrationSignal.promise,
      15_000,
      'The export renderer did not complete pixel-format calibration within 15 seconds.',
    )
  }

  async sendJob(job: DesktopExportJob) {
    const ready = deferred<void>()
    this.readySignals.set(job.jobId, ready)
    this.window.webContents.send(CHANNELS.renderJob, job)
    await withFailureTimeout(
      ready.promise,
      30_000,
      'The export renderer did not render the first presentation frame within 30 seconds.',
    )
    const sequenceAtReady = this.frameSequence
    const painted = this.waitForFrameAfter(sequenceAtReady)
    this.window.webContents.invalidate()
    await withFailureTimeout(
      painted,
      15_000,
      'The export renderer did not paint its initialized presentation frame within 15 seconds.',
    )
  }

  handleRenderReady(jobId: string) {
    this.readySignals.get(jobId)?.resolve()
    this.readySignals.delete(jobId)
  }

  async start(jobId: string) {
    const started = deferred<void>()
    this.startedSignals.set(jobId, started)
    const payload: DesktopRenderStart = { jobId, startedAtMs: Date.now() }
    this.window.webContents.send(CHANNELS.renderStart, payload)
    await withFailureTimeout(
      started.promise,
      15_000,
      'The export renderer did not acknowledge playback start within 15 seconds.',
    )
  }

  handleRenderStarted(jobId: string) {
    this.startedSignals.get(jobId)?.resolve()
    this.startedSignals.delete(jobId)
  }

  getFrame() {
    if (!this.latestFrame) throw new Error('The export renderer has not produced a complete frame.')
    return this.latestFrame
  }

  destroy() {
    this.rejectPending(new Error('The export render session was cancelled.'))
    if (!this.window.isDestroyed()) this.window.destroy()
  }

  private waitForFrameAfter(after: number) {
    if (this.frameSequence > after) return Promise.resolve()
    const signal = deferred<void>()
    this.frameWaiters.push({ after, signal })
    return signal.promise
  }

  private acceptPaint(dirty: Rectangle, imageSize: { width: number; height: number }, bitmap: Buffer) {
    const expectedBytes = VIDEO_WIDTH * VIDEO_HEIGHT * 4
    if (imageSize.width === VIDEO_WIDTH && imageSize.height === VIDEO_HEIGHT && bitmap.byteLength >= expectedBytes) {
      this.latestFrame = Buffer.from(bitmap.subarray(0, expectedBytes))
    } else if (imageSize.width === dirty.width && imageSize.height === dirty.height
      && bitmap.byteLength >= dirty.width * dirty.height * 4 && this.latestFrame) {
      // Paint images are normally full-frame. Compose a dirty-only bitmap too,
      // so this remains correct if the backing Electron path supplies regions.
      const next = Buffer.from(this.latestFrame)
      const startX = Math.max(0, dirty.x)
      const startY = Math.max(0, dirty.y)
      const copyWidth = Math.min(dirty.width, VIDEO_WIDTH - startX)
      const copyHeight = Math.min(dirty.height, VIDEO_HEIGHT - startY)
      for (let row = 0; row < copyHeight; row += 1) {
        const sourceStart = row * dirty.width * 4
        const targetStart = ((startY + row) * VIDEO_WIDTH + startX) * 4
        bitmap.copy(next, targetStart, sourceStart, sourceStart + copyWidth * 4)
      }
      this.latestFrame = next
    } else {
      return
    }

    this.frameSequence += 1
    if (this.calibrationRequested) {
      try {
        this.calibrationSignal.resolve(this.inferPixelFormat(this.latestFrame))
        this.calibrationRequested = false
      } catch {
        // A stale pre-calibration paint can arrive after the renderer signal.
        // Keep waiting until an invalidated calibration frame is delivered.
      }
    }
    const completed = this.frameWaiters.filter(({ after }) => this.frameSequence > after)
    this.frameWaiters = this.frameWaiters.filter(({ after }) => this.frameSequence <= after)
    completed.forEach(({ signal }) => signal.resolve())
  }

  private inferPixelFormat(frame: Buffer): InputPixelFormat {
    const sample = (x: number, y: number) => {
      const offset = (y * VIDEO_WIDTH + x) * 4
      return [frame[offset], frame[offset + 1], frame[offset + 2], frame[offset + 3]] as const
    }
    const red = sample(8, 8)
    const blue = sample(24, 8)
    const bgraScore = red[2] - red[0] + blue[0] - blue[2]
    const rgbaScore = red[0] - red[2] + blue[2] - blue[0]
    const format = bgraScore > rgbaScore ? 'bgra' : 'rgba'
    if (Math.max(bgraScore, rgbaScore) < 300 || red[3] < 200 || blue[3] < 200) {
      throw new Error('The offscreen renderer pixel format calibration did not contain the expected red/blue patches.')
    }
    return format
  }

  private rejectPending(reason: Error) {
    this.calibrationSignal.reject(reason)
    this.readySignals.forEach((signal) => signal.reject(reason))
    this.startedSignals.forEach((signal) => signal.reject(reason))
    this.frameWaiters.forEach(({ signal }) => signal.reject(reason))
    this.readySignals.clear()
    this.startedSignals.clear()
    this.frameWaiters = []
  }
}

export function rendererLocation() {
  return {
    rendererUrl: process.env.VITE_DEV_SERVER_URL ?? null,
    rendererFile: path.join(__dirname, '..', 'dist', 'index.html'),
  }
}
