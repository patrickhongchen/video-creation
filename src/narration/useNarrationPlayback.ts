import { useCallback, useEffect, useRef, useState } from 'react'
import type { NarrationTake, SceneCue } from './narrationTypes'
import { sortSceneCues, synchronizeSceneCues } from './cueSynchronization'

interface UseNarrationPlaybackOptions {
  onSceneCue: (sceneId: string) => void
  onError: (message: string) => void
}

export function useNarrationPlayback({ onSceneCue, onError }: UseNarrationPlaybackOptions) {
  const [takeId, setTakeId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const sourceKeyRef = useRef<string | null>(null)
  const durationMsRef = useRef(0)
  const cuesRef = useRef<SceneCue[]>([])
  const nextCueIndexRef = useRef(0)
  const frameRef = useRef<number | null>(null)
  const callbacksRef = useRef({ onSceneCue, onError })
  callbacksRef.current = { onSceneCue, onError }

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  const releaseAudio = useCallback(() => {
    stopFrame()
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.onplay = null
      audio.onpause = null
      audio.onended = null
      audio.onerror = null
      audio.removeAttribute('src')
      audio.load()
    }
    audioRef.current = null
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
    sourceKeyRef.current = null
    cuesRef.current = []
    nextCueIndexRef.current = 0
  }, [stopFrame])

  const syncCues = useCallback((timeMs: number, force = false) => {
    nextCueIndexRef.current = synchronizeSceneCues({
      cues: cuesRef.current,
      timeMs,
      nextCueIndex: nextCueIndexRef.current,
      onSceneCue: callbacksRef.current.onSceneCue,
      forceCurrentCue: force,
    })
  }, [])

  const runFrame = useCallback(() => {
    const update = () => {
      const audio = audioRef.current
      if (!audio || audio.paused || audio.ended) return
      const timeMs = Math.min(durationMsRef.current, audio.currentTime * 1000)
      setCurrentTimeMs(timeMs)
      syncCues(timeMs)
      frameRef.current = requestAnimationFrame(update)
    }
    stopFrame()
    update()
  }, [stopFrame, syncCues])

  const attachAudioEvents = useCallback((audio: HTMLAudioElement) => {
    audio.onplay = () => { setIsPlaying(true); runFrame() }
    audio.onpause = () => { setIsPlaying(false); stopFrame(); setCurrentTimeMs(Math.min(durationMsRef.current, audio.currentTime * 1000)) }
    audio.onended = () => { setIsPlaying(false); stopFrame(); setCurrentTimeMs(durationMsRef.current) }
    audio.onerror = () => callbacksRef.current.onError('This narration audio could not be played.')
  }, [runFrame, stopFrame])

  const play = useCallback(async (take: NarrationTake, sourceBlob: Blob = take.blob, sourceKey = 'original', startAtMs?: number) => {
    let audio = audioRef.current
    const requestedSeconds = startAtMs === undefined ? undefined
      : Math.min(take.durationMs / 1000, Math.max(0, Number.isFinite(startAtMs) ? startAtMs / 1000 : 0))
    if (takeId !== take.id || sourceKeyRef.current !== sourceKey || !audio) {
      const resumeAtSeconds = requestedSeconds ?? (takeId === take.id && audio ? Math.min(take.durationMs / 1000, audio.currentTime) : 0)
      releaseAudio()
      if (!sourceBlob || sourceBlob.size === 0) {
        callbacksRef.current.onError('The audio Blob for this take is missing.')
        return
      }
      const url = URL.createObjectURL(sourceBlob)
      objectUrlRef.current = url
      audio = new Audio(url)
      audio.preload = 'auto'
      audioRef.current = audio
      sourceKeyRef.current = sourceKey
      durationMsRef.current = take.durationMs
      cuesRef.current = sortSceneCues(take.cues)
      nextCueIndexRef.current = 0
      setTakeId(take.id)
      setCurrentTimeMs(resumeAtSeconds * 1000)
      attachAudioEvents(audio)
      syncCues(resumeAtSeconds * 1000, true)
      if (resumeAtSeconds > 0) {
        const nextAudio = audio
        nextAudio.currentTime = resumeAtSeconds
        nextAudio.addEventListener('loadedmetadata', () => { if (audioRef.current === nextAudio) nextAudio.currentTime = resumeAtSeconds }, { once: true })
      }
    } else if (requestedSeconds !== undefined) {
      audio.currentTime = requestedSeconds
      setCurrentTimeMs(requestedSeconds * 1000)
      nextCueIndexRef.current = 0
      syncCues(requestedSeconds * 1000, true)
    }
    try {
      await audio.play()
    } catch (problem) {
      callbacksRef.current.onError(problem instanceof Error ? `Playback could not start: ${problem.message}` : 'Playback could not start.')
    }
  }, [attachAudioEvents, releaseAudio, syncCues, takeId])

  const pause = useCallback(() => audioRef.current?.pause(), [])

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    const requestedSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
    const nextSeconds = Math.min(requestedSeconds, durationMsRef.current / 1000)
    audio.currentTime = nextSeconds
    const timeMs = nextSeconds * 1000
    setCurrentTimeMs(timeMs)
    nextCueIndexRef.current = 0
    syncCues(timeMs, true)
  }, [syncCues])

  const restart = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    setCurrentTimeMs(0)
    nextCueIndexRef.current = 0
    syncCues(0, true)
    try {
      await audio.play()
    } catch (problem) {
      callbacksRef.current.onError(problem instanceof Error ? `Playback could not restart: ${problem.message}` : 'Playback could not restart.')
    }
  }, [syncCues])

  const stop = useCallback(() => {
    releaseAudio()
    setTakeId(null)
    setIsPlaying(false)
    setCurrentTimeMs(0)
  }, [releaseAudio])

  useEffect(() => stop, [stop])

  return { takeId, isPlaying, currentTimeMs, play, pause, seek, restart, stop }
}
