/** Legacy takes persisted before reveal cues existed. Treated as a slide cue. */
export interface LegacySceneCue {
  sceneId: string
  timeMs: number
}

export interface SlideCue {
  type: 'slide'
  sceneId: string
  timeMs: number
  /** Initial reveal state when entering this slide. Omitted values start at 0. */
  revealedThroughOrder?: number
}

export interface RevealCue {
  type: 'reveal'
  sceneId: string
  order: number
  timeMs: number
}

export interface HideRevealCue {
  type: 'hide-reveal'
  sceneId: string
  order: number
  timeMs: number
}

/** A clip control recorded against the narration clock. Applies to videos on this slide. */
export interface VideoCue {
  type: 'video'
  sceneId: string
  timeMs: number
  action: 'pause' | 'resume'
  positionMs: number
}

export type TypedSceneCue = SlideCue | RevealCue | HideRevealCue | VideoCue
export type TypedSceneCueInput = Omit<SlideCue, 'timeMs'> | Omit<RevealCue, 'timeMs'> | Omit<HideRevealCue, 'timeMs'> | Omit<VideoCue, 'timeMs'>
export type SceneCue = LegacySceneCue | TypedSceneCue

export function isRevealCue(cue: SceneCue): cue is RevealCue {
  return 'type' in cue && cue.type === 'reveal'
}

export function isHideRevealCue(cue: SceneCue): cue is HideRevealCue {
  return 'type' in cue && cue.type === 'hide-reveal'
}

export function isSlideCue(cue: SceneCue): cue is LegacySceneCue | SlideCue {
  return !('type' in cue) || cue.type === 'slide'
}

export function cuesAreLegacy(cues: readonly SceneCue[]) {
  return cues.length > 0 && cues.every((cue) => !('type' in cue))
}

export interface NarrationPointerSample {
  timeMs: number
  sceneId: string
  x: number
  y: number
  visible: boolean
}

export interface NarrationCaptionSegment {
  id: string
  startMs: number
  endMs: number
  generatedText: string
  text: string
}

export interface NarrationCaptionTrack {
  version: 1
  provider: 'whisper.cpp'
  model: 'medium.en'
  generatedAt: string
  segments: NarrationCaptionSegment[]
}

export interface NarrationTake {
  id: string
  presentationId: string
  sectionId: string
  createdAt: string
  durationMs: number
  mimeType: string
  cues: SceneCue[]
  pointerTrack?: NarrationPointerSample[]
  captions?: NarrationCaptionTrack
  selected: boolean
  /** The section's slide range changed after this take was recorded. */
  invalidated?: boolean
  /** Read failure for portable media; this take stays visible but cannot be used. */
  storageError?: string
  blob: Blob
}

export interface NarrationRecording {
  durationMs: number
  mimeType: string
  cues: SceneCue[]
  pointerTrack?: NarrationPointerSample[]
  blob: Blob
}

export type NarrationRecorderStatus =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'countdown'
  | 'recording'
  | 'stopping'
  | 'error'
