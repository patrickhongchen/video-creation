import type { NarrationCaptionSegment, NarrationCaptionTrack } from './narrationTypes'

/** Caption boundaries use the selected take's local clock. */
export function resolveCaptionAtTime(
  track: NarrationCaptionTrack | undefined,
  elapsedMs: number,
): NarrationCaptionSegment | null {
  if (!track || !Number.isFinite(elapsedMs)) return null
  return track.segments.find((segment) => elapsedMs >= segment.startMs && elapsedMs < segment.endMs) ?? null
}
