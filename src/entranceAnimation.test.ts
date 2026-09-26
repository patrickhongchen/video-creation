import { describe, expect, it } from 'vitest'
import { FINAL_ENTRANCE_STATE, chartMorphKey, continuingChartKeys, resolveEntranceState, slideElapsedFromCues, slideElapsedMs } from './entranceAnimation'
import type { SlideEntranceAnimation } from './model'
import { createBlankPresentation, createSlideChartElement } from './presentationFactories'

const animation = (entrance: SlideEntranceAnimation['entrance']): SlideEntranceAnimation => ({ entrance, delayMs: 600, durationMs: 400 })

describe('resolveEntranceState', () => {
  it('leaves unanimated and edit-mode elements at their exact final state', () => {
    expect(resolveEntranceState(undefined, 0)).toEqual(FINAL_ENTRANCE_STATE)
    expect(resolveEntranceState(animation('fade'), null)).toEqual(FINAL_ENTRANCE_STATE)
  })

  it('appears immediately at the delay and ignores duration', () => {
    expect(resolveEntranceState(animation('appear'), 599).opacity).toBe(0)
    expect(resolveEntranceState(animation('appear'), 600)).toEqual(FINAL_ENTRANCE_STATE)
  })

  it.each(['fade', 'pop', 'slide-up', 'slide-left', 'slide-right'] as const)('%s has initial, interpolated, and exact final states', (entrance) => {
    const config = animation(entrance)
    const before = resolveEntranceState(config, 599)
    const during = resolveEntranceState(config, 800)
    expect(before.opacity).toBe(0)
    expect(during.opacity).toBeGreaterThan(0)
    expect(during.opacity).toBeLessThan(1)
    expect(resolveEntranceState(config, 1000)).toEqual(FINAL_ENTRANCE_STATE)
  })

  it('uses the intended subtle direction and scale', () => {
    expect(resolveEntranceState(animation('pop'), 0).scale).toBeCloseTo(0.94)
    expect(resolveEntranceState(animation('slide-up'), 0).y).toBeGreaterThan(0)
    expect(resolveEntranceState(animation('slide-left'), 0).x).toBeGreaterThan(0)
    expect(resolveEntranceState(animation('slide-right'), 0).x).toBeLessThan(0)
  })

  it('handles zero-duration transitions at the delay', () => {
    const config = { ...animation('fade'), durationMs: 0 }
    expect(resolveEntranceState(config, 599).opacity).toBe(0)
    expect(resolveEntranceState(config, 600)).toEqual(FINAL_ENTRANCE_STATE)
  })
})

describe('slideElapsedMs', () => {
  it('resets entrance time whenever a slide is activated', () => {
    expect(slideElapsedMs(1600, 1000)).toBe(600)
    expect(slideElapsedMs(2500, 2500)).toBe(0)
    expect(slideElapsedMs(400, 1000)).toBe(0)
  })

  it('uses the latest cue when a narration revisits a slide', () => {
    const cues = [{ sceneId: 'a', timeMs: 0 }, { sceneId: 'b', timeMs: 800 }, { sceneId: 'a', timeMs: 1500 }]
    expect(slideElapsedFromCues(500, cues, 'a')).toBe(500)
    expect(slideElapsedFromCues(1750, cues, 'a')).toBe(250)
    expect(slideElapsedFromCues(1495, cues, 'a', 8)).toBe(0)
  })
})

describe('continuingChartKeys', () => {
  it('allows a standalone chart entrance and recognizes a repeated compatible Morph identity', () => {
    const presentation = createBlankPresentation()
    const chart = createSlideChartElement()
    presentation.slides[0].elements = [chart]
    expect(continuingChartKeys(presentation.slides).has(chartMorphKey(chart))).toBe(false)
    presentation.slides.push({ ...structuredClone(presentation.slides[0]), id: 'second' })
    expect(continuingChartKeys(presentation.slides).has(chartMorphKey(chart))).toBe(true)
    presentation.slides.splice(1, 0, { ...structuredClone(presentation.slides[0]), id: 'gap', elements: [] })
    expect(continuingChartKeys(presentation.slides).has(chartMorphKey(chart))).toBe(false)
  })
})
