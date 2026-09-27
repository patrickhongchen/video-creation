import { useCallback, useEffect, useRef, useState } from 'react'
import type { FinalPlaybackPlan } from './finalPlaybackTypes'
import { resolveFinalPlaybackSeek } from './resolveFinalPlaybackSeek'
import type { FinalPlaybackStatus } from './useFinalPlayback'

function createRunKey() {
  return `final-program-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** One mastered audio clock drives the complete visual timeline, including silent beats. */
export function useFinalProgramPlayback(plan: FinalPlaybackPlan, audioBlob: Blob | null, onError: (message: string) => void) {
  const [status, setStatus] = useState<FinalPlaybackStatus>('idle')
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [renderInstanceKey, setRenderInstanceKey] = useState(createRunKey)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const frameRef = useRef<number | null>(null)
  const statusRef = useRef<FinalPlaybackStatus>('idle')
  const planRef = useRef(plan)
  const errorRef = useRef(onError)
  planRef.current = plan
  errorRef.current = onError

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  const releaseAudio = useCallback(() => {
    stopFrame()
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.onended = null
      audio.onerror = null
      audio.removeAttribute('src')
      audio.load()
    }
    audioRef.current = null
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
  }, [stopFrame])

  const finish = useCallback(() => {
    stopFrame()
    audioRef.current?.pause()
    setCurrentTimeMs(planRef.current.totalDurationMs)
    setStatus('completed')
    statusRef.current = 'completed'
  }, [stopFrame])

  const runFrame = useCallback(() => {
    stopFrame()
    const update = () => {
      const audio = audioRef.current
      if (!audio || statusRef.current !== 'playing') return
      const timeMs = Math.min(planRef.current.totalDurationMs, audio.currentTime * 1000)
      setCurrentTimeMs(timeMs)
      if (timeMs >= planRef.current.totalDurationMs) {
        finish()
        return
      }
      frameRef.current = requestAnimationFrame(update)
    }
    frameRef.current = requestAnimationFrame(update)
  }, [finish, stopFrame])

  const ensureAudio = useCallback(() => {
    if (!audioBlob) throw new Error('The mastered preview audio is not ready.')
    if (audioRef.current) return audioRef.current
    const url = URL.createObjectURL(audioBlob)
    objectUrlRef.current = url
    const audio = new Audio(url)
    audio.preload = 'auto'
    audio.onended = finish
    audio.onerror = () => {
      stopFrame()
      setStatus('idle')
      statusRef.current = 'idle'
      errorRef.current('The mastered final preview audio could not be played.')
    }
    audioRef.current = audio
    return audio
  }, [audioBlob, finish, stopFrame])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    stopFrame()
    setCurrentTimeMs(0)
    setStatus('idle')
    statusRef.current = 'idle'
  }, [stopFrame])

  const disposeAudio = useCallback(async () => releaseAudio(), [releaseAudio])

  const play = useCallback(async () => {
    try {
      const audio = ensureAudio()
      if (statusRef.current === 'completed') {
        audio.currentTime = 0
        setCurrentTimeMs(0)
        setRenderInstanceKey(createRunKey())
      }
      await audio.play()
      setStatus('playing')
      statusRef.current = 'playing'
      runFrame()
    } catch (problem) {
      setStatus('idle')
      statusRef.current = 'idle'
      errorRef.current(problem instanceof Error ? `Final preview could not start: ${problem.message}` : 'Final preview could not start.')
    }
  }, [ensureAudio, runFrame])

  const pause = useCallback(() => {
    if (statusRef.current !== 'playing') return
    const audio = audioRef.current
    audio?.pause()
    if (audio) setCurrentTimeMs(Math.min(planRef.current.totalDurationMs, audio.currentTime * 1000))
    stopFrame()
    setStatus('paused')
    statusRef.current = 'paused'
  }, [stopFrame])

  const seek = useCallback(async (requestedMs: number) => {
    const target = resolveFinalPlaybackSeek(planRef.current, requestedMs)
    const audio = ensureAudio()
    audio.currentTime = target.timeMs / 1000
    if (audio.readyState === 0) {
      audio.addEventListener('loadedmetadata', () => {
        if (audioRef.current === audio) audio.currentTime = target.timeMs / 1000
      }, { once: true })
    }
    setCurrentTimeMs(target.timeMs)
    setRenderInstanceKey(createRunKey())
    if (target.timeMs >= planRef.current.totalDurationMs) {
      finish()
    } else if (statusRef.current === 'idle' || statusRef.current === 'completed') {
      setStatus('paused')
      statusRef.current = 'paused'
    }
  }, [ensureAudio, finish])

  useEffect(() => {
    releaseAudio()
    setCurrentTimeMs(0)
    setStatus('idle')
    statusRef.current = 'idle'
    setRenderInstanceKey(createRunKey())
  }, [audioBlob, plan, releaseAudio])

  useEffect(() => () => releaseAudio(), [releaseAudio])

  const position = resolveFinalPlaybackSeek(plan, currentTimeMs)
  return {
    status,
    activeSegment: plan.segments[position.segmentIndex],
    activeSceneId: position.sceneId,
    currentTimeMs,
    totalDurationMs: plan.totalDurationMs,
    renderInstanceKey,
    play,
    pause,
    seek,
    stop,
    disposeAudio,
  }
}
