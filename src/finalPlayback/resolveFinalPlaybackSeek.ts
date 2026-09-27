import { sortSceneCues } from '../narration/cueSynchronization'
import { isSlideCue } from '../narration/narrationTypes'
import type { FinalPlaybackPlan, FinalPlaybackSegment } from './finalPlaybackTypes'

function sceneAt(segment: FinalPlaybackSegment, elapsedMs: number) {
  if (segment.type === 'silent-scene') return segment.sceneId
  return sortSceneCues(segment.take.cues)
    .filter(isSlideCue)
    .filter((cue) => cue.timeMs <= elapsedMs)
    .at(-1)?.sceneId ?? segment.sceneIds[0]
}

/** Maps a whole-video playhead position to its segment and visible slide. */
export function resolveFinalPlaybackSeek(plan: FinalPlaybackPlan, requestedMs: number) {
  const timeMs = Math.min(plan.totalDurationMs, Math.max(0, Number.isFinite(requestedMs) ? requestedMs : 0))
  if (plan.segments.length === 0) {
    return { timeMs, segmentIndex: 0, segmentElapsedMs: 0, sceneId: undefined, inFinalHold: false }
  }

  let startMs = 0
  for (const [segmentIndex, segment] of plan.segments.entries()) {
    const endMs = startMs + segment.durationMs
    if (timeMs < endMs) {
      const segmentElapsedMs = timeMs - startMs
      return { timeMs, segmentIndex, segmentElapsedMs, sceneId: sceneAt(segment, segmentElapsedMs), inFinalHold: false }
    }
    startMs = endMs
  }

  const segmentIndex = plan.segments.length - 1
  const segment = plan.segments[segmentIndex]
  return {
    timeMs,
    segmentIndex,
    segmentElapsedMs: segment.durationMs,
    sceneId: sceneAt(segment, segment.durationMs),
    inFinalHold: true,
  }
}
