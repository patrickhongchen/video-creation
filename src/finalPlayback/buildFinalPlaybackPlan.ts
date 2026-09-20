import type { NarrationSection, Presentation } from '../model'
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
  firstSceneIndex: number
  resolved: ReturnType<typeof resolveSection>
}

function orderedSections(presentation: Presentation): OrderedSection[] {
  return (presentation.narration?.sections ?? [])
    .map((section) => {
      const resolved = resolveSection(section, presentation)
      return {
        section,
        resolved,
        firstSceneIndex: resolved.indices[0] ?? Number.POSITIVE_INFINITY,
      }
    })
    .sort((left, right) =>
      left.firstSceneIndex - right.firstSceneIndex
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

    const cuedSceneCount = new Set(selectedTake.cues.map((cue) => cue.sceneId)).size
    if (cuedSceneCount < resolved.scenes.length) {
      warnings.push({
        kind: 'incomplete-cue-coverage',
        sectionId: section.id,
        title: section.title,
        sceneCount: resolved.scenes.length,
        cuedSceneCount,
        message: `“${section.title}” contains ${resolved.scenes.length} scenes but its selected take displays only ${cuedSceneCount} of them.`,
      })
    }
  }

  if (sections.length === 0) {
    warnings.push({
      kind: 'no-narration-sections',
      message: 'This presentation has no narration sections and will play as a silent visual video.',
    })
  }

  const sectionBySceneId = new Map<string, OrderedSection>()
  for (const entry of sections) {
    for (const sceneId of entry.section.sceneIds) {
      // Valid presentation data cannot overlap. The sorted order keeps recovery
      // deterministic if malformed in-memory data reaches this layer.
      if (!sectionBySceneId.has(sceneId)) sectionBySceneId.set(sceneId, entry)
    }
  }

  const segments: FinalPlaybackSegment[] = []
  const addedSectionIds = new Set<string>()
  let unassignedSceneCount = 0

  for (const scene of presentation.scenes) {
    const entry = sectionBySceneId.get(scene.id)
    if (!entry) {
      unassignedSceneCount += 1
      segments.push({
        type: 'silent-scene',
        sceneId: scene.id,
        durationMs: scene.duration * 1000,
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
      sceneIds: entry.resolved.scenes.map((sectionScene) => sectionScene.id),
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
    unassignedSceneCount,
    contentDurationMs,
    finalHoldMs: FINAL_VISUAL_HOLD_MS,
    totalDurationMs: contentDurationMs + FINAL_VISUAL_HOLD_MS,
  }
}

export { FINAL_VISUAL_HOLD_MS } from './finalPlaybackTypes'
