import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, session, shell, type WebContents } from 'electron'
import { CHANNELS } from './export/channels'
import { VideoExporter } from './export/videoExporter'
import { validateCompletedVideoPath, validateExportJob, validateJobId } from './export/validation'

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.setName('Video Essay Studio')

let mainWindow: BrowserWindow | null = null
let exporter: VideoExporter | null = null
let quittingAfterExportCleanup = false

const preloadPath = path.join(__dirname, 'preload.cjs')

function isMainSender(sender: WebContents) {
  return mainWindow !== null && !mainWindow.isDestroyed() && mainWindow.webContents === sender
}

function assertMainSender(sender: WebContents) {
  if (!isMainSender(sender)) throw new Error('This desktop operation is only available to the editor window.')
}

function rendererOrigin() {
  const developmentUrl = process.env.VITE_DEV_SERVER_URL
  return developmentUrl ? new URL(developmentUrl).origin : null
}

function isTrustedRendererUrl(value: string) {
  try {
    const url = new URL(value)
    const developmentOrigin = rendererOrigin()
    if (developmentOrigin) return url.origin === developmentOrigin
    return url.protocol === 'file:'
      && path.resolve(fileURLToPath(url)) === path.resolve(__dirname, '..', 'dist', 'index.html')
  } catch {
    return false
  }
}

function secureWindow(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#f5f3ee',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  secureWindow(mainWindow)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })
  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function installPermissionHandlers() {
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => {
    const mediaType = (details as { mediaType?: string }).mediaType
    return webContents !== null && isMainSender(webContents) && permission === 'media' && mediaType !== 'video'
  })
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes ?? []
    const audioOnly = mediaTypes.includes('audio') && !mediaTypes.includes('video')
    callback(isMainSender(webContents) && permission === 'media' && audioOnly)
  })
}

function installIpcHandlers() {
  ipcMain.handle(CHANNELS.exportStart, async (event, value: unknown) => {
    assertMainSender(event.sender)
    validateExportJob(value)
    return exporter!.export(value, event.sender)
  })
  ipcMain.handle(CHANNELS.exportCancel, async (event) => {
    assertMainSender(event.sender)
    await exporter!.cancel()
  })
  ipcMain.handle(CHANNELS.openVideo, async (event, value: unknown) => {
    assertMainSender(event.sender)
    const outputPath = validateCompletedVideoPath(value, exporter!.completedOutputs)
    const error = await shell.openPath(outputPath)
    if (error) throw new Error(error)
  })
  ipcMain.handle(CHANNELS.showInFinder, (event, value: unknown) => {
    assertMainSender(event.sender)
    shell.showItemInFolder(validateCompletedVideoPath(value, exporter!.completedOutputs))
  })
  ipcMain.on(CHANNELS.renderCalibrationReady, (event) => exporter?.handleCalibrationReady(event.sender))
  ipcMain.on(CHANNELS.renderReady, (event, value: unknown) => {
    if (!exporter?.ownsRenderSender(event.sender)) return
    const jobId = validateJobId(value)
    exporter.handleRenderReady(event.sender, jobId)
  })
  ipcMain.on(CHANNELS.renderStarted, (event, value: unknown) => {
    if (!exporter?.ownsRenderSender(event.sender)) return
    const jobId = validateJobId(value)
    exporter.handleRenderStarted(event.sender, jobId)
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.whenReady().then(async () => {
    installPermissionHandlers()
    exporter = new VideoExporter(() => mainWindow, preloadPath)
    installIpcHandlers()
    await createMainWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createMainWindow()
    })
  }).catch((error) => {
    console.error(error)
    app.quit()
  })
}

app.on('before-quit', (event) => {
  if (quittingAfterExportCleanup || !exporter?.hasActiveExport()) return
  event.preventDefault()
  void exporter.cancel().finally(() => {
    quittingAfterExportCleanup = true
    app.quit()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
