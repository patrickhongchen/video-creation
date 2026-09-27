import type { NarrationPointerSample } from './narrationTypes'
export type { NarrationPointerSample } from './narrationTypes'

export const NARRATION_POINTER_FULLY_VISIBLE_MS = 500
export const NARRATION_POINTER_FADE_END_MS = 800
export const NARRATION_POINTER_FADE_IN_MS = 180
export const NARRATION_POINTER_MAX_INTERPOLATION_GAP_MS = 100

export interface NarrationPointerDisplayState {
  x: number
  y: number
  opacity: number
}

interface ResolvablePointerSample {
  sample: NarrationPointerSample
  sourceIndex: number
  activatedAtMs: number
}

// Takes are immutable once stored; reuse the normalized track across preview and export frames.
const resolvedTracks = new WeakMap<readonly NarrationPointerSample[], ResolvablePointerSample[]>()

function resolvableSample(value: unknown, sourceIndex: number): ResolvablePointerSample | null {
  if (!value || typeof value !== 'object') return null
  const sample = value as Partial<NarrationPointerSample>
  if (!Number.isFinite(sample.timeMs) || (sample.timeMs as number) < 0) return null
  if (typeof sample.sceneId !== 'string' || typeof sample.visible !== 'boolean') return null

  // A hide sample has no position to render, so it can safely hide a pointer
  // even if corrupt persisted coordinates accompany it.
  if (sample.visible && (
    !Number.isFinite(sample.x)
    || !Number.isFinite(sample.y)
    || (sample.x as number) < 0
    || (sample.x as number) > 1
    || (sample.y as number) < 0
    || (sample.y as number) > 1
  )) return null

  return { sample: sample as NarrationPointerSample, sourceIndex, activatedAtMs: sample.timeMs as number }
}

export function narrationPointerOpacityAtTime(lastMovementMs: number, activatedAtMs: number, timeMs: number): number {
  const idleMs = Math.max(0, timeMs - lastMovementMs)
  if (idleMs >= NARRATION_POINTER_FADE_END_MS) return 0
  const fadeOut = idleMs <= NARRATION_POINTER_FULLY_VISIBLE_MS
    ? 1
    : (NARRATION_POINTER_FADE_END_MS - idleMs)
      / (NARRATION_POINTER_FADE_END_MS - NARRATION_POINTER_FULLY_VISIBLE_MS)
  const fadeIn = Math.max(0, Math.min(1, (timeMs - activatedAtMs) / NARRATION_POINTER_FADE_IN_MS))
  return Math.min(fadeIn, fadeOut)
}

/** Resolves pointer performance data without timers or mutable playback state. */
export function resolveNarrationPointerAtTime(
  pointerTrack: readonly NarrationPointerSample[] | null | undefined,
  timeMs: number,
  activeSceneId: string | undefined,
): NarrationPointerDisplayState | null {
  if (!Array.isArray(pointerTrack) || pointerTrack.length === 0) return null
  if (!Number.isFinite(timeMs) || typeof activeSceneId !== 'string') return null

  const resolvedTimeMs = Math.max(0, timeMs)
  let samples = resolvedTracks.get(pointerTrack)
  if (!samples) {
    samples = pointerTrack
      .map(resolvableSample)
      .filter((entry): entry is ResolvablePointerSample => entry !== null)
      .sort((left, right) =>
        left.sample.timeMs - right.sample.timeMs || left.sourceIndex - right.sourceIndex)
    for (let index = 1; index < samples.length; index += 1) {
      const current = samples[index]
      const previous = samples[index - 1]
      if (current.sample.visible && previous.sample.visible
        && current.sample.sceneId === previous.sample.sceneId
        && current.sample.timeMs - previous.sample.timeMs < NARRATION_POINTER_FADE_END_MS) {
        current.activatedAtMs = previous.activatedAtMs
      }
    }
    resolvedTracks.set(pointerTrack, samples)
  }

  let lower = 0
  let upper = samples.length
  while (lower < upper) {
    const middle = (lower + upper) >>> 1
    if (samples[middle].sample.timeMs <= resolvedTimeMs) lower = middle + 1
    else upper = middle
  }
  const currentIndex = lower - 1
  if (currentIndex < 0) return null

  const current = samples[currentIndex].sample
  if (!current.visible || current.sceneId !== activeSceneId) return null

  const elapsedMs = resolvedTimeMs - current.timeMs
  if (elapsedMs >= NARRATION_POINTER_FADE_END_MS) return null

  let x = current.x
  let y = current.y
  const next = samples[currentIndex + 1]?.sample
  if (
    next?.visible
    && next.sceneId === current.sceneId
    && next.timeMs > current.timeMs
    && next.timeMs - current.timeMs <= NARRATION_POINTER_MAX_INTERPOLATION_GAP_MS
    && resolvedTimeMs < next.timeMs
  ) {
    const progress = (resolvedTimeMs - current.timeMs) / (next.timeMs - current.timeMs)
    x += (next.x - x) * progress
    y += (next.y - y) * progress
  }

  const opacity = narrationPointerOpacityAtTime(current.timeMs, samples[currentIndex].activatedAtMs, resolvedTimeMs)

  return { x, y, opacity }
}
