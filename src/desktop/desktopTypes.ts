import type { Presentation } from '../model'
import type { SceneCue } from '../narration/narrationTypes'

export const DESKTOP_VIDEO_WIDTH = 1080
export const DESKTOP_VIDEO_HEIGHT = 1920
export const DESKTOP_VIDEO_FPS = 30

export interface DesktopNarrationSegment {
  type: 'narration'
  sectionId: string
  title: string
  sceneIds: string[]
  durationMs: number
  cues: SceneCue[]
  audio: {
    takeId: string
    mimeType: string
    bytes: ArrayBuffer
  }
}

export interface DesktopSilentSceneSegment {
  type: 'silent-scene'
  sceneId: string
  durationMs: number
}

export type DesktopExportSegment = DesktopNarrationSegment | DesktopSilentSceneSegment

export interface DesktopExportJob {
  jobId: string
  presentation: Presentation
  segments: DesktopExportSegment[]
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

export interface DesktopRenderStart {
  jobId: string
  startedAtMs: number
}

export interface VideoEssayDesktopApi {
  exportVideo: (job: DesktopExportJob) => Promise<DesktopExportResult>
  cancelExport: () => Promise<void>
  onExportProgress: (listener: (progress: DesktopExportProgress) => void) => () => void
  openVideo: (path: string) => Promise<void>
  showInFinder: (path: string) => Promise<void>
  onRenderJob: (listener: (job: DesktopExportJob) => void) => () => void
  onRenderStart: (listener: (start: DesktopRenderStart) => void) => () => void
  renderCalibrationReady: () => void
  renderReady: (jobId: string) => void
  renderStarted: (jobId: string) => void
}

declare global {
  interface Window {
    videoEssayDesktop?: VideoEssayDesktopApi
  }
}
