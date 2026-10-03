import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  DesktopExportJob,
  DesktopExportProgress,
  DesktopExportResult,
  DesktopRenderFrameRequest,
} from './export/types'
import type {
  DesktopFinalPreviewAudioRequest,
  DesktopFinalPreviewAudioResult,
  DesktopImageBytesRequest,
  DesktopNarrationTakeWrite,
  DesktopNarrationTakeData,
  DesktopProjectExternalChange,
  DesktopProjectSaveRequest,
  DesktopRemoteImageRequest,
} from '../src/desktop/desktopTypes'
import type { Presentation } from '../src/model'
import type { DesktopNarrationPreviewRequest, DesktopNarrationPreviewResult } from '../src/desktop/desktopTypes'
import type { NarrationCaptionTrack } from '../src/narration/narrationTypes'

// Keep the sandboxed preload self-contained. Sandboxed preloads cannot require
// arbitrary local chunks, so these narrow channel names intentionally mirror
// the main-process constants instead of importing a code-split runtime module.
const CHANNELS = {
  projectCreate: 'video-essay:project:create',
  projectOpen: 'video-essay:project:open',
  projectSave: 'video-essay:project:save',
  projectReload: 'video-essay:project:reload',
  projectRefreshAssets: 'video-essay:project:refresh-assets',
  projectReveal: 'video-essay:project:reveal',
  projectChooseImage: 'video-essay:project:choose-image',
  projectChooseVideo: 'video-essay:project:choose-video',
  projectImportImage: 'video-essay:project:import-image',
  projectImportVideo: 'video-essay:project:import-video',
  projectImportRemoteImage: 'video-essay:project:import-remote-image',
  projectImportClipboardImage: 'video-essay:project:import-clipboard-image',
  projectSaveImageBytes: 'video-essay:project:save-image-bytes',
  projectSetDirty: 'video-essay:project:set-dirty',
  narrationStatus: 'video-essay:narration:status',
  narrationList: 'video-essay:narration:list',
  narrationGet: 'video-essay:narration:get',
  narrationStore: 'video-essay:narration:store',
  narrationTranscribe: 'video-essay:narration:transcribe',
  narrationUpdateCaptions: 'video-essay:narration:update-captions',
  narrationDelete: 'video-essay:narration:delete',
  narrationSelect: 'video-essay:narration:select',
  narrationInvalidate: 'video-essay:narration:invalidate',
  narrationDeleteSection: 'video-essay:narration:delete-section',
  narrationDeletePresentation: 'video-essay:narration:delete-presentation',
  narrationMigrate: 'video-essay:narration:migrate',
  projectExternalChange: 'video-essay:project:external-change',
  projectNewRequested: 'video-essay:project:new-requested',
  projectOpenRequested: 'video-essay:project:open-requested',
  projectSaveRequested: 'video-essay:project:save-requested',
  undoRequested: 'video-essay:edit:undo-requested',
  redoRequested: 'video-essay:edit:redo-requested',
  exportStart: 'video-essay:export:start',
  exportCancel: 'video-essay:export:cancel',
  exportProgress: 'video-essay:export:progress',
  narrationEnhancePreview: 'video-essay:narration:enhance-preview',
  finalPreviewAudio: 'video-essay:final-preview:audio',
  openVideo: 'video-essay:file:open-video',
  showInFinder: 'video-essay:file:show-in-finder',
  renderJob: 'video-essay:render:job',
  renderFrame: 'video-essay:render:frame',
  renderCalibrationReady: 'video-essay:render:calibration-ready',
  renderReady: 'video-essay:render:ready',
  renderFrameRendered: 'video-essay:render:frame-rendered',
  renderFailed: 'video-essay:render:failed',
} as const

type Unsubscribe = () => void

