import { isSlideCue, type SceneCue } from './narrationTypes'

export interface VideoPlaybackState {
  timeMs: number
  playing: boolean
}

/** Slide visits reset footage; clip pauses leave narration and pointer clocks running. */
export function resolveVideoPlaybackAtTime(
  cues: readonly SceneCue[],
  timeMs: number,
  sceneId: string,
): VideoPlaybackState {
  const now = Math.max(0, timeMs)
  let positionMs = 0
  let changedAtMs = 0
  let playing = true
  for (const cue of [...cues].sort((a, b) => a.timeMs - b.timeMs)) {
    if (cue.timeMs > now) break
    if (isSlideCue(cue)) {
      positionMs = 0
      changedAtMs = cue.timeMs
      playing = true
    }
    if (cue.sceneId === sceneId && 'type' in cue && cue.type === 'video') {
      positionMs = cue.positionMs
      changedAtMs = cue.timeMs
      playing = cue.action === 'resume'
    }
  }
  return { timeMs: positionMs + (playing ? Math.max(0, now - changedAtMs) : 0), playing }
}
