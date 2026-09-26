import type { Slide, SlideChartElement, SlideEntranceAnimation } from './model'

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

/** Chart IDs are assigned by default; only compatible IDs on neighboring slides can Morph. */
export function continuingChartKeys(slides: readonly Slide[]) {
  const keysBySlide = slides.map((slide) => new Set(slide.elements.flatMap((element) =>
    element.type === 'chart' && element.chartId && !element.hidden ? [chartMorphKey(element)] : [])))
  const continuing = new Set<string>()
  for (let index = 1; index < keysBySlide.length; index += 1) {
    for (const key of keysBySlide[index]) {
      if (keysBySlide[index - 1].has(key)) continuing.add(key)
    }
  }
  return continuing
}
