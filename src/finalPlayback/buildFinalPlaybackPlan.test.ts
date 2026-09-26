import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ENTRANCE_DURATION_MS,
  DEFAULT_SILENT_REVEAL_INTERVAL_MS,
  DEFAULT_SILENT_REVEAL_START_MS,
} from '../entranceAnimation'
import { samplePresentation } from '../samplePresentation'
import { buildFinalPlaybackPlan } from './buildFinalPlaybackPlan'

describe('buildFinalPlaybackPlan', () => {
  it('keeps silent segments long enough to finish every automatic reveal', () => {
    const sourceSlide = samplePresentation.slides[0]
    const slide = {
      ...sourceSlide,
      duration: 0.5,
      elements: sourceSlide.elements.map((element, index) => index < 3
        ? { ...element, animation: { entrance: 'fade' as const, order: [1, 3, 8][index] } }
        : element),
    }
    const plan = buildFinalPlaybackPlan({
      ...samplePresentation,
      slides: [slide],
      narration: undefined,
    }, {})

    expect(plan.segments[0]).toMatchObject({
      type: 'silent-scene',
      durationMs: DEFAULT_SILENT_REVEAL_START_MS
        + 2 * DEFAULT_SILENT_REVEAL_INTERVAL_MS
        + DEFAULT_ENTRANCE_DURATION_MS,
    })
  })

  it('preserves a longer authored silent duration as the minimum', () => {
    const slide = { ...samplePresentation.slides[0], duration: 5 }
    const plan = buildFinalPlaybackPlan({
      ...samplePresentation,
      slides: [slide],
      narration: undefined,
    }, {})

    expect(plan.segments[0]).toMatchObject({ type: 'silent-scene', durationMs: 5000 })
  })
})
