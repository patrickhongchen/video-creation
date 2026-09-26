import type { NarrationSection, Presentation, Slide } from '../model'
import { previousSlideFor, slideRevealOrders } from '../entranceAnimation'
import { cuesAreLegacy, isRevealCue, isSlideCue, type NarrationTake } from './narrationTypes'

export const NARRATION_CUE_DURATION_TOLERANCE_MS = 100

export interface ResolvedNarrationSection {
  slides: Slide[]
  indices: number[]
  valid: boolean
  issue: string
}

export function resolveSection(
  section: NarrationSection,
  presentation: Presentation,
): ResolvedNarrationSection {
  const indices = section.slideIds.map((id) =>
    presentation.slides.findIndex((slide) => slide.id === id))
  const missingCount = indices.filter((index) => index < 0).length
  const foundIndices = indices.filter((index) => index >= 0)
  const orderedIndices = [...foundIndices].sort((left, right) => left - right)
  const slides = orderedIndices.map((index) => presentation.slides[index])

  if (section.slideIds.length === 0) {
    return {
      slides,
      indices: orderedIndices,
      valid: false,
      issue: 'This section has no slides. Choose a start and end slide to repair it.',
    }
  }
  if (missingCount > 0) {
    return {
      slides,
      indices: orderedIndices,
      valid: false,
      issue: `${missingCount} referenced slide${missingCount === 1 ? ' is' : 's are'} missing. Save a new range to repair this section.`,
    }
  }
  const contiguous = indices.every((index, position) =>
    position === 0 || index === indices[position - 1] + 1)
  if (!contiguous) {
    return {
      slides,
      indices: orderedIndices,
      valid: false,
      issue: 'These slides are no longer a contiguous range. Save a new range to repair this section.',
    }
  }
  return {
    slides: indices.map((index) => presentation.slides[index]),
    indices,
    valid: true,
    issue: '',
  }
}

/** Returns a user-facing reason when a take cannot be used, or null when it is usable. */
export function getTakeUsabilityIssue(
  take: NarrationTake,
  section: ResolvedNarrationSection,
): string | null {
  if (!section.valid) return section.issue || 'The narration section is invalid.'
  if (!(take.blob instanceof Blob)) return 'The selected take is missing its audio.'
  if (take.blob.size === 0) return 'The selected take has no audio data.'
  if (!Array.isArray(take.cues) || take.cues.length === 0) {
    return 'The selected take has no slide cues.'
  }
  if (take.cues[0].timeMs !== 0) return 'The selected take must begin with a cue at 0 ms.'
  if (!isSlideCue(take.cues[0])) return 'The selected take must begin with a slide cue.'
  if (take.cues[0].sceneId !== section.slides[0]?.id) {
    return 'The selected take does not begin on this section\'s first slide.'
  }

  if (take.cues.some((cue) => {
    if (!('type' in cue)) return false
    const type = (cue as { type?: unknown }).type
    return type !== 'slide' && type !== 'reveal'
  })) {
    return 'The selected take contains an unknown cue type.'
  }

  const slideIds = new Set(section.slides.map((slide) => slide.id))
  if (take.cues.some((cue) => !slideIds.has(cue.sceneId))) {
    return 'The selected take contains a cue for a slide outside this section.'
  }
  if (take.cues.some((cue) => isRevealCue(cue) && (!Number.isSafeInteger(cue.order) || cue.order < 1))) {
    return 'The selected take contains an invalid reveal cue.'
  }
  if (take.cues.some((cue) =>
    !(cue.timeMs >= 0
      && cue.timeMs <= take.durationMs + NARRATION_CUE_DURATION_TOLERANCE_MS))) {
    return 'The selected take contains a cue outside its audio duration.'
  }
  return null
}

export function takeIsUsable(take: NarrationTake, section: ResolvedNarrationSection) {
  return getTakeUsabilityIssue(take, section) === null
}

/** A nonblocking warning for typed takes after a slide's playable reveals change. */
export function getTakeRevealCoverageIssue(
  take: NarrationTake,
  section: ResolvedNarrationSection,
  presentation: Presentation,
): string | null {
  if (!section.valid || cuesAreLegacy(take.cues) || getTakeUsabilityIssue(take, section)) return null
  let missing = 0
  let stale = 0
  for (const slide of section.slides) {
    const playable = new Set(slideRevealOrders(slide, previousSlideFor(presentation.slides, slide)))
    const recorded = new Set(take.cues.filter(isRevealCue).filter((cue) => cue.sceneId === slide.id).map((cue) => cue.order))
    for (const order of playable) if (!recorded.has(order)) missing += 1
    for (const order of recorded) if (!playable.has(order)) stale += 1
  }
  if (missing === 0 && stale === 0) return null
  const parts = [missing && `${missing} playable reveal step${missing === 1 ? '' : 's'} without a recorded cue`, stale && `${stale} recorded cue${stale === 1 ? ' for a step that no longer plays' : 's for steps that no longer play'}`].filter(Boolean)
  return `Re-record recommended: ${parts.join(' and ')}.`
}
