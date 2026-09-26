import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol, session, shell, type WebContents } from 'electron'
import { CHANNELS } from './export/channels'
import { VideoExporter } from './export/videoExporter'
import { validateCompletedVideoPath, validateExportJob, validateJobId } from './export/validation'
import { PROJECT_ASSET_PROTOCOL, ProjectStore } from './project/projectStore'

protocol.registerSchemesAsPrivileged([{
  scheme: PROJECT_ASSET_PROTOCOL,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}])

app.commandLine.appendSwitch('force-device-scale-factor', '1')
// Keep the existing Chromium profile path so Phase 5B projects and narration
// remain available after the user-facing product rename.
app.setPath('userData', path.join(app.getPath('appData'), 'Video Essay Studio'))
app.setName('AI Presentation Studio')

let mainWindow: BrowserWindow | null = null
let exporter: VideoExporter | null = null
let quittingAfterExportCleanup = false
let appQuitRequested = false
let allowWindowCloseOnce = false
let closePromptOpen = false
let pendingCloseAfterSave = false
const projects = new ProjectStore()
projects.onExternalChange((change) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(CHANNELS.projectExternalChange, change)
})

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
  allowWindowCloseOnce = false
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
  mainWindow.on('close', (event) => {
    if (allowWindowCloseOnce || !projects.activeIsDirty) return
    event.preventDefault()
    if (closePromptOpen || pendingCloseAfterSave) return
    closePromptOpen = true
    void dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      title: 'Save changes?',
      message: 'This Project has unsaved changes.',
      detail: 'Save before closing AI Presentation Studio?',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    }).then(({ response }) => {
      if (response === 0) {
        pendingCloseAfterSave = true
        mainWindow?.webContents.send(CHANNELS.projectSaveRequested)
      } else if (response === 1) {
        if (projects.activeProjectId) projects.setDirty(projects.activeProjectId, false)
        allowWindowCloseOnce = true
        if (appQuitRequested) app.quit()
        else mainWindow?.close()
      } else {
        appQuitRequested = false
      }
    }).finally(() => { closePromptOpen = false })
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { projects.close(); mainWindow = null })
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

function installApplicationMenu() {
  const send = (channel: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel)
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => send(CHANNELS.projectNewRequested) },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => send(CHANNELS.projectOpenRequested) },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send(CHANNELS.projectSaveRequested) },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send(CHANNELS.undoRequested) },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send(CHANNELS.redoRequested) },
        { label: 'Redo (Alternate)', accelerator: 'CmdOrCtrl+Y', click: () => send(CHANNELS.redoRequested) },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]))
}

