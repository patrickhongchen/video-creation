import type { Presentation, PresentationImageAsset, PresentationImageMimeType } from '../model'
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

export interface DesktopMissingAsset {
  assetId: string
  path: string
  slideIds: string[]
  message: string
}

export interface DesktopProjectSnapshot {
  projectId: string
  rootPath: string
  presentationPath: string
  assetsPath: string
  presentation: Presentation
  contentHash: string
  missingAssets: DesktopMissingAsset[]
}

export type DesktopProjectDialogResult =
  | { status: 'completed'; project: DesktopProjectSnapshot }
  | { status: 'cancelled' }

export interface DesktopProjectSaveRequest {
  projectId: string
  presentation: Presentation
  overwriteExternal?: boolean
}

export type DesktopProjectSaveResult =
  | { status: 'saved'; project: DesktopProjectSnapshot }
  | { status: 'conflict'; diskHash: string | null }

export type DesktopImportedAsset = PresentationImageAsset & {
  path: string
  source: string
}

export type DesktopAssetImportResult =
  | { status: 'imported'; asset: DesktopImportedAsset }
  | { status: 'cancelled' }

export interface DesktopImageBytesRequest {
  projectId: string
  bytes: ArrayBuffer
  mimeType: PresentationImageMimeType
  suggestedName?: string
}

export interface DesktopRemoteImageRequest {
  projectId: string
  url: string
  suggestedName?: string
}

export interface VideoEssayDesktopApi {
  createProject: (presentation: Presentation) => Promise<DesktopProjectDialogResult>
  openProject: () => Promise<DesktopProjectDialogResult>
  saveProject: (request: DesktopProjectSaveRequest) => Promise<DesktopProjectSaveResult>
  reloadProject: (projectId: string) => Promise<DesktopProjectSnapshot>
  revealProject: (projectId: string) => Promise<void>
  chooseImage: (projectId: string) => Promise<DesktopAssetImportResult>
  importDroppedImage: (projectId: string, file: File) => Promise<DesktopImportedAsset>
  importRemoteImage: (request: DesktopRemoteImageRequest) => Promise<DesktopImportedAsset>
  importClipboardImage: (projectId: string) => Promise<DesktopAssetImportResult>
  saveImageBytes: (request: DesktopImageBytesRequest) => Promise<DesktopImportedAsset>
  setProjectDirty: (projectId: string, dirty: boolean) => Promise<void>
  onProjectNewRequested: (listener: () => void) => () => void
  onProjectOpenRequested: (listener: () => void) => () => void
  onProjectSaveRequested: (listener: () => void) => () => void
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
