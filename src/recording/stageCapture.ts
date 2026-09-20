export const FINAL_VIDEO_WIDTH = 1080
export const FINAL_VIDEO_HEIGHT = 1920
export const FINAL_VIDEO_FPS = 30

export interface StageCaptureSession {
  displayStream: MediaStream
  outputCanvas: HTMLCanvasElement
  captureVideo: HTMLVideoElement
  stop: () => void
  stageIsFullyVisible: () => boolean
}

type SelfCaptureDisplayMediaOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean
  selfBrowserSurface?: 'include' | 'exclude'
}

function waitForVideoDimensions(video: HTMLVideoElement) {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('The shared tab did not provide video frames.')), 10_000)
    const finish = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', finish)
      video.removeEventListener('resize', finish)
      resolve()
    }
    video.addEventListener('loadedmetadata', finish)
    video.addEventListener('resize', finish)
  })
}

export function stageIsFullyVisible(stageElement: HTMLElement) {
  const bounds = stageElement.getBoundingClientRect()
  const tolerance = 2
  return bounds.width > 0
    && bounds.height > 0
    && bounds.left >= -tolerance
    && bounds.top >= -tolerance
    && bounds.right <= window.innerWidth + tolerance
    && bounds.bottom <= window.innerHeight + tolerance
}

export async function prepareStageCapture(
  stageElement: HTMLElement,
  outputCanvas: HTMLCanvasElement,
  onCaptureEnded: () => void,
  onFrameError: (message: string) => void,
): Promise<StageCaptureSession> {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Browser-tab capture is not supported in this browser.')
  if (!HTMLCanvasElement.prototype.captureStream) throw new Error('Canvas video capture is not supported in this browser.')
  if (!stageIsFullyVisible(stageElement)) throw new Error('The presentation Stage is not fully visible. Increase the browser window size or zoom out before rendering.')

  // These Chromium-originated hints are intentionally best-effort. Browsers
  // that do not implement them ignore the extra dictionary members and still
  // show their normal picker, where the live crop preview verifies the source.
  const displayOptions: SelfCaptureDisplayMediaOptions = {
    video: { frameRate: { ideal: FINAL_VIDEO_FPS } },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  }
  const displayStream = await navigator.mediaDevices.getDisplayMedia(displayOptions)
  const videoTrack = displayStream.getVideoTracks()[0]
  if (!videoTrack) {
    displayStream.getTracks().forEach((track) => track.stop())
    throw new Error('The selected source did not provide a video track.')
  }
  displayStream.getAudioTracks().forEach((track) => {
    track.stop()
    displayStream.removeTrack(track)
  })

  const displaySurface = videoTrack.getSettings().displaySurface
  if (displaySurface === 'monitor' || displaySurface === 'window') {
    displayStream.getTracks().forEach((track) => track.stop())
    throw new Error('Choose the current Video Essay Studio browser tab, not a window or screen.')
  }

  const captureVideo = document.createElement('video')
  captureVideo.muted = true
  captureVideo.playsInline = true
  captureVideo.autoplay = true
  captureVideo.srcObject = displayStream
  try {
    await captureVideo.play()
    await waitForVideoDimensions(captureVideo)
  } catch (problem) {
    displayStream.getTracks().forEach((track) => track.stop())
    captureVideo.pause()
    captureVideo.srcObject = null
    throw problem
  }

  outputCanvas.width = FINAL_VIDEO_WIDTH
  outputCanvas.height = FINAL_VIDEO_HEIGHT
  const context = outputCanvas.getContext('2d', { alpha: false })
  if (!context) {
    displayStream.getTracks().forEach((track) => track.stop())
    captureVideo.pause()
    captureVideo.srcObject = null
    throw new Error('The output canvas could not be initialized.')
  }

  let frameId: number | null = null
  let stopped = false
  let frameErrorReported = false
  const drawFrame = () => {
    if (stopped) return
    try {
      const bounds = stageElement.getBoundingClientRect()
      const scaleX = captureVideo.videoWidth / window.innerWidth
      const scaleY = captureVideo.videoHeight / window.innerHeight
      if (bounds.width > 0 && bounds.height > 0 && scaleX > 0 && scaleY > 0) {
        context.drawImage(
          captureVideo,
          bounds.left * scaleX,
          bounds.top * scaleY,
          bounds.width * scaleX,
          bounds.height * scaleY,
          0,
          0,
          FINAL_VIDEO_WIDTH,
          FINAL_VIDEO_HEIGHT,
        )
      }
    } catch (problem) {
      if (!frameErrorReported) {
        frameErrorReported = true
        onFrameError(problem instanceof Error ? problem.message : 'The Stage crop could not be drawn.')
      }
    }
    frameId = requestAnimationFrame(drawFrame)
  }

  const handleEnded = () => {
    if (!stopped) onCaptureEnded()
  }
  videoTrack.addEventListener('ended', handleEnded)
  drawFrame()

  const stop = () => {
    if (stopped) return
    stopped = true
    if (frameId !== null) cancelAnimationFrame(frameId)
    frameId = null
    videoTrack.removeEventListener('ended', handleEnded)
    displayStream.getTracks().forEach((track) => track.stop())
    captureVideo.pause()
    captureVideo.srcObject = null
    captureVideo.removeAttribute('src')
    captureVideo.load()
  }

  return {
    displayStream,
    outputCanvas,
    captureVideo,
    stop,
    stageIsFullyVisible: () => stageIsFullyVisible(stageElement),
  }
}
