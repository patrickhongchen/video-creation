import type { Slide, SlideChartElement, SlideElement, SlideEntranceAnimation } from './model'

export interface EntranceState {
  opacity: number
  x: number
  y: number
  scale: number
}

export const FINAL_ENTRANCE_STATE: EntranceState = { opacity: 1, x: 0, y: 0, scale: 1 }
export const HIDDEN_ENTRANCE_STATE: EntranceState = { ...FINAL_ENTRANCE_STATE, opacity: 0 }
export const DEFAULT_ENTRANCE_DURATION_MS = 350
export const DEFAULT_SILENT_REVEAL_START_MS = 600
export const DEFAULT_SILENT_REVEAL_INTERVAL_MS = 800

export interface RevealVisualState {
  revealedThroughOrder: number
  activeRevealOrder: number | null
  activeRevealElapsedMs: number
}

export const INITIAL_REVEAL_STATE: RevealVisualState = {
  revealedThroughOrder: 0,
  activeRevealOrder: null,
  activeRevealElapsedMs: 0,
}

export function entranceDurationMs(type: SlideEntranceAnimation['entrance']) {
  return type === 'appear' ? 0 : DEFAULT_ENTRANCE_DURATION_MS
}

/** Pure entrance state for an interactive or frame-addressed reveal. Null means Edit mode. */
export function resolveEntranceState(animation: SlideEntranceAnimation | undefined, reveal: RevealVisualState | null): EntranceState {
  if (!animation || reveal === null) return FINAL_ENTRANCE_STATE
  if (animation.order > reveal.revealedThroughOrder) return HIDDEN_ENTRANCE_STATE
  if (animation.order !== reveal.activeRevealOrder || animation.entrance === 'appear') return FINAL_ENTRANCE_STATE

  const progress = Math.max(0, Math.min(1, reveal.activeRevealElapsedMs / entranceDurationMs(animation.entrance)))
  if (progress === 1) return FINAL_ENTRANCE_STATE

  // A small ease-out preserves exact states at both ends and is independent of frame rate.
  const eased = 1 - Math.pow(1 - progress, 3)
  const remaining = 1 - eased
  switch (animation.entrance) {
    case 'fade': return { opacity: eased, x: 0, y: 0, scale: 1 }
    case 'pop': return { opacity: eased, x: 0, y: 0, scale: 1 - 0.06 * remaining }
    case 'slide-up': return { opacity: eased, x: 0, y: 28 * remaining, scale: 1 }
    case 'slide-left': return { opacity: eased, x: 28 * remaining, y: 0, scale: 1 }
    case 'slide-right': return { opacity: eased, x: -28 * remaining, y: 0, scale: 1 }
  }
}

export function chartMorphKey(chart: SlideChartElement) {
  return JSON.stringify([chart.chartId, chart.chartType, chart.chartType === 'bar' ? chart.orientation ?? 'horizontal' : 'line'])
}

/** Matches the element-kind compatibility used for shared Motion layout IDs. */
export function morphCompatibilityKey(element: SlideElement) {
  if (element.type === 'chart') return `${element.type}:${element.chartType}:${element.chartType === 'bar' ? element.orientation ?? 'horizontal' : 'line'}`
  if (element.type === 'shape') return `${element.type}:${element.shape}`
  return element.type
}

export function previousSlideFor(slides: readonly Slide[], slide: Slide): Slide | undefined {
  const index = slides.findIndex((candidate) => candidate.id === slide.id)
  return index > 0 ? slides[index - 1] : undefined
}

export type EntranceSuppressionReason = 'shared-element' | 'continuing-chart'

/** An entrance is skipped only when this slide receives a compatible Morph identity. */
export function entranceSuppressionReason(element: SlideElement, previousSlide?: Slide): EntranceSuppressionReason | null {
  if (!previousSlide || element.hidden) return null
  if (element.sharedElementId && previousSlide.elements.some((candidate) =>
    !candidate.hidden && candidate.sharedElementId === element.sharedElementId && morphCompatibilityKey(candidate) === morphCompatibilityKey(element))) {
    return 'shared-element'
  }
  if (element.type === 'chart' && element.chartId && previousSlide.elements.some((candidate) =>
    candidate.type === 'chart' && !candidate.hidden && candidate.chartId && chartMorphKey(candidate) === chartMorphKey(element))) {
    return 'continuing-chart'
  }
  return null
}

/** Sorted distinct playable reveal groups, including sparse order numbers. */
export function slideRevealOrders(slide: Slide, previousSlide?: Slide): number[] {
  return [...new Set(slide.elements
    .filter((element) => element.animation && !element.hidden && !entranceSuppressionReason(element, previousSlide))
    .map((element) => element.animation!.order))].sort((a, b) => a - b)
}

export function nextRevealOrder(orders: readonly number[], revealedThroughOrder: number): number | null {
  return orders.find((order) => order > revealedThroughOrder) ?? null
}

export function hasRemainingReveal(orders: readonly number[], revealedThroughOrder: number) {
  return nextRevealOrder(orders, revealedThroughOrder) !== null
}

/** Deterministic fallback for a silent slide or an old narration take without reveal cues. */
export function timedRevealStateAtTime(orders: readonly number[], elapsedMs: number, startMs = DEFAULT_SILENT_REVEAL_START_MS, intervalMs = DEFAULT_SILENT_REVEAL_INTERVAL_MS): RevealVisualState {
  let result = INITIAL_REVEAL_STATE
  orders.forEach((order, index) => {
    const cueTime = startMs + index * intervalMs
    if (elapsedMs >= cueTime) result = {
      revealedThroughOrder: order,
      activeRevealOrder: order,
      activeRevealElapsedMs: elapsedMs - cueTime,
    }
  })
  return result
}
