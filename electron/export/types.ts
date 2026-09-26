export const VIDEO_WIDTH = 1080
export const VIDEO_HEIGHT = 1920
export const VIDEO_FPS = 30

export interface ExportCue {
  sceneId: string
  timeMs: number
}

export interface NarrationExportSegment {
  type: 'narration'
  sectionId: string
  title: string
  sceneIds: string[]
  durationMs: number
  cues: ExportCue[]
  audio: {
    takeId: string
    mimeType: string
    bytes: ArrayBuffer | ArrayBufferView
  }
}

export interface SilentExportSegment {
  type: 'silent-scene'
  sceneId: string
  durationMs: number
}

export type ExportSegment = NarrationExportSegment | SilentExportSegment

export interface DesktopExportJob {
  jobId: string
  presentation: {
    schemaVersion: number
    id: string
    title: string
    slides: Array<{ id: string; [key: string]: unknown }>
    [key: string]: unknown
  }
  segments: ExportSegment[]
  editorViewportWidth: number
  finalHoldMs: number
  totalDurationMs: number
  suggestedBaseName: string
}

export interface DesktopExportProgress {
  jobId: string
  elapsedMs: number
  totalDurationMs: number
  percent: number
  activeSceneId?: string
  activeSectionTitle?: string
}

export type DesktopExportResult =
  | { status: 'completed'; outputPath: string; durationMs: number }
  | { status: 'save-cancelled' }
  | { status: 'cancelled' }

export interface DesktopRenderFrameRequest {
  jobId: string
  frameIndex: number
  elapsedMs: number
}