function installIpcHandlers() {
  ipcMain.handle(CHANNELS.projectCreate, async (event, presentation: unknown) => {
    assertMainSender(event.sender)
    if (projects.activeIsDirty) throw new Error('Save or discard the active Project changes before creating another Project.')
    const selected = await dialog.showSaveDialog(mainWindow!, {
      title: 'New Project',
      buttonLabel: 'Create Project',
      defaultPath: path.join(app.getPath('documents'), 'Untitled Presentation'),
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (selected.canceled || !selected.filePath) return { status: 'cancelled' as const }
    return { status: 'completed' as const, project: await projects.createAt(selected.filePath, presentation) }
  })
  ipcMain.handle(CHANNELS.projectOpen, async (event) => {
    assertMainSender(event.sender)
    if (projects.activeIsDirty) throw new Error('Save or discard the active Project changes before opening another Project.')
    const selected = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open Project',
      buttonLabel: 'Open Project',
      properties: ['openDirectory'],
    })
    if (selected.canceled || selected.filePaths.length !== 1) return { status: 'cancelled' as const }
    return { status: 'completed' as const, project: await projects.openAt(selected.filePaths[0]) }
  })
  ipcMain.handle(CHANNELS.projectSave, async (event, request: unknown) => {
    assertMainSender(event.sender)
    if (!request || typeof request !== 'object') throw new Error('Invalid Project save request.')
    const { projectId, presentation, overwriteExternal } = request as Record<string, unknown>
    if (typeof projectId !== 'string' || (overwriteExternal !== undefined && typeof overwriteExternal !== 'boolean')) {
      throw new Error('Invalid Project save request.')
    }
    const result = await projects.save(projectId, presentation, overwriteExternal === true)
    if (result.status === 'saved' && pendingCloseAfterSave) {
      pendingCloseAfterSave = false
      allowWindowCloseOnce = true
      queueMicrotask(() => {
        if (appQuitRequested) app.quit()
        else mainWindow?.close()
      })
    }
    return result
  })
  ipcMain.handle(CHANNELS.projectReload, async (event, projectId: unknown) => {
    assertMainSender(event.sender)
    if (typeof projectId !== 'string') throw new Error('Invalid Project ID.')
    return projects.reload(projectId)
  })
  ipcMain.handle(CHANNELS.projectRefreshAssets, async (event, projectId: unknown, presentation: unknown) => {
    assertMainSender(event.sender)
    if (typeof projectId !== 'string') throw new Error('Invalid Project ID.')
    return projects.refreshAssets(projectId, presentation)
  })
  ipcMain.handle(CHANNELS.projectReveal, async (event, projectId: unknown) => {
    assertMainSender(event.sender)
    if (typeof projectId !== 'string') throw new Error('Invalid Project ID.')
    shell.showItemInFolder(projects.revealPath(projectId))
  })
  ipcMain.handle(CHANNELS.projectChooseImage, async (event, projectId: unknown) => {
    assertMainSender(event.sender)
    if (typeof projectId !== 'string') throw new Error('Invalid Project ID.')
    // Validate the active identity before showing a native picker.
    projects.revealPath(projectId)
    const selected = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Image',
      buttonLabel: 'Import Image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }],
    })
    if (selected.canceled || selected.filePaths.length !== 1) return { status: 'cancelled' as const }
    return { status: 'imported' as const, asset: await projects.importFile(projectId, selected.filePaths[0]) }
  })
  ipcMain.handle(CHANNELS.projectImportImage, async (event, request: unknown) => {
    assertMainSender(event.sender)
    if (!request || typeof request !== 'object') throw new Error('Invalid image import request.')
    const { projectId, sourcePath } = request as Record<string, unknown>
    if (typeof projectId !== 'string' || typeof sourcePath !== 'string') throw new Error('Invalid image import request.')
    return projects.importFile(projectId, sourcePath)
  })
  ipcMain.handle(CHANNELS.projectImportRemoteImage, async (event, request: unknown) => {
    assertMainSender(event.sender)
    if (!request || typeof request !== 'object') throw new Error('Invalid remote image import request.')
    const { projectId, url, suggestedName } = request as Record<string, unknown>
    if (typeof projectId !== 'string' || typeof url !== 'string'
      || (suggestedName !== undefined && typeof suggestedName !== 'string')) {
      throw new Error('Invalid remote image import request.')
    }
    return projects.importRemote(projectId, url, suggestedName)
  })
  ipcMain.handle(CHANNELS.projectImportClipboardImage, async (event, projectId: unknown) => {
    assertMainSender(event.sender)
    if (typeof projectId !== 'string') throw new Error('Invalid Project ID.')
    // Validate the active Project before reading or materializing clipboard data.
    projects.revealPath(projectId)
    const supportedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const
    const items = await clipboard.read()
    const match = items.flatMap((item) => supportedTypes
      .filter((mimeType) => item.types.includes(mimeType))
      .map((mimeType) => ({ item, mimeType })))[0]
    if (!match) return { status: 'cancelled' as const }
    const blob = await match.item.getType(match.mimeType)
    if (!(blob instanceof Blob)) return { status: 'cancelled' as const }
    const asset = await projects.importBytes(
      projectId,
      await blob.arrayBuffer(),
      match.mimeType,
      `pasted-image${match.mimeType === 'image/jpeg' ? '.jpg' : match.mimeType === 'image/svg+xml' ? '.svg' : `.${match.mimeType.slice(6)}`}`,
    )
    return { status: 'imported' as const, asset }
  })
  ipcMain.handle(CHANNELS.projectSaveImageBytes, async (event, request: unknown) => {
    assertMainSender(event.sender)
    if (!request || typeof request !== 'object') throw new Error('Invalid pasted image request.')
    const { projectId, bytes, mimeType, suggestedName } = request as Record<string, unknown>
    if (typeof projectId !== 'string' || !(bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes))
      || typeof mimeType !== 'string' || (suggestedName !== undefined && typeof suggestedName !== 'string')) {
      throw new Error('Invalid pasted image request.')
    }
    const byteView = bytes instanceof ArrayBuffer
      ? bytes
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return projects.importBytes(projectId, byteView, mimeType as never, suggestedName)
  })
  ipcMain.handle(CHANNELS.projectSetDirty, (event, projectId: unknown, dirty: unknown) => {
    assertMainSender(event.sender)
    if (typeof projectId !== 'string' || typeof dirty !== 'boolean') throw new Error('Invalid Project dirty-state update.')
    projects.setDirty(projectId, dirty)
    pendingCloseAfterSave = false
    if (dirty) appQuitRequested = false
  })
  ipcMain.handle(CHANNELS.exportStart, async (event, value: unknown) => {
    assertMainSender(event.sender)
    validateExportJob(value)
    await projects.assertRequiredAssetsAvailable(value.presentation)
    const presentation = await projects.captureExportAssets(value.jobId, value.presentation)
    try {
      return await exporter!.export({ ...value, presentation: presentation as unknown as typeof value.presentation }, event.sender)
    } finally {
      projects.releaseExportAssets(value.jobId)
    }
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

function installProjectAssetProtocol() {
  protocol.handle(PROJECT_ASSET_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      const segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment))
      if (url.hostname === 'export' && segments.length === 2) {
        const asset = projects.resolveExportAsset(segments[0], segments[1])
        return new Response(new Uint8Array(asset.bytes), {
          status: 200,
          headers: {
            'Content-Type': asset.mimeType,
            'Content-Length': String(asset.bytes.byteLength),
            'Cache-Control': 'no-store',
          },
        })
      }
      if (url.hostname !== 'project') return new Response('Not found', { status: 404 })
      const projectId = segments.shift()
      if (!projectId) return new Response('Not found', { status: 404 })
      const relativePath = segments.join('/')
      const asset = await projects.resolveProtocolAsset(projectId, relativePath)
      const bytes = await readFile(asset.filePath)
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          'Content-Type': asset.mimeType,
          'Content-Length': String(bytes.byteLength),
          'Cache-Control': 'no-store',
        },
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
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
    installProjectAssetProtocol()
    exporter = new VideoExporter(() => mainWindow, preloadPath)
    installIpcHandlers()
    await createMainWindow()
    installApplicationMenu()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createMainWindow()
    })
  }).catch((error) => {
    console.error(error)
    app.quit()
  })
}

app.on('before-quit', (event) => {
  appQuitRequested = true
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
