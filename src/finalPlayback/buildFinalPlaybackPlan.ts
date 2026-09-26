import type { NarrationSection, Presentation } from '../model'
import { isSlideCue } from '../narration/narrationTypes'
import {
  DEFAULT_ENTRANCE_DURATION_MS,
  DEFAULT_SILENT_REVEAL_INTERVAL_MS,
  DEFAULT_SILENT_REVEAL_START_MS,
  previousSlideFor,
  slideRevealOrders,
} from '../entranceAnimation'
import {
  getTakeUsabilityIssue,
  resolveSection,
} from '../narration/narrationValidation'
import {
  FINAL_VISUAL_HOLD_MS,
  type FinalPlaybackPlan,
  type FinalPlaybackSectionReadiness,
  type FinalPlaybackSegment,
  type FinalPlaybackWarning,
  type NarrationTakesBySection,
} from './finalPlaybackTypes'

interface OrderedSection {
  section: NarrationSection
  firstSlideIndex: number
  resolved: ReturnType<typeof resolveSection>
}

function orderedSections(presentation: Presentation): OrderedSection[] {
  return (presentation.narration?.sections ?? [])
    .map((section) => {
      const resolved = resolveSection(section, presentation)
      return {
        section,
        resolved,
        firstSlideIndex: resolved.indices[0] ?? Number.POSITIVE_INFINITY,
      }
    })
    .sort((left, right) =>
      left.firstSlideIndex - right.firstSlideIndex
      || left.section.id.localeCompare(right.section.id))
}

export function buildFinalPlaybackPlan(
  presentation: Presentation,
  takesBySection: NarrationTakesBySection,
): FinalPlaybackPlan {
  const sections = orderedSections(presentation)
  const readiness: FinalPlaybackSectionReadiness[] = []
  const warnings: FinalPlaybackWarning[] = []
  const selectedTakes = new Map<string, NonNullable<FinalPlaybackSectionReadiness['selectedTake']>>()

  for (const { section, resolved } of sections) {
    const selectedTake = (takesBySection[section.id] ?? []).find((take) => take.selected) ?? null
    let issue: string | null = null
    let issueKind: FinalPlaybackSectionReadiness['issueKind'] = null

    if (!resolved.valid) {
      issue = resolved.issue
      issueKind = 'invalid-section'
    } else if (!selectedTake) {
      issue = 'No take is selected for this narration section.'
      issueKind = 'no-selected-take'
    } else {
      issue = getTakeUsabilityIssue(selectedTake, resolved)
      if (issue) issueKind = 'unusable-selected-take'
    }

    const ready = issue === null && selectedTake !== null
    readiness.push({
      sectionId: section.id,
      title: section.title,
      ready,
      issue,
      issueKind,
      selectedTake,
    })

    if (!ready || !selectedTake) continue
    selectedTakes.set(section.id, selectedTake)

    const cuedSlideCount = new Set(selectedTake.cues.filter(isSlideCue).map((cue) => cue.sceneId)).size
    if (cuedSlideCount < resolved.slides.length) {
      warnings.push({
        kind: 'incomplete-cue-coverage',
        sectionId: section.id,
        title: section.title,
        slideCount: resolved.slides.length,
        cuedSlideCount,
        message: `“${section.title}” contains ${resolved.slides.length} slides but its selected take displays only ${cuedSlideCount} of them.`,
      })
    }
  }

  if (sections.length === 0) {
    warnings.push({
      kind: 'no-narration-sections',
      message: 'This presentation has no narration sections and will play as a silent visual video.',
    })
  }

  const sectionBySlideId = new Map<string, OrderedSection>()
  for (const entry of sections) {
    for (const slideId of entry.section.slideIds) {
      // Valid presentation data cannot overlap. The sorted order keeps recovery
      // deterministic if malformed in-memory data reaches this layer.
      if (!sectionBySlideId.has(slideId)) sectionBySlideId.set(slideId, entry)
    }
  }

  const segments: FinalPlaybackSegment[] = []
  const addedSectionIds = new Set<string>()
  let unassignedSlideCount = 0

  for (const slide of presentation.slides) {
    const entry = sectionBySlideId.get(slide.id)
    if (!entry) {
      unassignedSlideCount += 1
      const revealCount = slideRevealOrders(slide, previousSlideFor(presentation.slides, slide)).length
      const revealDurationMs = revealCount === 0
        ? 0
        : DEFAULT_SILENT_REVEAL_START_MS
          + (revealCount - 1) * DEFAULT_SILENT_REVEAL_INTERVAL_MS
          + DEFAULT_ENTRANCE_DURATION_MS
      segments.push({
        type: 'silent-scene',
        sceneId: slide.id,
        durationMs: Math.max(slide.duration * 1000, revealDurationMs),
      })
      continue
    }

    if (addedSectionIds.has(entry.section.id)) continue
    addedSectionIds.add(entry.section.id)
    const take = selectedTakes.get(entry.section.id)
    if (!take || !entry.resolved.valid) continue
    segments.push({
      type: 'narration',
      sectionId: entry.section.id,
      title: entry.section.title,
      sceneIds: entry.resolved.slides.map((sectionSlide) => sectionSlide.id),
      take,
      durationMs: take.durationMs,
    })
  }

  const contentDurationMs = segments.reduce((total, segment) => total + segment.durationMs, 0)
  const readinessIssues = readiness.filter((entry) => !entry.ready)
  return {
    segments,
    readiness,
    readinessIssues,
    warnings,
    isReady: readinessIssues.length === 0,
    unassignedSlideCount,
    contentDurationMs,
    finalHoldMs: FINAL_VISUAL_HOLD_MS,
    totalDurationMs: contentDurationMs + FINAL_VISUAL_HOLD_MS,
  }
}

export { FINAL_VISUAL_HOLD_MS } from './finalPlaybackTypes'
