const METADATA_TIMEOUT_MS = 10_000
const SEEK_TIMEOUT_MS = 5_000
const TARGET_TOLERANCE_SECONDS = 0.0001
const LAST_FRAME_EPSILON_SECONDS = 0.001

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

function videoLabel(video: HTMLVideoElement) {
  return video.dataset.videoName || 'video asset'
}

function mediaError(video: HTMLVideoElement, action: string) {
  if (video.error?.code === 2) {
    return new Error(`${videoLabel(video)} could not be loaded. Re-import the original recording.`)
  }
  if (video.error?.code === 3 || video.error?.code === 4) {
    return new Error(`${videoLabel(video)} cannot be decoded. Re-record it or convert it to MP4 (H.264), then import it again.`)
  }
  const detail = video.error?.message ? `: ${video.error.message}` : ''
  return new Error(`Could not ${action} ${videoLabel(video)}${detail}`)
}

function waitForMediaEvent(
  video: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'loadeddata' | 'seeked',
  timeoutMs: number,
  action: string,
) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer)
      video.removeEventListener(eventName, onReady)
      video.removeEventListener('error', onError)
      if (error) reject(error)
      else resolve()
    }
    const onReady = () => finish()
    const onError = () => finish(mediaError(video, action))
    const timer = window.setTimeout(
      () => finish(new Error(`Timed out while waiting to ${action} ${videoLabel(video)}.`)),
      timeoutMs,
    )
    video.addEventListener(eventName, onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

export async function waitForVideoMetadata(video: HTMLVideoElement) {
  if (video.error) throw mediaError(video, 'load')
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await waitForMediaEvent(video, 'loadedmetadata', METADATA_TIMEOUT_MS, 'load metadata for')
  }
}

export function clampVideoTimeSeconds(timeMs: number, duration: number) {
  const requestedSeconds = Math.max(0, Number.isFinite(timeMs) ? timeMs / 1000 : 0)
  if (!Number.isFinite(duration) || duration < 0) return requestedSeconds
  const lastPresentableTime = duration === 0 ? 0 : Math.max(0, duration - LAST_FRAME_EPSILON_SECONDS)
  return Math.min(requestedSeconds, lastPresentableTime)
}

async function waitForDecodedFrame(video: VideoWithFrameCallback) {
  if (!video.requestVideoFrameCallback) return
  await new Promise<void>((resolve, reject) => {
    let callbackHandle: number | undefined
    const timer = window.setTimeout(() => {
      if (callbackHandle !== undefined) video.cancelVideoFrameCallback?.(callbackHandle)
      reject(new Error(`Timed out while decoding a frame from ${videoLabel(video)}.`))
    }, SEEK_TIMEOUT_MS)
    const onFrame = () => {
      if (video.seeking) {
        callbackHandle = video.requestVideoFrameCallback!(onFrame)
        return
      }
      clearTimeout(timer)
      resolve()
    }
    callbackHandle = video.requestVideoFrameCallback!(onFrame)
  })
}

/** Seeks a mounted video and resolves only after its requested frame is decoded. */
export async function seekVideoToTime(video: HTMLVideoElement, timeMs: number) {
  video.muted = true
  video.pause()
  await waitForVideoMetadata(video)
  const targetSeconds = clampVideoTimeSeconds(timeMs, video.duration)
  const mustSeek = video.seeking || Math.abs(video.currentTime - targetSeconds) > TARGET_TOLERANCE_SECONDS
  if (mustSeek) {
    const seeked = waitForMediaEvent(video, 'seeked', SEEK_TIMEOUT_MS, 'seek')
    const decoded = waitForDecodedFrame(video)
    video.currentTime = targetSeconds
    await Promise.all([seeked, decoded])
  } else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForMediaEvent(video, 'loadeddata', SEEK_TIMEOUT_MS, 'decode the first frame of')
  }
  if (video.error) throw mediaError(video, 'decode')
}

/** Prepares every video in a rendered slide before an offscreen screenshot. */
export async function prepareSlideVideoFrames(root: ParentNode) {
  const videos = [...root.querySelectorAll<HTMLVideoElement>('video[data-slide-video]')]
  await Promise.all(videos.map((video) => seekVideoToTime(video, Number(video.dataset.videoTimeMs ?? 0))))
}
