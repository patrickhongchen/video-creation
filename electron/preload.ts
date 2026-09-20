import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopExportJob,
  DesktopExportProgress,
  DesktopExportResult,
  DesktopRenderStart,
} from './export/types'

// Keep the sandboxed preload self-contained. Sandboxed preloads cannot require
// arbitrary local chunks, so these narrow channel names intentionally mirror
// the main-process constants instead of importing a code-split runtime module.
const CHANNELS = {
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
