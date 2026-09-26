import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { app, dialog, type BrowserWindow, type SaveDialogOptions, type WebContents } from 'electron'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createAudioTimeline } from './audioTimeline'
import { CHANNELS } from './channels'
import { OffscreenRenderSession, rendererLocation, type InputPixelFormat } from './createRenderWindow'
import { probeDurationMs, spawnFfmpeg, waitForExit, waitForSpawn } from './ffmpeg'
import {
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  type DesktopExportJob,
  type DesktopExportProgress,
  type DesktopExportResult,
  type DesktopRenderFrameRequest,
  type ExportSegment,
} from './types'

class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled.')
    this.name = 'ExportCancelledError'
  }
}

interface ActiveExport {
  job: DesktopExportJob
  abortController: AbortController
  outputPath: string
  encodedOutputPath: string
  tempDirectory: string
  renderSession: OffscreenRenderSession | null
  ffmpeg: ChildProcessWithoutNullStreams | null
  sender: WebContents
  finished: Promise<void>
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'video-essay'
}

function dateStamp(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function throwIfCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new ExportCancelledError()
}

async function writeFrame(child: ChildProcessWithoutNullStreams, frame: Buffer, signal: AbortSignal) {
  throwIfCancelled(signal)
  if (child.stdin.destroyed || !child.stdin.writable) throw new Error('FFmpeg stopped accepting video frames.')
  if (child.stdin.write(frame)) return
  await new Promise<void>((resolve, reject) => {
    function drained() {
      cleanup()
      resolve()
    }
    function failed(error: Error) {
      cleanup()
      reject(error)
    }
    function cancelled() {
      cleanup()
      reject(new ExportCancelledError())
    }
    function cleanup() {
      child.stdin.off('drain', drained)
      child.stdin.off('error', failed)
      signal.removeEventListener('abort', cancelled)
    }
    child.stdin.once('drain', drained)
    child.stdin.once('error', failed)
    signal.addEventListener('abort', cancelled, { once: true })
  })
}

function progressContext(job: DesktopExportJob, elapsedMs: number) {
  let segmentStart = 0
  let active: ExportSegment | undefined
  for (const segment of job.segments) {
    if (elapsedMs < segmentStart + segment.durationMs) {
      active = segment
      break
    }
    segmentStart += segment.durationMs
  }
  if (!active) {
    const finalSegment = job.segments.at(-1)
    return {
      activeSceneId: finalSegment?.type === 'silent-scene'
        ? finalSegment.sceneId
        : finalSegment?.sceneIds.at(-1),
      activeSectionTitle: finalSegment?.type === 'narration' ? finalSegment.title : undefined,
    }
  }
  if (active.type === 'silent-scene') return { activeSceneId: active.sceneId }
  const localTime = elapsedMs - segmentStart
  const cues = [...active.cues].sort((left, right) => left.timeMs - right.timeMs)
  let activeSceneId = cues[0]?.sceneId ?? active.sceneIds[0]
  for (const cue of cues) {
    if (cue.timeMs > localTime) break
    if (!('type' in cue) || cue.type !== 'reveal') activeSceneId = cue.sceneId
  }
  return { activeSceneId, activeSectionTitle: active.title }
}

