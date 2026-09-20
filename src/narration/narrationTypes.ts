export interface SceneCue {
  sceneId: string
  timeMs: number
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
