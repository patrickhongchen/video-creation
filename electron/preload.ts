import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  DesktopExportJob,
  DesktopExportProgress,
  DesktopExportResult,
  DesktopRenderStart,
} from './export/types'
import type {
  DesktopImageBytesRequest,
  DesktopProjectSaveRequest,
  DesktopRemoteImageRequest,
} from '../src/desktop/desktopTypes'
import type { Presentation } from '../src/model'

// Keep the sandboxed preload self-contained. Sandboxed preloads cannot require
// arbitrary local chunks, so these narrow channel names intentionally mirror
// the main-process constants instead of importing a code-split runtime module.
const CHANNELS = {
  projectCreate: 'video-essay:project:create',
  projectOpen: 'video-essay:project:open',
  projectSave: 'video-essay:project:save',
  projectReload: 'video-essay:project:reload',
  projectReveal: 'video-essay:project:reveal',
  projectChooseImage: 'video-essay:project:choose-image',
  projectImportImage: 'video-essay:project:import-image',
  projectImportRemoteImage: 'video-essay:project:import-remote-image',
  projectImportClipboardImage: 'video-essay:project:import-clipboard-image',
  projectSaveImageBytes: 'video-essay:project:save-image-bytes',
  projectSetDirty: 'video-essay:project:set-dirty',
  projectNewRequested: 'video-essay:project:new-requested',
  projectOpenRequested: 'video-essay:project:open-requested',
  projectSaveRequested: 'video-essay:project:save-requested',
  exportStart: 'video-essay:export:start',
  exportCancel: 'video-essay:export:cancel',
  exportProgress: 'video-essay:export:progress',
  openVideo: 'video-essay:file:open-video',
  showInFinder: 'video-essay:file:show-in-finder',
  renderJob: 'video-essay:render:job',
  renderStart: 'video-essay:render:start',
  renderCalibrationReady: 'video-essay:render:calibration-ready',
  renderReady: 'video-essay:render:ready',
  renderStarted: 'video-essay:render:started',
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
  revealProject: (projectId: string) => ipcRenderer.invoke(CHANNELS.projectReveal, projectId),
  chooseImage: (projectId: string) => ipcRenderer.invoke(CHANNELS.projectChooseImage, projectId),
  importDroppedImage: (projectId: string, file: File) => ipcRenderer.invoke(CHANNELS.projectImportImage, {
    projectId,
    sourcePath: webUtils.getPathForFile(file),
  }),
  importRemoteImage: (request: DesktopRemoteImageRequest) => ipcRenderer.invoke(CHANNELS.projectImportRemoteImage, request),
  importClipboardImage: (projectId: string) => ipcRenderer.invoke(CHANNELS.projectImportClipboardImage, projectId),
  saveImageBytes: (request: DesktopImageBytesRequest) => ipcRenderer.invoke(CHANNELS.projectSaveImageBytes, request),
  setProjectDirty: (projectId: string, dirty: boolean) => ipcRenderer.invoke(CHANNELS.projectSetDirty, projectId, dirty),
  onProjectNewRequested: (listener: () => void) => subscribe(CHANNELS.projectNewRequested, listener),
  onProjectOpenRequested: (listener: () => void) => subscribe(CHANNELS.projectOpenRequested, listener),
  onProjectSaveRequested: (listener: () => void) => subscribe(CHANNELS.projectSaveRequested, listener),
  exportVideo: (job: DesktopExportJob): Promise<DesktopExportResult> => ipcRenderer.invoke(CHANNELS.exportStart, job),
  cancelExport: (): Promise<void> => ipcRenderer.invoke(CHANNELS.exportCancel),
  onExportProgress: (listener: (progress: DesktopExportProgress) => void) =>
    subscribe(CHANNELS.exportProgress, listener),
  openVideo: (filePath: string): Promise<void> => ipcRenderer.invoke(CHANNELS.openVideo, filePath),
  showInFinder: (filePath: string): Promise<void> => ipcRenderer.invoke(CHANNELS.showInFinder, filePath),

  // These methods are consumed only by the hidden ?mode=export-render surface.
  onRenderJob: (listener: (job: DesktopExportJob) => void) => subscribe(CHANNELS.renderJob, listener),
  onRenderStart: (listener: (start: DesktopRenderStart) => void) => subscribe(CHANNELS.renderStart, listener),
  renderCalibrationReady: () => ipcRenderer.send(CHANNELS.renderCalibrationReady),
  renderReady: (jobId: string) => ipcRenderer.send(CHANNELS.renderReady, jobId),
  renderStarted: (jobId: string) => ipcRenderer.send(CHANNELS.renderStarted, jobId),
})

contextBridge.exposeInMainWorld('videoEssayDesktop', videoEssayDesktop)
