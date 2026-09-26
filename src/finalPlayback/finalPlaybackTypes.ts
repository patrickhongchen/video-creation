import type { NarrationTake } from '../narration/narrationTypes'

export const FINAL_VISUAL_HOLD_MS = 500
export const FINAL_PLAYBACK_END_HOLD_MS = FINAL_VISUAL_HOLD_MS

export interface NarrationPlaybackSegment {
  type: 'narration'
  sectionId: string
  title: string
  sceneIds: string[]
  take: NarrationTake
  durationMs: number
}

export interface SilentScenePlaybackSegment {
  type: 'silent-scene'
  sceneId: string
  durationMs: number
}

export type FinalPlaybackSegment = NarrationPlaybackSegment | SilentScenePlaybackSegment

export type FinalPlaybackReadinessIssueKind =
  | 'invalid-section'
  | 'no-selected-take'
  | 'unusable-selected-take'

export interface FinalPlaybackSectionReadiness {
  sectionId: string
  title: string
  ready: boolean
  issue: string | null
  issueKind: FinalPlaybackReadinessIssueKind | null
  selectedTake: NarrationTake | null
}

export type FinalPlaybackWarningKind = 'incomplete-cue-coverage' | 'reveal-cue-coverage' | 'no-narration-sections'

export interface FinalPlaybackWarning {
  kind: FinalPlaybackWarningKind
  message: string
  sectionId?: string
  title?: string
  slideCount?: number
  cuedSlideCount?: number
}

export interface FinalPlaybackPlan {
  segments: FinalPlaybackSegment[]
  readiness: FinalPlaybackSectionReadiness[]
  readinessIssues: FinalPlaybackSectionReadiness[]
  warnings: FinalPlaybackWarning[]
  isReady: boolean
  unassignedSlideCount: number
  contentDurationMs: number
  finalHoldMs: number
  totalDurationMs: number
}

export type NarrationTakesBySection = Readonly<Record<string, readonly NarrationTake[]>>
