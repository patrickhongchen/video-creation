import { describe, expect, it } from 'vitest'
import type { DesktopExportJob } from '../desktop/desktopTypes'
import type { NarrationTake } from '../narration/narrationTypes'
import { samplePresentation } from '../samplePresentation'
import type { FinalPlaybackPlan } from './finalPlaybackTypes'
import { resolveFinalPlaybackSeek } from './resolveFinalPlaybackSeek'
import { resolvePlaybackVisual } from './resolvePlaybackVisual'
import { resolveFinalVideoCaption } from './resolveFinalVideoCaption'
import { getFinalCaptionCoverage } from './getFinalCaptionCoverage'
import { buildFinalPlaybackPlan } from './buildFinalPlaybackPlan'

const [first, second] = samplePresentation.slides
const captions = {
  version: 1 as const, provider: 'whisper.cpp' as const, model: 'medium.en' as const,
  generatedAt: '2026-09-27T00:00:00.000Z',
  segments: [{ id: 'caption', startMs: 100, endMs: 1600, generatedText: 'Disney plus added subscribers.', text: 'Disney+ added subscribers.' }],
}
const take: NarrationTake = {
  id: 'take', presentationId: samplePresentation.id, sectionId: 'section', createdAt: '2026-09-27T00:00:00.000Z',
  durationMs: 2000, mimeType: 'audio/webm', selected: true, blob: new Blob(['audio']), captions,
  cues: [{ type: 'slide', sceneId: first.id, timeMs: 0 }, { type: 'slide', sceneId: second.id, timeMs: 800 }],
}
const plan: FinalPlaybackPlan = {
  segments: [
    { type: 'silent-scene', sceneId: first.id, durationMs: 500 },
    { type: 'narration', sectionId: 'section', title: 'Section', sceneIds: [first.id, second.id], take, durationMs: 2000 },
  ],
  readiness: [], readinessIssues: [], warnings: [], isReady: true,
  unassignedSlideCount: 1, contentDurationMs: 2500, finalHoldMs: 500, totalDurationMs: 3000,
}

function previewCaptionAt(globalTimeMs: number, enabled = true) {
  const position = resolveFinalPlaybackSeek(plan, globalTimeMs)
  const segment = plan.segments[position.segmentIndex]
  return resolveFinalVideoCaption(segment?.type === 'narration' ? segment.take.captions : undefined,
    position.segmentElapsedMs, enabled, position.inFinalHold)
}

describe('final-video captions', () => {
  it('reports missing selected-take captions without blocking a ready plan or counting silent slides', () => {
    const presentation = {
      ...samplePresentation,
      slides: [first, second],
      narration: { sections: [{ id: 'section', title: 'Section', slideIds: [first.id] }] },
    }
    const withoutCaptions = { ...take, cues: [{ type: 'slide' as const, sceneId: first.id, timeMs: 0 }], captions: undefined }
    const readyPlan = buildFinalPlaybackPlan(presentation, { section: [withoutCaptions] })
    expect(readyPlan.isReady).toBe(true)
    expect(readyPlan.segments.map((segment) => segment.type)).toEqual(['narration', 'silent-scene'])
    expect(getFinalCaptionCoverage(readyPlan)).toEqual({ narratedCount: 1, captionedCount: 0, missingSections: [{ sectionId: 'section', title: 'Section' }] })
  })

  it('follows scrubbing into the selected take, including gaps, silence, and the final hold', () => {
    expect(previewCaptionAt(499)).toBeNull()
    expect(previewCaptionAt(500)).toBeNull()
    expect(previewCaptionAt(600)).toBe('Disney+ added subscribers.')
    expect(previewCaptionAt(1300)).toBe('Disney+ added subscribers.')
    expect(previewCaptionAt(2100)).toBeNull()
    expect(previewCaptionAt(600, false)).toBeNull()
    expect(previewCaptionAt(2600)).toBeNull()
    expect(resolveFinalVideoCaption(undefined, 200, true)).toBeNull()
  })

  it('keeps the same corrected caption across an export slide transition', () => {
    const job: Pick<DesktopExportJob, 'presentation' | 'segments'> = {
      presentation: { ...samplePresentation, captionSettings: { enabled: true, style: 'social' } },
      segments: [{
        type: 'narration', sectionId: 'section', title: 'Section', sceneIds: [first.id, second.id],
        durationMs: 2000, cues: take.cues, captions,
        audio: { takeId: take.id, mimeType: take.mimeType, bytes: new ArrayBuffer(1) },
      }],
    }
    const before = resolvePlaybackVisual(job, 700)
    const after = resolvePlaybackVisual(job, 900)
    expect(before.slide.id).toBe(first.id)
    expect(after.slide.id).toBe(second.id)
    expect(resolveFinalVideoCaption(before.segment?.type === 'narration' ? before.segment.captions : undefined, before.segmentElapsedMs, true, before.inFinalHold)).toBe('Disney+ added subscribers.')
    expect(resolveFinalVideoCaption(after.segment?.type === 'narration' ? after.segment.captions : undefined, after.segmentElapsedMs, true, after.inFinalHold)).toBe('Disney+ added subscribers.')
    const hold = resolvePlaybackVisual(job, 2000)
    expect(resolveFinalVideoCaption(hold.segment?.type === 'narration' ? hold.segment.captions : undefined, hold.segmentElapsedMs, true, hold.inFinalHold)).toBeNull()
  })
})
