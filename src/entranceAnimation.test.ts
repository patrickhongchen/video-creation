import { describe, expect, it } from 'vitest'
import { FINAL_ENTRANCE_STATE, animationMilliseconds, animationSeconds, entranceSuppressionReason, previousSlideFor, resolveEntranceState, slideElapsedFromCues, slideElapsedMs, slideEntranceEndMs } from './entranceAnimation'
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

describe('incoming Morph entrances', () => {
  it('plays on the first shared chart slide and suppresses the compatible next slide', () => {
    const presentation = createBlankPresentation()
    const chart = { ...createSlideChartElement(), sharedElementId: 'main-chart', chartId: 'series', animation: animation('fade') }
    const first = presentation.slides[0]
    first.elements = [chart]
    const second = { ...structuredClone(first), id: 'second', elements: [{ ...chart, id: 'second-chart' }] }
    presentation.slides.push(second)

    expect(entranceSuppressionReason(chart, previousSlideFor(presentation.slides, first))).toBeNull()
    expect(slideEntranceEndMs(first, previousSlideFor(presentation.slides, first))).toBe(1000)
    expect(entranceSuppressionReason(second.elements[0], previousSlideFor(presentation.slides, second))).toBe('shared-element')
    expect(slideEntranceEndMs(second, previousSlideFor(presentation.slides, second))).toBeNull()

    const gap = { ...structuredClone(first), id: 'gap', elements: [] }
    presentation.slides.splice(1, 0, gap)
    expect(entranceSuppressionReason(second.elements[0], previousSlideFor(presentation.slides, second))).toBeNull()
    expect(slideEntranceEndMs(second, previousSlideFor(presentation.slides, second))).toBe(1000)
  })

  it('also scopes chart-ID continuity to compatible adjacent charts', () => {
    const first = createBlankPresentation().slides[0]
    const chart = { ...createSlideChartElement(), chartId: 'series', animation: animation('pop') }
    first.elements = [chart]
    const matching = { ...chart, id: 'matching' }
    const incompatible = { ...chart, id: 'incompatible', chartType: 'line' as const }
    expect(entranceSuppressionReason(matching, first)).toBe('continuing-chart')
    expect(entranceSuppressionReason(incompatible, first)).toBeNull()
    first.elements[0] = { ...chart, hidden: true }
    expect(entranceSuppressionReason(matching, first)).toBeNull()
  })
})

describe('slideEntranceEndMs', () => {
  it('has no end when the slide has no playable entrances', () => {
    const slide = createBlankPresentation().slides[0]
    expect(slideEntranceEndMs(slide)).toBeNull()
    slide.elements = [{ ...createSlideChartElement(), animation: animation('fade'), hidden: true }]
    expect(slideEntranceEndMs(slide)).toBeNull()
  })

  it('ends appear at its delay and other entrances after their duration', () => {
    const slide = createBlankPresentation().slides[0]
    const first = { ...createSlideChartElement(), animation: animation('appear') }
    slide.elements = [first]
    expect(slideEntranceEndMs(slide)).toBe(600)
    slide.elements.push({ ...createSlideChartElement(), id: 'second', animation: { entrance: 'pop', delayMs: 800, durationMs: 350 } })
    expect(slideEntranceEndMs(slide)).toBe(1150)
  })

  it('ignores only incoming Morph identities when choosing preview length', () => {
    const slide = createBlankPresentation().slides[0]
    const chart = { ...createSlideChartElement(), chartId: 'continuing', animation: animation('fade') }
    const shared = { ...createSlideChartElement(), id: 'shared', sharedElementId: 'morph', animation: { entrance: 'fade' as const, delayMs: 2000, durationMs: 400 } }
    slide.elements = [chart, shared]
    expect(slideEntranceEndMs(slide)).toBe(2400)
    expect(slideEntranceEndMs(slide, { ...slide, id: 'previous' })).toBeNull()
  })
})

describe('animation timing conversion', () => {
  it('uses seconds in the editor and integer milliseconds in the model', () => {
    expect(animationSeconds(350)).toBe(0.35)
    expect(animationMilliseconds(0.35, 10_000)).toBe(350)
    expect(animationMilliseconds(0.3333, 10_000)).toBe(333)
    expect(animationMilliseconds(-1, 60_000)).toBeNull()
    expect(animationMilliseconds(60.001, 60_000)).toBeNull()
    expect(animationMilliseconds(Number.NaN, 60_000)).toBeNull()
  })
})