function encodingArgs(
  job: DesktopExportJob,
  pixelFormat: InputPixelFormat,
  outputPath: string,
  inputArgs: string[],
  filterComplex: string,
) {
  const frameCount = Math.ceil(job.totalDurationMs * VIDEO_FPS / 1000)
  return [
    '-hide_banner',
    '-loglevel', 'warning',
    '-y',
    '-f', 'rawvideo',
    '-pixel_format', pixelFormat,
    '-video_size', `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
    '-framerate', String(VIDEO_FPS),
    '-i', 'pipe:0',
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '0:v:0',
    '-map', '[aout]',
    '-frames:v', String(frameCount),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-r', String(VIDEO_FPS),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-movflags', '+faststart',
    outputPath,
  ]
}

export class VideoExporter {
  readonly completedOutputs = new Set<string>()
  private active: ActiveExport | null = null
  private mainWindow: () => BrowserWindow | null
  private preloadPath: string
  private choosingDestination = false

  constructor(mainWindow: () => BrowserWindow | null, preloadPath: string) {
    this.mainWindow = mainWindow
    this.preloadPath = preloadPath
  }

  hasActiveExport() {
    return this.active !== null
  }

  ownsRenderSender(sender: WebContents) {
    return this.active?.renderSession?.window.webContents === sender
  }

  handleCalibrationReady(sender: WebContents) {
    if (this.ownsRenderSender(sender)) this.active?.renderSession?.handleCalibrationReady()
  }

  handleRenderReady(sender: WebContents, jobId: string) {
    if (this.ownsRenderSender(sender) && this.active?.job.jobId === jobId) {
      this.active.renderSession?.handleRenderReady(jobId)
    }
  }

  handleRenderFrameRendered(sender: WebContents, request: DesktopRenderFrameRequest) {
    if (this.ownsRenderSender(sender) && this.active?.job.jobId === request.jobId) {
      this.active.renderSession?.handleRenderFrameRendered(request)
    }
  }

  async export(job: DesktopExportJob, sender: WebContents): Promise<DesktopExportResult> {
    if (this.active || this.choosingDestination) throw new Error('Another video export is already running.')
    const filename = `${slugify(job.presentation.title || job.suggestedBaseName)}-${dateStamp()}.mp4`
    const saveOptions: SaveDialogOptions = {
      title: 'Export Final Video',
      // Electron calls macOS's ~/Movies directory the "videos" path.
      defaultPath: path.join(app.getPath('videos'), filename),
      buttonLabel: 'Export Video',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    }
    this.choosingDestination = true
    const saveResult = await (async () => {
      try {
        const owner = this.mainWindow()
        return owner
          ? await dialog.showSaveDialog(owner, saveOptions)
          : await dialog.showSaveDialog(saveOptions)
      } finally {
        this.choosingDestination = false
      }
    })()
    if (saveResult.canceled || !saveResult.filePath) return { status: 'save-cancelled' }

    const outputPath = path.resolve(path.extname(saveResult.filePath).toLowerCase() === '.mp4'
      ? saveResult.filePath
      : `${saveResult.filePath}.mp4`)
    const encodedOutputPath = path.join(
      path.dirname(outputPath),
      `.${path.basename(outputPath, '.mp4')}.${slugify(job.jobId)}.partial.mp4`,
    )
    const tempBase = path.join(app.getPath('temp'), 'video-essay-studio')
    await mkdir(tempBase, { recursive: true, mode: 0o700 })
    const tempDirectory = await mkdtemp(path.join(tempBase, `${slugify(job.jobId)}-`))
    const abortController = new AbortController()
    let resolveFinished!: () => void
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve
    })
    this.active = {
      job,
      abortController,
      outputPath,
      encodedOutputPath,
      tempDirectory,
      renderSession: null,
      ffmpeg: null,
      sender,
      finished,
    }

    try {
      const result = await this.runActive(this.active)
      return result
    } catch (error) {
      // Cancellation is a normal UI result; other failures propagate through invoke.
      if (error instanceof ExportCancelledError) return { status: 'cancelled' }
      throw error
    } finally {
      const active = this.active
      if (active?.job.jobId === job.jobId) {
        active.renderSession?.destroy()
        if (active.ffmpeg && active.ffmpeg.exitCode === null) active.ffmpeg.kill('SIGKILL')
        await rm(active.tempDirectory, { recursive: true, force: true }).catch(() => undefined)
        await rm(active.encodedOutputPath, { force: true }).catch(() => undefined)
        this.active = null
      }
      resolveFinished()
    }
  }

  async cancel() {
    const active = this.active
    if (!active) return
    active.abortController.abort()
    active.ffmpeg?.stdin.destroy()
    if (active.ffmpeg && active.ffmpeg.exitCode === null) active.ffmpeg.kill('SIGKILL')
    active.renderSession?.destroy()
    await active.finished
  }

  private async runActive(active: ActiveExport): Promise<DesktopExportResult> {
    const { signal } = active.abortController
    try {
      throwIfCancelled(signal)
      const renderSession = new OffscreenRenderSession(this.preloadPath)
      active.renderSession = renderSession
      const location = rendererLocation()
      await renderSession.load(location.rendererUrl, location.rendererFile)
      const pixelFormat = await renderSession.waitForCalibration()
      throwIfCancelled(signal)
      await renderSession.sendJob(active.job)
      throwIfCancelled(signal)

      const timeline = await createAudioTimeline(active.job, active.tempDirectory)
      const stderr = { value: '' }
      const child = spawnFfmpeg(encodingArgs(
        active.job,
        pixelFormat,
        active.encodedOutputPath,
        timeline.inputArgs,
        timeline.filterComplex,
      ))
      active.ffmpeg = child
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        stderr.value = `${stderr.value}${chunk}`.slice(-64_000)
      })
      await waitForSpawn(child)
      const exitPromise = waitForExit(child, stderr)
      // Mark the process promise handled even while the render-start handshake is
      // pending; it is awaited authoritatively after frame pumping begins.
      void exitPromise.catch(() => undefined)
      let pumping = true
      const exitDuringPump = exitPromise.then(
        () => {
          if (pumping) throw new Error('FFmpeg exited before all planned video frames were written.')
        },
        (error: unknown) => { throw error },
      )
      await Promise.race([this.pumpFrames(active, child), exitDuringPump])
      pumping = false
      child.stdin.end()
      await exitPromise
      throwIfCancelled(signal)

      const durationMs = await probeDurationMs(active.encodedOutputPath, signal)
      throwIfCancelled(signal)
      const toleranceMs = Math.max(150, 2 * 1000 / VIDEO_FPS)
      if (Math.abs(durationMs - active.job.totalDurationMs) > toleranceMs) {
        throw new Error(
          `The exported video duration was ${Math.round(durationMs)} ms, but the playback plan requires ${Math.round(active.job.totalDurationMs)} ms.`,
        )
      }
      // The hidden partial lives beside the chosen destination, so this atomic
      // replacement also works when the user exports to an external volume.
      await rename(active.encodedOutputPath, active.outputPath)
      this.completedOutputs.add(active.outputPath)
      return { status: 'completed', outputPath: active.outputPath, durationMs }
    } finally {
      // The outer export cleanup removes both OS-temp inputs and the hidden
      // destination-side partial without touching a pre-existing final file.
    }
  }

  private async pumpFrames(active: ActiveExport, child: ChildProcessWithoutNullStreams) {
    const { job, abortController, renderSession, sender } = active
    if (!renderSession) throw new Error('The offscreen renderer was not initialized.')
    const totalFrames = Math.ceil(job.totalDurationMs * VIDEO_FPS / 1000)
    const intervalMs = 1000 / VIDEO_FPS

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      throwIfCancelled(abortController.signal)
      await renderSession.requestFrame({
        jobId: job.jobId,
        frameIndex,
        elapsedMs: frameIndex * intervalMs,
      })
      await writeFrame(child, renderSession.getFrame(), abortController.signal)

      if (frameIndex % 6 === 0 || frameIndex === totalFrames - 1) {
        const elapsedMs = Math.min(job.totalDurationMs, (frameIndex + 1) * intervalMs)
        const context = progressContext(job, elapsedMs)
        const progress: DesktopExportProgress = {
          jobId: job.jobId,
          elapsedMs,
          totalDurationMs: job.totalDurationMs,
          percent: Math.min(100, elapsedMs / job.totalDurationMs * 100),
          ...context,
        }
        if (!sender.isDestroyed()) sender.send(CHANNELS.exportProgress, progress)
      }
    }
  }
}
