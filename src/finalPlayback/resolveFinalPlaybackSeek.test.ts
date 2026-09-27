import { describe, expect, it } from 'vitest'
import type { NarrationTake } from '../narration/narrationTypes'
import type { FinalPlaybackPlan } from './finalPlaybackTypes'
import { resolveFinalPlaybackSeek } from './resolveFinalPlaybackSeek'

const take: NarrationTake = {
  id: 'take', presentationId: 'deck', sectionId: 'section', createdAt: '2026-01-01',
  durationMs: 2000, mimeType: 'audio/webm', selected: true, blob: new Blob(['audio']),
  cues: [{ type: 'slide', sceneId: 'second', timeMs: 0 }, { type: 'slide', sceneId: 'third', timeMs: 1000 }],
}

const plan: FinalPlaybackPlan = {
  segments: [
    { type: 'silent-scene', sceneId: 'first', durationMs: 1000 },
    { type: 'narration', sectionId: 'section', title: 'Section', sceneIds: ['second', 'third'], take, durationMs: 2000 },
  ],
  readiness: [], readinessIssues: [], warnings: [], isReady: true,
  unassignedSlideCount: 1, contentDurationMs: 3000, finalHoldMs: 500, totalDurationMs: 3500,
}

describe('resolveFinalPlaybackSeek', () => {
  it('crosses silent and narrated segment boundaries', () => {
    expect(resolveFinalPlaybackSeek(plan, 999).sceneId).toBe('first')
    expect(resolveFinalPlaybackSeek(plan, 1000)).toMatchObject({ segmentIndex: 1, segmentElapsedMs: 0, sceneId: 'second' })
    expect(resolveFinalPlaybackSeek(plan, 2500)).toMatchObject({ segmentIndex: 1, segmentElapsedMs: 1500, sceneId: 'third' })
  })

  it('clamps the playhead and holds the last visual at the end', () => {
    expect(resolveFinalPlaybackSeek(plan, -100)).toMatchObject({ timeMs: 0, sceneId: 'first' })
    expect(resolveFinalPlaybackSeek(plan, 3200)).toMatchObject({ timeMs: 3200, sceneId: 'third', inFinalHold: true })
    expect(resolveFinalPlaybackSeek(plan, 9000)).toMatchObject({ timeMs: 3500, sceneId: 'third', inFinalHold: true })
  })

  it('uses cue time order when cues are stored out of order', () => {
    const unsortedPlan = {
      ...plan,
      segments: [plan.segments[0], { ...plan.segments[1], take: { ...take, cues: [...take.cues].reverse() } }],
    } as FinalPlaybackPlan
    expect(resolveFinalPlaybackSeek(unsortedPlan, 2500).sceneId).toBe('third')
  })
})
