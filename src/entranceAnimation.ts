import type { Slide, SlideChartElement, SlideElement, SlideEntranceAnimation } from './model'

export interface EntranceState {
  opacity: number
  x: number
  y: number
  scale: number
}

export const FINAL_ENTRANCE_STATE: EntranceState = { opacity: 1, x: 0, y: 0, scale: 1 }

/** Pure, frame-addressable entrance state. elapsedMs is measured from slide activation. */
export function resolveEntranceState(animation: SlideEntranceAnimation | undefined, elapsedMs: number | null): EntranceState {
  if (!animation || elapsedMs === null) return FINAL_ENTRANCE_STATE
  if (animation.entrance === 'appear') {
    return elapsedMs < animation.delayMs ? { ...FINAL_ENTRANCE_STATE, opacity: 0 } : FINAL_ENTRANCE_STATE
  }

  const progress = animation.durationMs === 0
    ? Number(elapsedMs >= animation.delayMs)
    : Math.max(0, Math.min(1, (elapsedMs - animation.delayMs) / animation.durationMs))
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

export function slideElapsedMs(playbackTimeMs: number, slideActivatedAtMs: number) {
  return Math.max(0, playbackTimeMs - slideActivatedAtMs)
}

/** Returns time since the latest cue for this slide in an audio segment. */
export function slideElapsedFromCues(timeMs: number, cues: readonly { sceneId: string; timeMs: number }[], sceneId: string, cueLeewayMs = 0) {
  let activatedAtMs = 0
  for (const cue of cues) {
    if (cue.timeMs <= timeMs + cueLeewayMs && cue.sceneId === sceneId && cue.timeMs >= activatedAtMs) activatedAtMs = cue.timeMs
  }
  return slideElapsedMs(timeMs, activatedAtMs)
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

/** Last playable entrance on a slide, excluding hidden and incoming Morph elements. */
export function slideEntranceEndMs(slide: Slide, previousSlide?: Slide): number | null {
  let endMs: number | null = null
  for (const element of slide.elements) {
    const animation = element.animation
    if (!animation || element.hidden || entranceSuppressionReason(element, previousSlide)) continue
    const end = animation.delayMs + (animation.entrance === 'appear' ? 0 : animation.durationMs)
    endMs = Math.max(endMs ?? 0, end)
  }
  return endMs
}

export function animationSeconds(milliseconds: number): number {
  return milliseconds / 1000
}

/** Reject out-of-range editor input before it reaches presentation validation. */
export function animationMilliseconds(seconds: number, maxMs: number): number | null {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds * 1000 > maxMs) return null
  return Math.round(seconds * 1000)
}
