import {
  INITIAL_REVEAL_STATE,
  previousSlideFor,
  slideRevealOrders,
  timedRevealStateAtTime,
  type RevealVisualState,
} from '../entranceAnimation'
import type { Slide } from '../model'
import { cuesAreLegacy, isHideRevealCue, isRevealCue, isSlideCue, type SceneCue } from './narrationTypes'

export interface ResolvedNarrationVisual {
  sceneId: string | undefined
  slideIndex: number
  slideActivatedAtMs: number
  revealState: RevealVisualState
}

/**
 * Resolves a narration playhead without timers or mutable playback state.
 * Legacy takes get the centralized automatic reveal cadence; typed takes replay
 * only the reveal clicks that were actually recorded.
 */
export function resolveNarrationVisualAtTime(
  cues: readonly SceneCue[],
  timeMs: number,
  slides: readonly Slide[],
  fallbackSceneId = slides[0]?.id,
): ResolvedNarrationVisual {
  const sortedCues = [...cues].sort((left, right) => left.timeMs - right.timeMs)
  const clampedTimeMs = Math.max(0, timeMs)
  let sceneId = sortedCues.find(isSlideCue)?.sceneId ?? fallbackSceneId
  let slideActivatedAtMs = 0
  let slideCueIndex = -1

  for (const [index, cue] of sortedCues.entries()) {
    if (cue.timeMs > clampedTimeMs) break
    if (isSlideCue(cue)) {
      sceneId = cue.sceneId
      slideActivatedAtMs = cue.timeMs
      slideCueIndex = index
    }
  }

  const foundSlideIndex = slides.findIndex((slide) => slide.id === sceneId)
  const slideIndex = foundSlideIndex >= 0 ? foundSlideIndex : 0
  const slide = slides[slideIndex]
  sceneId = slide?.id ?? sceneId

  if (!slide) {
    return { sceneId, slideIndex, slideActivatedAtMs, revealState: INITIAL_REVEAL_STATE }
  }

  if (cuesAreLegacy(cues)) {
    const orders = slideRevealOrders(slide, previousSlideFor(slides, slide))
    return {
      sceneId,
      slideIndex,
      slideActivatedAtMs,
      revealState: timedRevealStateAtTime(orders, clampedTimeMs - slideActivatedAtMs),
    }
  }

  const revealOrders = slideRevealOrders(slide, previousSlideFor(slides, slide))
  const slideCue = sortedCues[slideCueIndex]
  let revealState: RevealVisualState = {
    revealedThroughOrder: slideCue && 'type' in slideCue && slideCue.type === 'slide'
      ? slideCue.revealedThroughOrder ?? 0
      : 0,
    activeRevealOrder: null,
    activeRevealElapsedMs: 0,
  }
  for (let index = slideCueIndex + 1; index < sortedCues.length; index += 1) {
    const cue = sortedCues[index]
    if (cue.timeMs > clampedTimeMs) break
    if (cue.sceneId !== sceneId) continue
    if (isRevealCue(cue)) {
      revealState = {
        revealedThroughOrder: cue.order,
        activeRevealOrder: cue.order,
        activeRevealElapsedMs: clampedTimeMs - cue.timeMs,
      }
    } else if (isHideRevealCue(cue)) {
      revealState = {
        revealedThroughOrder: revealOrders.filter((order) => order < cue.order).at(-1) ?? 0,
        activeRevealOrder: null,
        activeRevealElapsedMs: 0,
      }
    }
  }

  return { sceneId, slideIndex, slideActivatedAtMs, revealState }
}
