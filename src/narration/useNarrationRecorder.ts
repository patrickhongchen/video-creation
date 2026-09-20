import { useCallback, useEffect, useRef, useState } from 'react'
import type { NarrationRecorderStatus, NarrationRecording, SceneCue } from './narrationTypes'

const MIME_TYPE_PREFERENCES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

interface UseNarrationRecorderOptions {
  onRecordingStarted?: () => void
  onFinished: (recording: NarrationRecording) => void | Promise<void>
  onError: (message: string) => void
}

function microphoneErrorMessage(problem: unknown) {
  if (problem instanceof DOMException) {
    if (problem.name === 'NotAllowedError' || problem.name === 'SecurityError') return 'Microphone permission was denied. Allow microphone access and try again.'
    if (problem.name === 'NotFoundError' || problem.name === 'DevicesNotFoundError') return 'No microphone is available.'
    if (problem.name === 'NotReadableError' || problem.name === 'TrackStartError') return 'The microphone is already in use or could not be started.'
  }
  return problem instanceof Error ? problem.message : 'The microphone could not be started.'
}

export function useNarrationRecorder({ onRecordingStarted, onFinished, onError }: UseNarrationRecorderOptions) {
  const [status, setStatus] = useState<NarrationRecorderStatus>('idle')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const statusRef = useRef<NarrationRecorderStatus>('idle')
  const callbacksRef = useRef({ onRecordingStarted, onFinished, onError })
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const meterFrameRef = useRef<number | null>(null)
  const timerFrameRef = useRef<number | null>(null)
  const countdownTimerRef = useRef<number | null>(null)
  const countdownDeadlineRef = useRef(0)
  const chunksRef = useRef<Blob[]>([])
  const cuesRef = useRef<SceneCue[]>([])
  const startedAtRef = useRef(0)
  const stoppedAtRef = useRef(0)
  const stopRequestedRef = useRef(false)
  const cancelledRef = useRef(false)
  const attachRecorderEventsRef = useRef<(recorder: MediaRecorder) => void>(() => undefined)

  callbacksRef.current = { onRecordingStarted, onFinished, onError }

  const updateStatus = useCallback((nextStatus: NarrationRecorderStatus) => {
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  const stopAnimationFrames = useCallback(() => {
    if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current)
    if (timerFrameRef.current !== null) cancelAnimationFrame(timerFrameRef.current)
    meterFrameRef.current = null
    timerFrameRef.current = null
  }, [])

  const cleanUpMedia = useCallback(() => {
    stopAnimationFrames()
    if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current)
    countdownTimerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    analyserRef.current?.disconnect()
    analyserRef.current = null
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') void audioContextRef.current.close()
    audioContextRef.current = null
    recorderRef.current = null
    setLevel(0)
    setCountdown(null)
  }, [stopAnimationFrames])

  const reportError = useCallback((message: string) => {
    cleanUpMedia()
    setError(message)
    updateStatus('error')
    callbacksRef.current.onError(message)
  }, [cleanUpMedia, updateStatus])

  const runMeter = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    const samples = new Uint8Array(analyser.fftSize)
    const readLevel = () => {
      if (!analyserRef.current) return
      analyserRef.current.getByteTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) {
        const centered = (sample - 128) / 128
        sum += centered * centered
      }
      setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 3.5))
      meterFrameRef.current = requestAnimationFrame(readLevel)
    }
    readLevel()
  }, [])

  const runTimer = useCallback(() => {
    const update = () => {
      if (statusRef.current !== 'recording') return
      setElapsedMs(performance.now() - startedAtRef.current)
      timerFrameRef.current = requestAnimationFrame(update)
    }
    update()
  }, [])

  const prepare = useCallback(async () => {
    if (statusRef.current !== 'idle' && statusRef.current !== 'error') return
    setError('')
    updateStatus('requesting')

    if (!navigator.mediaDevices?.getUserMedia) {
      reportError('Microphone recording is not supported in this browser.')
      return
    }
    if (!('MediaRecorder' in globalThis)) {
      reportError('MediaRecorder is not supported in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if ((statusRef.current as NarrationRecorderStatus) !== 'requesting') {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream

      const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
        ? MIME_TYPE_PREFERENCES.find((candidate) => MediaRecorder.isTypeSupported(candidate))
        : undefined
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      attachRecorderEventsRef.current(recorder)

      const AudioContextConstructor = window.AudioContext
      const context = new AudioContextConstructor()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      audioContextRef.current = context
      analyserRef.current = analyser
      if (context.state === 'suspended') await context.resume()
      runMeter()
      updateStatus('ready')
    } catch (problem) {
      reportError(microphoneErrorMessage(problem))
    }
  }, [reportError, runMeter, updateStatus])

  const finishRecorder = useCallback((recorder: MediaRecorder) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onerror = () => reportError('Recording stopped because the microphone encountered an error.')
    recorder.onstop = () => {
      const wasCancelled = cancelledRef.current
      const wasExpected = stopRequestedRef.current
      const durationMs = Math.max(0, stoppedAtRef.current - startedAtRef.current)
      const mimeType = recorder.mimeType || chunksRef.current[0]?.type || 'application/octet-stream'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const cues = [...cuesRef.current]

      if (wasCancelled) {
        if (timerFrameRef.current !== null) cancelAnimationFrame(timerFrameRef.current)
        timerFrameRef.current = null
        chunksRef.current = []
        cuesRef.current = []
        setElapsedMs(0)
        updateStatus('ready')
        return
      }
      cleanUpMedia()
      if (!wasExpected) {
        reportError('Recording stopped unexpectedly. The partial take was not saved.')
        return
      }
      if (blob.size === 0) {
        reportError('The microphone returned an empty recording. Please try another take.')
        return
      }

      setElapsedMs(durationMs)
      updateStatus('stopping')
      void Promise.resolve(callbacksRef.current.onFinished({ blob, durationMs, mimeType, cues }))
        .then(() => updateStatus('idle'))
        .catch((problem: unknown) => {
          reportError(problem instanceof Error ? problem.message : 'The narration take could not be saved.')
        })
    }
  }, [cleanUpMedia, reportError, updateStatus])

  attachRecorderEventsRef.current = finishRecorder

  const beginAfterCountdown = useCallback((firstSceneId: string) => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'inactive') {
      reportError('The microphone is no longer ready. Please try again.')
      return
    }
    try {
      chunksRef.current = []
      cuesRef.current = [{ sceneId: firstSceneId, timeMs: 0 }]
      cancelledRef.current = false
      stopRequestedRef.current = false
      recorder.start(250)
      startedAtRef.current = performance.now()
      stoppedAtRef.current = startedAtRef.current
      setElapsedMs(0)
      setCountdown(null)
      updateStatus('recording')
      callbacksRef.current.onRecordingStarted?.()
      runTimer()
    } catch (problem) {
      reportError(microphoneErrorMessage(problem))
    }
  }, [reportError, runTimer, updateStatus])

  const startRecording = useCallback((firstSceneId: string) => {
    if (statusRef.current !== 'ready' || !firstSceneId) return
    updateStatus('countdown')
    setCountdown(3)
    countdownDeadlineRef.current = performance.now() + 3000
    countdownTimerRef.current = window.setInterval(() => {
      const remaining = Math.max(0, countdownDeadlineRef.current - performance.now())
      const nextCount = Math.ceil(remaining / 1000)
      setCountdown(nextCount || null)
      if (remaining <= 0) {
        if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
        beginAfterCountdown(firstSceneId)
      }
    }, 50)
  }, [beginAfterCountdown, updateStatus])

  const addCue = useCallback((sceneId: string) => {
    if (statusRef.current !== 'recording') return
    cuesRef.current.push({ sceneId, timeMs: Math.max(0, performance.now() - startedAtRef.current) })
  }, [])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (statusRef.current !== 'recording' || !recorder || recorder.state !== 'recording') return
    stopRequestedRef.current = true
    stoppedAtRef.current = performance.now()
    updateStatus('stopping')
    recorder.stop()
  }, [updateStatus])

  const cancel = useCallback(() => {
    const currentStatus = statusRef.current
    if (currentStatus === 'countdown') {
      if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
      setCountdown(null)
      updateStatus('ready')
      return
    }
    const recorder = recorderRef.current
    if (currentStatus === 'recording' && recorder?.state === 'recording') {
      cancelledRef.current = true
      stopRequestedRef.current = false
      stoppedAtRef.current = performance.now()
      updateStatus('stopping')
      recorder.stop()
      return
    }
    cancelledRef.current = true
    stopRequestedRef.current = false
    cleanUpMedia()
    chunksRef.current = []
    cuesRef.current = []
    setElapsedMs(0)
    updateStatus('idle')
  }, [cleanUpMedia, updateStatus])

  const resetError = useCallback(() => {
    if (statusRef.current === 'error') {
      setError('')
      updateStatus('idle')
    }
  }, [updateStatus])

  const getElapsedMs = useCallback(() => statusRef.current === 'recording'
    ? Math.max(0, performance.now() - startedAtRef.current)
    : elapsedMs, [elapsedMs])

  useEffect(() => () => {
    cancelledRef.current = true
    const recorder = recorderRef.current
    if (recorder?.state === 'recording') recorder.stop()
    cleanUpMedia()
  }, [cleanUpMedia])

  return {
    status,
    countdown,
    elapsedMs,
    level,
    error,
    prepare,
    startRecording,
    addCue,
    stopRecording,
    cancel,
    resetError,
    getElapsedMs,
  }
}
