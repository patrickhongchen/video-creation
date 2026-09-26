import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ENTRANCE_DURATION_MS, DEFAULT_SILENT_REVEAL_INTERVAL_MS, DEFAULT_SILENT_REVEAL_START_MS,
  FINAL_ENTRANCE_STATE, INITIAL_REVEAL_STATE, entranceDurationMs, entranceSuppressionReason,
  hasRemainingReveal, nextRevealOrder, previousSlideFor, resolveEntranceState, slideRevealOrders,
  timedRevealStateAtTime,
} from './entranceAnimation'
import type { SlideEntranceAnimation } from './model'
import { createBlankPresentation, createSlideChartElement } from './presentationFactories'

const animation = (entrance: SlideEntranceAnimation['entrance'], order = 1): SlideEntranceAnimation => ({ entrance, order })
const active = (order: number, elapsedMs: number) => ({ revealedThroughOrder: order, activeRevealOrder: order, activeRevealElapsedMs: elapsedMs })

describe('reveal entrance state', () => {
  it('leaves unanimated and edit-mode elements fully visible', () => {
    expect(resolveEntranceState(undefined, INITIAL_REVEAL_STATE)).toEqual(FINAL_ENTRANCE_STATE)
    expect(resolveEntranceState(animation('fade'), null)).toEqual(FINAL_ENTRANCE_STATE)
  })

  it('hides future orders, interpolates active orders, and completes earlier orders', () => {
    expect(resolveEntranceState(animation('fade', 3), INITIAL_REVEAL_STATE).opacity).toBe(0)
    expect(resolveEntranceState(animation('fade', 3), active(1, 100)).opacity).toBe(0)
    expect(resolveEntranceState(animation('fade', 1), active(3, 100))).toEqual(FINAL_ENTRANCE_STATE)
    const during = resolveEntranceState(animation('fade', 3), active(3, DEFAULT_ENTRANCE_DURATION_MS / 2))
    expect(during.opacity).toBeGreaterThan(0)
    expect(during.opacity).toBeLessThan(1)
    expect(resolveEntranceState(animation('fade', 3), active(3, DEFAULT_ENTRANCE_DURATION_MS))).toEqual(FINAL_ENTRANCE_STATE)
  })

  it('uses one duration for all moving entrances and makes appear instant', () => {
    for (const entrance of ['fade', 'pop', 'slide-up', 'slide-left', 'slide-right'] as const) {
      expect(entranceDurationMs(entrance)).toBe(DEFAULT_ENTRANCE_DURATION_MS)
      expect(resolveEntranceState(animation(entrance), active(1, 0)).opacity).toBe(0)
      expect(resolveEntranceState(animation(entrance), active(1, DEFAULT_ENTRANCE_DURATION_MS))).toEqual(FINAL_ENTRANCE_STATE)
    }
    expect(entranceDurationMs('appear')).toBe(0)
    expect(resolveEntranceState(animation('appear'), INITIAL_REVEAL_STATE).opacity).toBe(0)
    expect(resolveEntranceState(animation('appear'), active(1, 0))).toEqual(FINAL_ENTRANCE_STATE)
  })

  it('preserves the small entrance transforms', () => {
    expect(resolveEntranceState(animation('pop'), active(1, 0)).scale).toBeCloseTo(0.94)
    expect(resolveEntranceState(animation('slide-up'), active(1, 0)).y).toBeGreaterThan(0)
    expect(resolveEntranceState(animation('slide-left'), active(1, 0)).x).toBeGreaterThan(0)
    expect(resolveEntranceState(animation('slide-right'), active(1, 0)).x).toBeLessThan(0)
  })
})

describe('reveal groups and Morph', () => {
  it('groups matching orders, ignores hidden and unanimated elements, and advances sparse orders', () => {
    const slide = createBlankPresentation().slides[0]
    expect(slideRevealOrders(slide)).toEqual([])
    slide.elements = [
      { ...createSlideChartElement(), id: 'a', animation: animation('pop', 7) },
      { ...createSlideChartElement(), id: 'b', animation: animation('fade', 1) },
      { ...createSlideChartElement(), id: 'c', animation: animation('appear', 1) },
      { ...createSlideChartElement(), id: 'd', animation: animation('pop', 3) },
      { ...createSlideChartElement(), id: 'hidden', animation: animation('pop', 9), hidden: true },
      { ...createSlideChartElement(), id: 'plain' },
    ]
    const orders = slideRevealOrders(slide)
    expect(orders).toEqual([1, 3, 7])
    expect(nextRevealOrder(orders, 0)).toBe(1)
    expect(nextRevealOrder(orders, 1)).toBe(3)
    expect(nextRevealOrder(orders, 7)).toBeNull()
    expect(hasRemainingReveal(orders, 3)).toBe(true)
    expect(hasRemainingReveal(orders, 7)).toBe(false)
  })

  it('plays a first shared chart appearance and suppresses an adjacent compatible continuation', () => {
    const presentation = createBlankPresentation()
    const chart = { ...createSlideChartElement(), sharedElementId: 'main-chart', chartId: 'series', animation: animation('fade') }
    const first = presentation.slides[0]
    first.elements = [chart]
    const second = { ...structuredClone(first), id: 'second', elements: [{ ...chart, id: 'second-chart' }] }
    presentation.slides.push(second)
    expect(entranceSuppressionReason(chart, previousSlideFor(presentation.slides, first))).toBeNull()
    expect(slideRevealOrders(first)).toEqual([1])
    expect(entranceSuppressionReason(second.elements[0], first)).toBe('shared-element')
    expect(slideRevealOrders(second, first)).toEqual([])
    const gap = { ...structuredClone(first), id: 'gap', elements: [] }
    presentation.slides.splice(1, 0, gap)
    expect(slideRevealOrders(second, previousSlideFor(presentation.slides, second))).toEqual([1])
  })

  it('scopes chart-ID continuity to compatible visible predecessor charts', () => {
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

describe('silent timed reveal fallback', () => {
  it('starts at fixed intervals and resolves the same frame identically', () => {
    const orders = [1, 3, 8]
    expect(timedRevealStateAtTime(orders, DEFAULT_SILENT_REVEAL_START_MS - 1)).toEqual(INITIAL_REVEAL_STATE)
    expect(timedRevealStateAtTime(orders, DEFAULT_SILENT_REVEAL_START_MS)).toEqual(active(1, 0))
    expect(timedRevealStateAtTime(orders, DEFAULT_SILENT_REVEAL_START_MS + DEFAULT_SILENT_REVEAL_INTERVAL_MS)).toEqual(active(3, 0))
    expect(timedRevealStateAtTime(orders, DEFAULT_SILENT_REVEAL_START_MS + DEFAULT_SILENT_REVEAL_INTERVAL_MS * 2 + 100)).toEqual(active(8, 100))
    expect(timedRevealStateAtTime(orders, 2_500)).toEqual(timedRevealStateAtTime(orders, 2_500))
  })
})
