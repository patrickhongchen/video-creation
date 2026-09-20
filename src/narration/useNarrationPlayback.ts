import { useCallback, useEffect, useRef, useState } from 'react'
import type { NarrationTake, SceneCue } from './narrationTypes'

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
    cuesRef.current = []
    nextCueIndexRef.current = 0
  }, [stopFrame])

  const syncCues = useCallback((timeMs: number, force = false) => {
    const cues = cuesRef.current
    if (force) {
      let activeIndex = 0
      for (let index = 0; index < cues.length; index += 1) {
        if (cues[index].timeMs <= timeMs) activeIndex = index
        else break
      }
      nextCueIndexRef.current = activeIndex
      if (cues[activeIndex]) callbacksRef.current.onSceneCue(cues[activeIndex].sceneId)
      nextCueIndexRef.current = activeIndex + 1
    }
    while (nextCueIndexRef.current < cues.length && cues[nextCueIndexRef.current].timeMs <= timeMs + 8) {
      callbacksRef.current.onSceneCue(cues[nextCueIndexRef.current].sceneId)
      nextCueIndexRef.current += 1
    }
  }, [])

  const runFrame = useCallback(() => {
    const update = () => {
      const audio = audioRef.current
      if (!audio || audio.paused || audio.ended) return
      const timeMs = audio.currentTime * 1000
      setCurrentTimeMs(timeMs)
      syncCues(timeMs)
      frameRef.current = requestAnimationFrame(update)
    }
    stopFrame()
    update()
  }, [stopFrame, syncCues])

  const attachAudioEvents = useCallback((audio: HTMLAudioElement) => {
    audio.onplay = () => { setIsPlaying(true); runFrame() }
    audio.onpause = () => { setIsPlaying(false); stopFrame(); setCurrentTimeMs(audio.currentTime * 1000) }
    audio.onended = () => { setIsPlaying(false); stopFrame(); setCurrentTimeMs(audio.duration * 1000 || 0) }
    audio.onerror = () => callbacksRef.current.onError('This narration audio could not be played.')
  }, [runFrame, stopFrame])

  const play = useCallback(async (take: NarrationTake) => {
    let audio = audioRef.current
    if (takeId !== take.id || !audio) {
      releaseAudio()
      if (!take.blob || take.blob.size === 0) {
        callbacksRef.current.onError('The audio Blob for this take is missing.')
        return
      }
      const url = URL.createObjectURL(take.blob)
      objectUrlRef.current = url
      audio = new Audio(url)
      audio.preload = 'auto'
      audioRef.current = audio
      cuesRef.current = [...take.cues].sort((left, right) => left.timeMs - right.timeMs)
      nextCueIndexRef.current = 0
      setTakeId(take.id)
      setCurrentTimeMs(0)
      attachAudioEvents(audio)
      syncCues(0, true)
    }
    try {
      await audio.play()
    } catch (problem) {
      callbacksRef.current.onError(problem instanceof Error ? `Playback could not start: ${problem.message}` : 'Playback could not start.')
    }
  }, [attachAudioEvents, releaseAudio, syncCues, takeId])

  const pause = useCallback(() => audioRef.current?.pause(), [])

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

  return { takeId, isPlaying, currentTimeMs, play, pause, restart, stop }
}
