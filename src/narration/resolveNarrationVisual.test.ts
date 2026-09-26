import { describe, expect, it } from 'vitest'
import type { Slide } from '../model'
import { resolveNarrationVisualAtTime } from './resolveNarrationVisual'

function slide(id: string, orders: number[]): Slide {
  return {
    id,
    title: id,
    duration: 3,
    transition: { type: 'fade', duration: 0.2 },
    elements: orders.map((order, index) => ({
      id: `${id}-${index}`,
      name: `Element ${index}`,
      type: 'text' as const,
      text: 'Text',
      frame: { x: 0, y: 0, width: 100, height: 100 },
      animation: { entrance: 'fade' as const, order },
    })),
  }
}

const slides = [slide('one', [1, 1, 4]), slide('two', [2])]

describe('resolveNarrationVisualAtTime', () => {
  it('replays typed slide and reveal cues at their recorded times', () => {
    const cues = [
      { type: 'slide' as const, sceneId: 'one', timeMs: 0 },
      { type: 'reveal' as const, sceneId: 'one', order: 1, timeMs: 1300 },
      { type: 'reveal' as const, sceneId: 'one', order: 4, timeMs: 2800 },
      { type: 'slide' as const, sceneId: 'two', timeMs: 4900 },
      { type: 'reveal' as const, sceneId: 'two', order: 2, timeMs: 6200 },
    ]

    expect(resolveNarrationVisualAtTime(cues, 1200, slides)).toMatchObject({
      sceneId: 'one',
      revealState: { revealedThroughOrder: 0, activeRevealOrder: null },
    })
    expect(resolveNarrationVisualAtTime(cues, 1480, slides)).toMatchObject({
      sceneId: 'one',
      revealState: { revealedThroughOrder: 1, activeRevealOrder: 1, activeRevealElapsedMs: 180 },
    })
    expect(resolveNarrationVisualAtTime(cues, 5000, slides)).toMatchObject({
      sceneId: 'two',
      revealState: { revealedThroughOrder: 0, activeRevealOrder: null },
    })
    expect(resolveNarrationVisualAtTime(cues, 6380, slides)).toMatchObject({
      sceneId: 'two',
      revealState: { revealedThroughOrder: 2, activeRevealOrder: 2, activeRevealElapsedMs: 180 },
    })
  })

  it('uses the deterministic fallback cadence for legacy untyped slide cues', () => {
    const cues = [
      { sceneId: 'one', timeMs: 0 },
      { sceneId: 'two', timeMs: 3000 },
    ]

    expect(resolveNarrationVisualAtTime(cues, 599, slides).revealState.revealedThroughOrder).toBe(0)
    expect(resolveNarrationVisualAtTime(cues, 600, slides).revealState).toMatchObject({
      revealedThroughOrder: 1,
      activeRevealOrder: 1,
      activeRevealElapsedMs: 0,
    })
    expect(resolveNarrationVisualAtTime(cues, 1400, slides).revealState.revealedThroughOrder).toBe(4)
    expect(resolveNarrationVisualAtTime(cues, 3500, slides)).toMatchObject({
      sceneId: 'two',
      revealState: { revealedThroughOrder: 0 },
    })
  })

  it('is deterministic when queried repeatedly at a paused playhead', () => {
    const cues = [
      { type: 'slide' as const, sceneId: 'one', timeMs: 0 },
      { type: 'reveal' as const, sceneId: 'one', order: 1, timeMs: 1000 },
    ]
    const first = resolveNarrationVisualAtTime(cues, 1125, slides)
    expect(resolveNarrationVisualAtTime(cues, 1125, slides)).toEqual(first)
  })

  it('resets reveal state after the latest activation when a slide is revisited', () => {
    const cues = [
      { type: 'slide' as const, sceneId: 'one', timeMs: 0 },
      { type: 'reveal' as const, sceneId: 'one', order: 1, timeMs: 500 },
      { type: 'slide' as const, sceneId: 'two', timeMs: 1000 },
      { type: 'slide' as const, sceneId: 'one', timeMs: 1500 },
      { type: 'reveal' as const, sceneId: 'one', order: 4, timeMs: 1800 },
    ]
    expect(resolveNarrationVisualAtTime(cues, 1600, slides).revealState).toMatchObject({ revealedThroughOrder: 0, activeRevealOrder: null })
    expect(resolveNarrationVisualAtTime(cues, 1900, slides).revealState).toMatchObject({ revealedThroughOrder: 4, activeRevealOrder: 4, activeRevealElapsedMs: 100 })
  })
})
