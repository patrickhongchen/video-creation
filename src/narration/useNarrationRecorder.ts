import { useCallback, useEffect, useRef, useState } from 'react'
import type { NarrationPointerSample, NarrationRecorderStatus, NarrationRecording, SceneCue, TypedSceneCue, TypedSceneCueInput } from './narrationTypes'

const POINTER_SAMPLE_INTERVAL_MS = 1000 / 30
const POINTER_POSITION_EPSILON = 0.001

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
  const [usedDefaultAfterFallback, setUsedDefaultAfterFallback] = useState(false)
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
  const pointerTrackRef = useRef<NarrationPointerSample[]>([])
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

  const prepare = useCallback(async (selectedDeviceId?: string) => {
    if (statusRef.current !== 'idle' && statusRef.current !== 'error') return
    setError('')
    setUsedDefaultAfterFallback(false)
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
      const supported = navigator.mediaDevices.getSupportedConstraints?.()
      const speechConstraints: MediaTrackConstraints = {}
      if (supported?.echoCancellation) speechConstraints.echoCancellation = true
      if (supported?.noiseSuppression) speechConstraints.noiseSuppression = true
      if (supported?.autoGainControl) speechConstraints.autoGainControl = false
      if (supported?.channelCount) speechConstraints.channelCount = 1
      const requestedDeviceId = selectedDeviceId?.trim()
      const preferredConstraints = requestedDeviceId
        ? { ...speechConstraints, deviceId: { exact: requestedDeviceId } }
        : speechConstraints
      let stream: MediaStream
      let fellBackToDefault = false
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: Object.keys(preferredConstraints).length > 0 ? preferredConstraints : true,
        })
      } catch (captureError) {
        const problemName = captureError instanceof DOMException || captureError instanceof TypeError
          ? captureError.name
          : ''
        const selectedDeviceUnavailable = Boolean(requestedDeviceId)
          && ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError', 'ConstraintNotSatisfiedError', 'TypeError'].includes(problemName)
        const optionalConstraintsRejected = !requestedDeviceId
          && ['OverconstrainedError', 'ConstraintNotSatisfiedError', 'TypeError'].includes(problemName)
        if (!selectedDeviceUnavailable && !optionalConstraintsRejected) throw captureError
        fellBackToDefault = selectedDeviceUnavailable

        // A saved microphone can disappear between enumeration and capture. Fall back
        // to the current default while keeping supported speech preferences when possible.
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: Object.keys(speechConstraints).length > 0 ? speechConstraints : true,
          })
        } catch (fallbackError) {
          const fallbackName = fallbackError instanceof DOMException || fallbackError instanceof TypeError
            ? fallbackError.name
            : ''
          if (!['OverconstrainedError', 'ConstraintNotSatisfiedError', 'TypeError'].includes(fallbackName)) throw fallbackError
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        }
      }
      if ((statusRef.current as NarrationRecorderStatus) !== 'requesting') {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      setUsedDefaultAfterFallback(fellBackToDefault)

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
      const pointerTrack = [...pointerTrackRef.current]

      if (wasCancelled) {
        if (timerFrameRef.current !== null) cancelAnimationFrame(timerFrameRef.current)
        timerFrameRef.current = null
        chunksRef.current = []
        cuesRef.current = []
        pointerTrackRef.current = []
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
      void Promise.resolve(callbacksRef.current.onFinished({ blob, durationMs, mimeType, cues, pointerTrack }))
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
      cuesRef.current = [{ type: 'slide', sceneId: firstSceneId, timeMs: 0 }]
      pointerTrackRef.current = []
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

  const addCue = useCallback((cue: TypedSceneCueInput) => {
    if (statusRef.current !== 'recording') return
    const timeMs = Math.max(0, performance.now() - startedAtRef.current)
    cuesRef.current.push({ ...cue, timeMs } as TypedSceneCue)
    return timeMs
  }, [])

  const addPointerSample = useCallback((sample: Omit<NarrationPointerSample, 'timeMs'>) => {
    if (statusRef.current !== 'recording' || !sample.sceneId) return
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)
      || sample.x < 0 || sample.x > 1 || sample.y < 0 || sample.y > 1) return
    const timeMs = Math.max(0, performance.now() - startedAtRef.current)
    const previous = pointerTrackRef.current.at(-1)
    if (!sample.visible && (!previous || !previous.visible)) return
    if (sample.visible && previous?.visible && previous.sceneId === sample.sceneId) {
      if (Math.abs(sample.x - previous.x) < POINTER_POSITION_EPSILON
        && Math.abs(sample.y - previous.y) < POINTER_POSITION_EPSILON) return
      if (timeMs - previous.timeMs < POINTER_SAMPLE_INTERVAL_MS) return
    }
    pointerTrackRef.current.push({ ...sample, timeMs })
    return timeMs
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
    pointerTrackRef.current = []
    setElapsedMs(0)
    updateStatus('idle')
  }, [cleanUpMedia, updateStatus])

  const resetError = useCallback(() => {
    if (statusRef.current === 'error') {
      setError('')
      updateStatus('idle')
    }
  }, [updateStatus])

  const getCues = useCallback(() => cuesRef.current, [])

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
    usedDefaultAfterFallback,
    prepare,
    startRecording,
    addCue,
    addPointerSample,
    stopRecording,
    cancel,
    resetError,
    getElapsedMs,
    getCues,
  }
}
