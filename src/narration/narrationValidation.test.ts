import { describe, expect, it } from 'vitest'
import type { Slide } from '../model'
import type { NarrationTake, SceneCue } from './narrationTypes'
import { getTakeUsabilityIssue, type ResolvedNarrationSection } from './narrationValidation'

const slide: Slide = {
  id: 'slide-1',
  title: 'Slide 1',
  duration: 3,
  transition: { type: 'fade', duration: 0.2 },
  elements: [],
}

const section: ResolvedNarrationSection = {
  slides: [slide],
  indices: [0],
  valid: true,
  issue: '',
}

function take(cues: SceneCue[]): NarrationTake {
  return {
    id: 'take-1',
    presentationId: 'presentation-1',
    sectionId: 'section-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    durationMs: 2000,
    mimeType: 'audio/webm',
    cues,
    selected: true,
    blob: new Blob(['audio']),
  }
}

describe('narration cue validation', () => {
  it('preserves legacy untyped slide cues', () => {
    expect(getTakeUsabilityIssue(take([{ sceneId: slide.id, timeMs: 0 }]), section)).toBeNull()
  })

  it('accepts typed slide and positive safe-integer reveal cues', () => {
    expect(getTakeUsabilityIssue(take([
      { type: 'slide', sceneId: slide.id, timeMs: 0 },
      { type: 'reveal', sceneId: slide.id, order: 3, timeMs: 500 },
    ]), section)).toBeNull()
  })

  it('requires a slide cue first', () => {
    expect(getTakeUsabilityIssue(take([
      { type: 'reveal', sceneId: slide.id, order: 1, timeMs: 0 },
    ]), section)).toBe('The selected take must begin with a slide cue.')
  })

  it('rejects invalid reveal orders and unknown typed cues', () => {
    expect(getTakeUsabilityIssue(take([
      { type: 'slide', sceneId: slide.id, timeMs: 0 },
      { type: 'reveal', sceneId: slide.id, order: 0, timeMs: 500 },
    ]), section)).toBe('The selected take contains an invalid reveal cue.')

    const unknownCue = { type: 'chapter', sceneId: slide.id, timeMs: 500 } as unknown as SceneCue
    expect(getTakeUsabilityIssue(take([
      { type: 'slide', sceneId: slide.id, timeMs: 0 },
      unknownCue,
    ]), section)).toBe('The selected take contains an unknown cue type.')
  })
})