function subscribe<T>(channel: string, listener: (value: T) => void): Unsubscribe {
  const wrapped = (_event: Electron.IpcRendererEvent, value: T) => listener(value)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const videoEssayDesktop = Object.freeze({
  createProject: (presentation: Presentation) => ipcRenderer.invoke(CHANNELS.projectCreate, presentation),
  openProject: () => ipcRenderer.invoke(CHANNELS.projectOpen),
  saveProject: (request: DesktopProjectSaveRequest) => ipcRenderer.invoke(CHANNELS.projectSave, request),
  reloadProject: (projectId: string) => ipcRenderer.invoke(CHANNELS.projectReload, projectId),
  refreshProjectAssets: (projectId: string, presentation: Presentation) => ipcRenderer.invoke(CHANNELS.projectRefreshAssets, projectId, presentation),
  revealProject: (projectId: string) => ipcRenderer.invoke(CHANNELS.projectReveal, projectId),
  chooseImage: (projectId: string) => ipcRenderer.invoke(CHANNELS.projectChooseImage, projectId),
  chooseVideo: (projectId: string) => ipcRenderer.invoke(CHANNELS.projectChooseVideo, projectId),
  importDroppedImage: (projectId: string, file: File) => ipcRenderer.invoke(CHANNELS.projectImportImage, {
    projectId,
    sourcePath: webUtils.getPathForFile(file),
  }),
  importDroppedVideo: (projectId: string, file: File) => ipcRenderer.invoke(CHANNELS.projectImportVideo, {
    projectId,
    sourcePath: webUtils.getPathForFile(file),
  }),
  importRemoteImage: (request: DesktopRemoteImageRequest) => ipcRenderer.invoke(CHANNELS.projectImportRemoteImage, request),
  importClipboardImage: (projectId: string) => ipcRenderer.invoke(CHANNELS.projectImportClipboardImage, projectId),
  saveImageBytes: (request: DesktopImageBytesRequest) => ipcRenderer.invoke(CHANNELS.projectSaveImageBytes, request),
  setProjectDirty: (projectId: string, dirty: boolean) => ipcRenderer.invoke(CHANNELS.projectSetDirty, projectId, dirty),
  narrationStatus: (projectId: string, presentationId: string) => ipcRenderer.invoke(CHANNELS.narrationStatus, projectId, presentationId),
  narrationList: (projectId: string, presentationId: string, sectionId: string) => ipcRenderer.invoke(CHANNELS.narrationList, projectId, presentationId, sectionId),
  narrationGet: (projectId: string, presentationId: string, takeId: string) => ipcRenderer.invoke(CHANNELS.narrationGet, projectId, presentationId, takeId),
  narrationStore: (projectId: string, take: DesktopNarrationTakeWrite) => ipcRenderer.invoke(CHANNELS.narrationStore, projectId, take),
  narrationTranscribe: (projectId: string, presentationId: string, takeId: string): Promise<DesktopNarrationTakeData> =>
    ipcRenderer.invoke(CHANNELS.narrationTranscribe, projectId, presentationId, takeId),
  narrationUpdateCaptions: (projectId: string, presentationId: string, takeId: string, track: NarrationCaptionTrack): Promise<DesktopNarrationTakeData> =>
    ipcRenderer.invoke(CHANNELS.narrationUpdateCaptions, projectId, presentationId, takeId, track),
  narrationDelete: (projectId: string, presentationId: string, takeId: string) => ipcRenderer.invoke(CHANNELS.narrationDelete, projectId, presentationId, takeId),
  narrationSelect: (projectId: string, presentationId: string, sectionId: string, takeId: string | null) => ipcRenderer.invoke(CHANNELS.narrationSelect, projectId, presentationId, sectionId, takeId),
  narrationInvalidate: (projectId: string, presentationId: string, sectionId: string) => ipcRenderer.invoke(CHANNELS.narrationInvalidate, projectId, presentationId, sectionId),
  narrationDeleteSection: (projectId: string, presentationId: string, sectionId: string) => ipcRenderer.invoke(CHANNELS.narrationDeleteSection, projectId, presentationId, sectionId),
  narrationDeletePresentation: (projectId: string, presentationId: string) => ipcRenderer.invoke(CHANNELS.narrationDeletePresentation, projectId, presentationId),
  narrationMigrate: (projectId: string, presentationId: string, takes: DesktopNarrationTakeWrite[]) => ipcRenderer.invoke(CHANNELS.narrationMigrate, projectId, presentationId, takes),
  onProjectNewRequested: (listener: () => void) => subscribe(CHANNELS.projectNewRequested, listener),
  onProjectOpenRequested: (listener: () => void) => subscribe(CHANNELS.projectOpenRequested, listener),
  onProjectSaveRequested: (listener: () => void) => subscribe(CHANNELS.projectSaveRequested, listener),
  onProjectExternalChange: (listener: (change: DesktopProjectExternalChange) => void) =>
    subscribe(CHANNELS.projectExternalChange, listener),
  onUndoRequested: (listener: () => void) => subscribe(CHANNELS.undoRequested, listener),
  onRedoRequested: (listener: () => void) => subscribe(CHANNELS.redoRequested, listener),
  exportVideo: (job: DesktopExportJob): Promise<DesktopExportResult> => ipcRenderer.invoke(CHANNELS.exportStart, job),
  enhanceNarrationPreview: (request: DesktopNarrationPreviewRequest): Promise<DesktopNarrationPreviewResult> =>
    ipcRenderer.invoke(CHANNELS.narrationEnhancePreview, request),
  prepareFinalPreviewAudio: (request: DesktopFinalPreviewAudioRequest): Promise<DesktopFinalPreviewAudioResult> =>
    ipcRenderer.invoke(CHANNELS.finalPreviewAudio, request),
  cancelExport: (): Promise<void> => ipcRenderer.invoke(CHANNELS.exportCancel),
  onExportProgress: (listener: (progress: DesktopExportProgress) => void) =>
    subscribe(CHANNELS.exportProgress, listener),
  openVideo: (filePath: string): Promise<void> => ipcRenderer.invoke(CHANNELS.openVideo, filePath),
  showInFinder: (filePath: string): Promise<void> => ipcRenderer.invoke(CHANNELS.showInFinder, filePath),

  // These methods are consumed only by the hidden ?mode=export-render surface.
  onRenderJob: (listener: (job: DesktopExportJob) => void) => subscribe(CHANNELS.renderJob, listener),
  onRenderFrame: (listener: (request: DesktopRenderFrameRequest) => void) => subscribe(CHANNELS.renderFrame, listener),
  renderCalibrationReady: () => ipcRenderer.send(CHANNELS.renderCalibrationReady),
  renderReady: (jobId: string) => ipcRenderer.send(CHANNELS.renderReady, jobId),
  renderFrameRendered: (request: DesktopRenderFrameRequest) => ipcRenderer.send(CHANNELS.renderFrameRendered, request),
  renderFailed: (jobId: string, message: string) => ipcRenderer.send(CHANNELS.renderFailed, { jobId, message }),
})

contextBridge.exposeInMainWorld('videoEssayDesktop', videoEssayDesktop)
