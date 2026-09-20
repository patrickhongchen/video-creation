import type { SceneCue } from './narrationTypes'

export const CUE_SYNC_LEEWAY_MS = 8

export function sortSceneCues(cues: readonly SceneCue[]) {
  return [...cues].sort((left, right) => left.timeMs - right.timeMs)
}

interface SynchronizeSceneCuesOptions {
  cues: readonly SceneCue[]
  timeMs: number
  nextCueIndex: number
  onSceneCue: (sceneId: string) => void
  forceCurrentCue?: boolean
}

export function synchronizeSceneCues({
  cues,
  timeMs,
  nextCueIndex,
  onSceneCue,
  forceCurrentCue = false,
}: SynchronizeSceneCuesOptions) {
  let nextIndex = nextCueIndex
  if (forceCurrentCue) {
    let activeIndex = 0
    for (let index = 0; index < cues.length; index += 1) {
      if (cues[index].timeMs <= timeMs) activeIndex = index
      else break
    }
    if (cues[activeIndex]) onSceneCue(cues[activeIndex].sceneId)
    nextIndex = activeIndex + 1
  }
  while (nextIndex < cues.length && cues[nextIndex].timeMs <= timeMs + CUE_SYNC_LEEWAY_MS) {
    onSceneCue(cues[nextIndex].sceneId)
    nextIndex += 1
  }
  return nextIndex
}
