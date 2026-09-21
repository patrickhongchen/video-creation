import type { NarrationSection, Presentation, Slide } from '../model'
import type { NarrationTake } from './narrationTypes'

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
  if (take.cues[0].sceneId !== section.slides[0]?.id) {
    return 'The selected take does not begin on this section\'s first slide.'
  }

  const slideIds = new Set(section.slides.map((slide) => slide.id))
  if (take.cues.some((cue) => !slideIds.has(cue.sceneId))) {
    return 'The selected take contains a cue for a slide outside this section.'
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
