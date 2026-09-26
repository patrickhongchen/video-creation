import { describe, expect, it } from 'vitest'
import { samplePresentation } from '../samplePresentation'
import type { DesktopExportJob } from '../desktop/desktopTypes'
import { resolvePlaybackVisual } from './resolvePlaybackVisual'

const [firstSlide, secondSlide, thirdSlide] = samplePresentation.slides

const job: Pick<DesktopExportJob, 'presentation' | 'segments'> = {
  presentation: samplePresentation,
  segments: [
    {
      type: 'narration',
      sectionId: 'section-a',
      title: 'Section A',
      sceneIds: [firstSlide.id, secondSlide.id],
      durationMs: 3000,
      cues: [
        { sceneId: firstSlide.id, timeMs: 500 },
        { sceneId: secondSlide.id, timeMs: 1200 },
        { sceneId: firstSlide.id, timeMs: 1800 },
      ],
      audio: { takeId: 'take-a', mimeType: 'audio/webm', bytes: new ArrayBuffer(1) },
    },
    { type: 'silent-scene', sceneId: thirdSlide.id, durationMs: 1000 },
  ],
}

describe('resolvePlaybackVisual', () => {
  it('uses legacy slide cues to select the active slide', () => {
    expect(resolvePlaybackVisual(job, 300)).toMatchObject({ slideIndex: 0 })
    expect(resolvePlaybackVisual(job, 900)).toMatchObject({ slideIndex: 0 })
    expect(resolvePlaybackVisual(job, 1500)).toMatchObject({ slideIndex: 1 })
  })

  it('returns deterministic reveal state for narration and silent segments', () => {
    expect(resolvePlaybackVisual(job, 2000)).toMatchObject({ slideIndex: 0, revealState: { revealedThroughOrder: 0 } })
    expect(resolvePlaybackVisual(job, 3000)).toMatchObject({ slideIndex: 2, revealState: { revealedThroughOrder: 0 } })
    expect(resolvePlaybackVisual(job, 3500)).toMatchObject({ slideIndex: 2, revealState: { revealedThroughOrder: 0 } })
  })

  it('uses the centralized automatic cadence for silent slide reveals', () => {
    const animatedSlide = {
      ...firstSlide,
      elements: firstSlide.elements.map((element, index) => index < 2
        ? { ...element, animation: { entrance: 'fade' as const, order: index === 0 ? 1 : 3 } }
        : element),
    }
    const silentJob: Pick<DesktopExportJob, 'presentation' | 'segments'> = {
      presentation: { ...samplePresentation, slides: [animatedSlide, ...samplePresentation.slides.slice(1)] },
      segments: [{ type: 'silent-scene', sceneId: animatedSlide.id, durationMs: 3000 }],
    }

    expect(resolvePlaybackVisual(silentJob, 599).revealState.revealedThroughOrder).toBe(0)
    expect(resolvePlaybackVisual(silentJob, 600).revealState).toMatchObject({
      revealedThroughOrder: 1,
      activeRevealOrder: 1,
      activeRevealElapsedMs: 0,
    })
    expect(resolvePlaybackVisual(silentJob, 1400).revealState.revealedThroughOrder).toBe(3)
  })

  it('resolves recorded reveal frames deterministically for export', () => {
    const animatedSlide = {
      ...firstSlide,
      elements: firstSlide.elements.map((element, index) => index === 0
        ? { ...element, animation: { entrance: 'fade' as const, order: 1 } }
        : element),
    }
    const typedJob: Pick<DesktopExportJob, 'presentation' | 'segments'> = {
      presentation: { ...samplePresentation, slides: [animatedSlide, ...samplePresentation.slides.slice(1)] },
      segments: [{
        type: 'narration', sectionId: 'section', title: 'Section', sceneIds: [animatedSlide.id], durationMs: 2000,
        cues: [{ type: 'slide', sceneId: animatedSlide.id, timeMs: 0 }, { type: 'reveal', sceneId: animatedSlide.id, order: 1, timeMs: 1000 }],
        audio: { takeId: 'take', mimeType: 'audio/webm', bytes: new ArrayBuffer(1) },
      }],
    }
    expect(resolvePlaybackVisual(typedJob, 999).revealState.revealedThroughOrder).toBe(0)
    const frame = resolvePlaybackVisual(typedJob, 1125)
    expect(frame.revealState).toMatchObject({ revealedThroughOrder: 1, activeRevealOrder: 1, activeRevealElapsedMs: 125 })
    expect(resolvePlaybackVisual(typedJob, 1125)).toEqual(frame)
  })
})
