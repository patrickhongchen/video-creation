/** Legacy takes persisted before reveal cues existed. Treated as a slide cue. */
export interface LegacySceneCue {
  sceneId: string
  timeMs: number
}

export interface SlideCue {
  type: 'slide'
  sceneId: string
  timeMs: number
}

export interface RevealCue {
  type: 'reveal'
  sceneId: string
  order: number
  timeMs: number
}

export type TypedSceneCue = SlideCue | RevealCue
export type TypedSceneCueInput = Omit<SlideCue, 'timeMs'> | Omit<RevealCue, 'timeMs'>
export type SceneCue = LegacySceneCue | TypedSceneCue

export function isRevealCue(cue: SceneCue): cue is RevealCue {
  return 'type' in cue && cue.type === 'reveal'
}

export function isSlideCue(cue: SceneCue): cue is LegacySceneCue | SlideCue {
  return !('type' in cue) || cue.type === 'slide'
}

export function cuesAreLegacy(cues: readonly SceneCue[]) {
  return cues.length > 0 && cues.every((cue) => !('type' in cue))
}

export interface NarrationTake {
  id: string
  presentationId: string
  sectionId: string
  createdAt: string
  durationMs: number
  mimeType: string
  cues: SceneCue[]
  selected: boolean
  blob: Blob
}

export interface NarrationRecording {
  durationMs: number
  mimeType: string
  cues: SceneCue[]
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
