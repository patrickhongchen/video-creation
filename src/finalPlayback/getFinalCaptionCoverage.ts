import type { FinalPlaybackPlan, NarrationPlaybackSegment } from './finalPlaybackTypes'

/** Counts only usable selected takes that actually enter the final video. */
export function getFinalCaptionCoverage(plan: FinalPlaybackPlan) {
  const narrated = plan.segments.filter((segment): segment is NarrationPlaybackSegment => segment.type === 'narration')
  const missingSections = narrated
    .filter((segment) => !segment.take.captions?.segments.length)
    .map(({ sectionId, title }) => ({ sectionId, title }))
  return {
    narratedCount: narrated.length,
    captionedCount: narrated.length - missingSections.length,
    missingSections,
  }
}
