import type { NarrationCaptionTrack } from '../narration/narrationTypes'
import { resolveCaptionAtTime } from '../narration/resolveNarrationCaption'

/** Shared caption selection for preview and exact-timestamp export frames. */
export function resolveFinalVideoCaption(
  track: NarrationCaptionTrack | undefined,
  segmentElapsedMs: number,
  enabled: boolean,
  inFinalHold = false,
): string | null {
  if (!enabled || inFinalHold) return null
  return resolveCaptionAtTime(track, segmentElapsedMs)?.text ?? null
}
