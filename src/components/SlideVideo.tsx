import { useEffect, useRef, useState } from 'react'
import type { PresentationVideoAsset, SlideVideoElement } from '../model'
import type { VideoPlaybackState } from '../narration/resolveVideoPlayback'
import { clampVideoTimeSeconds } from '../videoFrameReadiness'
import './slideVideo.css'

interface SlideVideoProps {
  element: SlideVideoElement
  asset: PresentationVideoAsset
  playback?: VideoPlaybackState
  deterministicMotion?: boolean
}

const PLAYBACK_DRIFT_TOLERANCE_SECONDS = 0.15

function playbackFailureMessage(name: string, error?: MediaError | null) {
  if (error?.code === 2) {
    return `${name} could not be loaded. Re-import the original recording.`
  }
  if (error?.code === 3 || error?.code === 4) {
    return `${name} cannot be played. Re-record it or convert it to MP4 (H.264), then import it again.`
  }
  return `${name} could not be played. Re-import the recording or convert it to MP4 (H.264).`
}

function isExpectedPlaybackInterruption(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

export function SlideVideo({ element, asset, playback, deterministicMotion = false }: SlideVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const timeMs = playback?.timeMs ?? 0
  const playing = playback?.playing ?? false

  useEffect(() => setFailure(null), [asset.source])

  useEffect(() => {
    const video = videoRef.current
    if (!video || deterministicMotion) return
    video.muted = true
    const sync = () => {
      const targetSeconds = clampVideoTimeSeconds(timeMs, video.duration)
      const requestedSeconds = Math.max(0, timeMs / 1000)
      const atEnd = Number.isFinite(video.duration) && requestedSeconds >= video.duration
      if (!playing || atEnd) {
        video.pause()
        if (Math.abs(video.currentTime - targetSeconds) > 0.001) video.currentTime = targetSeconds
        return
      }
      if (Math.abs(video.currentTime - targetSeconds) > PLAYBACK_DRIFT_TOLERANCE_SECONDS) {
        video.currentTime = targetSeconds
      }
      void video.play().catch((error: unknown) => {
        if (isExpectedPlaybackInterruption(error) || !video.isConnected || video.paused || !playing) return
        setFailure(playbackFailureMessage(asset.name, video.error))
      })
    }
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) sync()
    else video.addEventListener('loadedmetadata', sync, { once: true })
    return () => video.removeEventListener('loadedmetadata', sync)
  }, [deterministicMotion, playing, timeMs, asset.source])

  return <>
    <video
      ref={videoRef}
      className="composition-video"
      src={asset.source}
      preload="auto"
      muted
      playsInline
      disablePictureInPicture
      data-slide-video="true"
      data-video-name={asset.name}
      data-video-time-ms={timeMs}
      style={{ objectFit: element.fit }}
      onLoadedData={() => setFailure(null)}
      onError={(event) => setFailure(playbackFailureMessage(asset.name, event.currentTarget.error))}
    />
    {failure && <div className="composition-video-error">{failure}</div>}
  </>
}
