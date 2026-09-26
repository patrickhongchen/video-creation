import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sortSceneCues, synchronizeSceneCues } from '../narration/cueSynchronization'
import { isSlideCue } from '../narration/narrationTypes'
import type { FinalPlaybackPlan, FinalPlaybackSegment } from './finalPlaybackTypes'

export type FinalPlaybackStatus = 'idle' | 'playing' | 'paused' | 'completed'

interface UseFinalPlaybackOptions {
  plan: FinalPlaybackPlan
  onError: (message: string) => void
  onComplete?: () => void
}

function firstSceneId(segment: FinalPlaybackSegment | undefined) {
  return segment?.type === 'narration'
    ? segment.take.cues.find(isSlideCue)?.sceneId ?? segment.sceneIds[0]
    : segment?.sceneId
}

function createRunKey() {
  return `final-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useFinalPlayback({ plan, onError, onComplete }: UseFinalPlaybackOptions) {
  const [status, setStatus] = useState<FinalPlaybackStatus>('idle')
  const [segmentIndex, setSegmentIndex] = useState(0)
  const [activeSceneId, setActiveSceneId] = useState<string | undefined>(() => firstSceneId(plan.segments[0]))
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [renderInstanceKey, setRenderInstanceKey] = useState(createRunKey)
  const statusRef = useRef<FinalPlaybackStatus>('idle')
  const segmentIndexRef = useRef(0)
  const activeSceneIdRef = useRef(activeSceneId)
  const frameRef = useRef<number | null>(null)
  const runTokenRef = useRef(0)
  const silentStartedAtRef = useRef(0)
  const silentElapsedRef = useRef(0)
  const inFinalHoldRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const callbacksRef = useRef({ onError, onComplete })
  const planRef = useRef(plan)
  callbacksRef.current = { onError, onComplete }
  planRef.current = plan
  statusRef.current = status
  segmentIndexRef.current = segmentIndex
  activeSceneIdRef.current = activeSceneId

  const segmentOffsets = useMemo(() => {
    let elapsed = 0
    return plan.segments.map((segment) => {
      const offset = elapsed
      elapsed += segment.durationMs
      return offset
    })
  }, [plan.segments])
  const segmentOffsetsRef = useRef(segmentOffsets)
  segmentOffsetsRef.current = segmentOffsets

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  const releaseCurrentAudio = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.onended = null
      audio.onerror = null
      audio.removeAttribute('src')
      audio.load()
    }
    audioRef.current = null
    audioSourceRef.current?.disconnect()
    audioSourceRef.current = null
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    audioUrlRef.current = null
  }, [])

  const ensureAudioReady = useCallback(async () => {
    let context = audioContextRef.current
    if (!context || context.state === 'closed') {
      context = new AudioContext()
      audioContextRef.current = context
      audioDestinationRef.current = context.createMediaStreamDestination()
    }
    if (context.state === 'suspended') await context.resume()
    return audioDestinationRef.current!.stream
  }, [])

  const disposeAudio = useCallback(async () => {
    releaseCurrentAudio()
    const context = audioContextRef.current
    audioDestinationRef.current?.disconnect()
    audioDestinationRef.current = null
    audioContextRef.current = null
    if (context && context.state !== 'closed') await context.close()
  }, [releaseCurrentAudio])

  const failPlayback = useCallback((message: string) => {
    runTokenRef.current += 1
    stopFrame()
    releaseCurrentAudio()
    setStatus('idle')
    statusRef.current = 'idle'
    callbacksRef.current.onError(message)
  }, [releaseCurrentAudio, stopFrame])

  const startSegmentRef = useRef<(index: number, token: number) => Promise<void>>(async () => undefined)

  const finishAfterHold = useCallback((token: number) => {
    releaseCurrentAudio()
    inFinalHoldRef.current = true
    silentStartedAtRef.current = performance.now()
    const update = () => {
      if (runTokenRef.current !== token || statusRef.current !== 'playing') return
      const holdElapsed = silentElapsedRef.current + (performance.now() - silentStartedAtRef.current)
      setCurrentTimeMs(Math.min(planRef.current.totalDurationMs, planRef.current.contentDurationMs + holdElapsed))
      if (holdElapsed >= planRef.current.finalHoldMs) {
        stopFrame()
        inFinalHoldRef.current = false
        silentElapsedRef.current = 0
        setCurrentTimeMs(planRef.current.totalDurationMs)
        setStatus('completed')
        statusRef.current = 'completed'
        callbacksRef.current.onComplete?.()
        return
      }
      frameRef.current = requestAnimationFrame(update)
    }
    stopFrame()
    frameRef.current = requestAnimationFrame(update)
  }, [releaseCurrentAudio, stopFrame])

  const runSilentFrame = useCallback((segment: FinalPlaybackSegment, index: number, token: number) => {
    const update = () => {
      if (runTokenRef.current !== token || statusRef.current !== 'playing') return
      const elapsed = silentElapsedRef.current + (performance.now() - silentStartedAtRef.current)
      setCurrentTimeMs(Math.min(planRef.current.totalDurationMs, (segmentOffsetsRef.current[index] ?? 0) + elapsed))
      if (elapsed >= segment.durationMs) {
        silentElapsedRef.current = 0
        void startSegmentRef.current(index + 1, token)
        return
      }
      frameRef.current = requestAnimationFrame(update)
    }
    stopFrame()
    frameRef.current = requestAnimationFrame(update)
  }, [stopFrame])

  const runNarrationFrame = useCallback((segment: Extract<FinalPlaybackSegment, { type: 'narration' }>, index: number, token: number) => {
    let nextCueIndex = 1
    const cues = sortSceneCues(segment.take.cues)
    const update = () => {
      const audio = audioRef.current
      if (runTokenRef.current !== token || statusRef.current !== 'playing' || !audio) return
      const timeMs = audio.currentTime * 1000
      setCurrentTimeMs(Math.min(planRef.current.totalDurationMs, (segmentOffsetsRef.current[index] ?? 0) + timeMs))
      nextCueIndex = synchronizeSceneCues({
        cues,
        timeMs,
        nextCueIndex,
        onSceneCue: (sceneId) => {
          setActiveSceneId(sceneId)
          activeSceneIdRef.current = sceneId
        },
      })
      if (!audio.ended) frameRef.current = requestAnimationFrame(update)
    }
    stopFrame()
    frameRef.current = requestAnimationFrame(update)
  }, [stopFrame])

  startSegmentRef.current = async (index: number, token: number) => {
    if (runTokenRef.current !== token) return
    stopFrame()
    releaseCurrentAudio()
    const segment = planRef.current.segments[index]
    if (!segment) {
      silentElapsedRef.current = 0
      finishAfterHold(token)
      return
    }

    segmentIndexRef.current = index
    setSegmentIndex(index)
    const initialSceneId = firstSceneId(segment)
    activeSceneIdRef.current = initialSceneId
    setActiveSceneId(initialSceneId)
    setCurrentTimeMs(segmentOffsetsRef.current[index] ?? 0)

    if (segment.type === 'silent-scene') {
      silentElapsedRef.current = 0
      silentStartedAtRef.current = performance.now()
      runSilentFrame(segment, index, token)
      return
    }

    try {
      const context = audioContextRef.current
      const destination = audioDestinationRef.current
      if (!context || !destination) await ensureAudioReady()
      const activeContext = audioContextRef.current!
      const activeDestination = audioDestinationRef.current!
      const url = URL.createObjectURL(segment.take.blob)
      audioUrlRef.current = url
      const audio = new Audio(url)
      audio.preload = 'auto'
      audioRef.current = audio
      const source = activeContext.createMediaElementSource(audio)
      audioSourceRef.current = source
      source.connect(activeContext.destination)
      source.connect(activeDestination)
      audio.onended = () => {
        if (runTokenRef.current === token) void startSegmentRef.current(index + 1, token)
      }
      audio.onerror = () => failPlayback(`“${segment.title}” uses narration audio that this browser could not decode.`)
      await audio.play()
      if (runTokenRef.current !== token) return
      runNarrationFrame(segment, index, token)
    } catch (problem) {
      failPlayback(problem instanceof Error ? `Final playback could not start: ${problem.message}` : 'Final playback could not start.')
    }
  }

  const restart = useCallback(async () => {
    const token = runTokenRef.current + 1
    runTokenRef.current = token
    stopFrame()
    releaseCurrentAudio()
    if (planRef.current.segments.length === 0) {
      failPlayback('The presentation has no playable slides.')
      return
    }
    try {
      await ensureAudioReady()
    } catch (problem) {
      failPlayback(problem instanceof Error ? `Audio output could not be prepared: ${problem.message}` : 'Audio output could not be prepared.')
      return
    }
    segmentIndexRef.current = 0
    setSegmentIndex(0)
    setCurrentTimeMs(0)
    setRenderInstanceKey(createRunKey())
    inFinalHoldRef.current = false
    setStatus('playing')
    statusRef.current = 'playing'
    await startSegmentRef.current(0, token)
  }, [ensureAudioReady, failPlayback, releaseCurrentAudio, stopFrame])

  const pause = useCallback(() => {
    if (statusRef.current !== 'playing') return
    const segment = planRef.current.segments[segmentIndexRef.current]
    if (inFinalHoldRef.current) {
      silentElapsedRef.current += performance.now() - silentStartedAtRef.current
    } else if (segment?.type === 'narration') {
      audioRef.current?.pause()
    } else {
      silentElapsedRef.current += performance.now() - silentStartedAtRef.current
    }
    stopFrame()
    setStatus('paused')
    statusRef.current = 'paused'
  }, [stopFrame])

  const play = useCallback(async () => {
    if (statusRef.current !== 'paused') {
      await restart()
      return
    }
    const segment = planRef.current.segments[segmentIndexRef.current]
    setStatus('playing')
    statusRef.current = 'playing'
    if (inFinalHoldRef.current) {
      finishAfterHold(runTokenRef.current)
    } else if (segment?.type === 'narration') {
      try {
        await audioRef.current?.play()
        runNarrationFrame(segment, segmentIndexRef.current, runTokenRef.current)
      } catch (problem) {
        failPlayback(problem instanceof Error ? `Final playback could not resume: ${problem.message}` : 'Final playback could not resume.')
      }
    } else if (segment) {
      silentStartedAtRef.current = performance.now()
      runSilentFrame(segment, segmentIndexRef.current, runTokenRef.current)
    }
  }, [failPlayback, finishAfterHold, restart, runNarrationFrame, runSilentFrame])

  const stop = useCallback(() => {
    runTokenRef.current += 1
    stopFrame()
    releaseCurrentAudio()
    silentElapsedRef.current = 0
    inFinalHoldRef.current = false
    segmentIndexRef.current = 0
    setSegmentIndex(0)
    const sceneId = firstSceneId(planRef.current.segments[0])
    activeSceneIdRef.current = sceneId
    setActiveSceneId(sceneId)
    setCurrentTimeMs(0)
    setStatus('idle')
    statusRef.current = 'idle'
  }, [releaseCurrentAudio, stopFrame])

  useEffect(() => {
    if (statusRef.current !== 'idle') stop()
    else {
      const sceneId = firstSceneId(plan.segments[0])
      setActiveSceneId(sceneId)
      setSegmentIndex(0)
      setCurrentTimeMs(0)
    }
  }, [plan, stop])

  useEffect(() => () => {
    runTokenRef.current += 1
    stopFrame()
    releaseCurrentAudio()
    const context = audioContextRef.current
    if (context && context.state !== 'closed') void context.close()
  }, [releaseCurrentAudio, stopFrame])

  const activeSegment = plan.segments[segmentIndex]

  return {
    status,
    activeSegment,
    activeSceneId,
    currentTimeMs,
    totalDurationMs: plan.totalDurationMs,
    renderInstanceKey,
    play,
    pause,
    restart,
    stop,
    ensureAudioReady,
    disposeAudio,
  }
}
