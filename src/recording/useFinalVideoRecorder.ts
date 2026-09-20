import { useCallback, useEffect, useRef, useState } from 'react'
import { chooseRecordingFormat, extensionForRecordedMime } from './recordingMime'
import { FINAL_VIDEO_FPS, prepareStageCapture, type StageCaptureSession } from './stageCapture'

export type FinalVideoRecorderStatus = 'unprepared' | 'preparing' | 'ready' | 'recording' | 'finalizing' | 'review'

const VIDEO_BITS_PER_SECOND = 10_000_000
const AUDIO_BITS_PER_SECOND = 192_000

interface UseFinalVideoRecorderOptions {
  onError: (message: string) => void
}

export function useFinalVideoRecorder({ onError }: UseFinalVideoRecorderOptions) {
  const [status, setStatus] = useState<FinalVideoRecorderStatus>('unprepared')
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [extension, setExtension] = useState<'mp4' | 'webm'>('webm')
  const sessionRef = useRef<StageCaptureSession | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const canvasStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const successfulStopRef = useRef(false)
  const statusRef = useRef(status)
  statusRef.current = status

  const revokeReview = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(null)
    setVideoBlob(null)
  }, [videoUrl])

  const stopCapture = useCallback(() => {
    sessionRef.current?.stop()
    sessionRef.current = null
    canvasStreamRef.current?.getTracks().forEach((track) => track.stop())
    canvasStreamRef.current = null
  }, [])

  const resetRecorder = useCallback(() => {
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    chunksRef.current = []
  }, [])

  const abort = useCallback((message?: string) => {
    successfulStopRef.current = false
    resetRecorder()
    stopCapture()
    setStatus('unprepared')
    if (message) onError(message)
  }, [onError, resetRecorder, stopCapture])

  const prepare = useCallback(async (stageElement: HTMLElement, outputCanvas: HTMLCanvasElement) => {
    if (statusRef.current === 'preparing' || statusRef.current === 'recording' || statusRef.current === 'finalizing') return
    revokeReview()
    stopCapture()
    if (typeof MediaRecorder === 'undefined') {
      onError('MediaRecorder is not supported in this browser.')
      return
    }
    setStatus('preparing')
    try {
      const session = await prepareStageCapture(
        stageElement,
        outputCanvas,
        () => {
          const wasRecording = statusRef.current === 'recording' || statusRef.current === 'finalizing'
          abort(wasRecording ? 'Video capture ended before rendering completed. Prepare capture and try again.' : undefined)
        },
        (message) => onError(`The live Stage crop failed: ${message}`),
      )
      if (session.displayStream.getVideoTracks()[0]?.readyState === 'ended') {
        session.stop()
        setStatus('unprepared')
        onError('Video capture ended before setup completed. Prepare capture and try again.')
        return
      }
      sessionRef.current = session
      setStatus('ready')
    } catch (problem) {
      stopCapture()
      setStatus('unprepared')
      onError(problem instanceof Error ? problem.message : 'Video capture could not be prepared.')
    }
  }, [abort, onError, revokeReview, stopCapture])

  const beginRecording = useCallback(async (audioStream: MediaStream) => {
    const session = sessionRef.current
    if (statusRef.current !== 'ready' || !session) throw new Error('Prepare browser-tab capture before rendering.')
    if (!session.stageIsFullyVisible()) throw new Error('The presentation Stage is not fully visible. Increase the browser window size or zoom out before rendering.')

    const canvasStream = session.outputCanvas.captureStream(FINAL_VIDEO_FPS)
    canvasStreamRef.current = canvasStream
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ])
    const preferredFormat = chooseRecordingFormat()
    let recorder: MediaRecorder
    try {
      recorder = preferredFormat.mimeType
        ? new MediaRecorder(combinedStream, {
            mimeType: preferredFormat.mimeType,
            videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
            audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
          })
        : new MediaRecorder(combinedStream, {
            videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
            audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
          })
    } catch {
      recorder = new MediaRecorder(combinedStream)
    }

    recorderRef.current = recorder
    chunksRef.current = []
    successfulStopRef.current = false
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onerror = () => abort('Video encoding stopped unexpectedly. The incomplete output was discarded.')
    recorder.onstop = () => {
      const completed = successfulStopRef.current
      const chunks = chunksRef.current
      chunksRef.current = []
      recorderRef.current = null
      stopCapture()
      if (!completed) return
      const mimeType = recorder.mimeType || chunks[0]?.type || preferredFormat.mimeType || 'video/webm'
      const blob = new Blob(chunks, { type: mimeType })
      if (blob.size === 0) {
        setStatus('unprepared')
        onError('The browser produced an empty video. Prepare capture and try again.')
        return
      }
      setExtension(extensionForRecordedMime(mimeType, preferredFormat.extension))
      setVideoBlob(blob)
      setVideoUrl(URL.createObjectURL(blob))
      setStatus('review')
    }
    recorder.start(1_000)
    setStatus('recording')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }, [abort, onError, stopCapture])

  const finishRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (statusRef.current !== 'recording' || !recorder || recorder.state === 'inactive') return
    successfulStopRef.current = true
    setStatus('finalizing')
    recorder.stop()
  }, [])

  const cancelRender = useCallback(() => abort(), [abort])

  const cancelCapture = useCallback(() => {
    if (statusRef.current === 'recording' || statusRef.current === 'finalizing') return
    stopCapture()
    setStatus('unprepared')
  }, [stopCapture])

  const discard = useCallback(() => {
    revokeReview()
    setStatus('unprepared')
  }, [revokeReview])

  useEffect(() => () => {
    successfulStopRef.current = false
    resetRecorder()
    stopCapture()
    if (videoUrl) URL.revokeObjectURL(videoUrl)
  }, [resetRecorder, stopCapture, videoUrl])

  return {
    status,
    videoBlob,
    videoUrl,
    extension,
    prepare,
    beginRecording,
    finishRecording,
    cancelRender,
    cancelCapture,
    discard,
  }
}
