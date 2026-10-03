import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol, session, shell, type WebContents } from 'electron'
import { CHANNELS } from './export/channels'
import { VideoExporter } from './export/videoExporter'
import { validateCompletedVideoPath, validateExportJob, validateJobId, validateRenderFrameRequest } from './export/validation'
import { MAX_VIDEO_BYTES, PROJECT_ASSET_PROTOCOL, ProjectStore } from './project/projectStore'
import { bufferAssetResponse, fileAssetResponse } from './project/assetStreaming'
import { PortableNarrationStore } from './project/portableNarrationStore'
import type { DesktopNarrationTakeWrite } from '../src/desktop/desktopTypes'
import { narrationPreviewCache } from './narrationPreviewProcessor'
import { finalPreviewAudioCache } from './finalPreviewAudioProcessor'
import { CaptionTranscriber } from './captions/captionTranscriber'
import { resolveWhisperExecutable, resolveWhisperModel } from './captions/captionResources'
import type { NarrationCaptionTrack } from '../src/narration/narrationTypes'
import { resolveFfmpegPath, spawnFfmpeg, waitForExit, waitForSpawn } from './export/ffmpeg'

protocol.registerSchemesAsPrivileged([{
  scheme: PROJECT_ASSET_PROTOCOL,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
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
const narration = new PortableNarrationStore(projects)
const captionTranscriber = new CaptionTranscriber({
  resolveExecutable: resolveWhisperExecutable,
  resolveModel: resolveWhisperModel,
  resolveFfmpeg: resolveFfmpegPath,
  getTake: (projectId, presentationId, takeId) => narration.get(projectId, presentationId, takeId),
  saveCaptions: (projectId, presentationId, takeId, track) => narration.setCaptions(projectId, presentationId, takeId, track),
})
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

function assertNarrationIdentity(projectId: unknown, presentationId: unknown) {
  if (typeof projectId !== 'string' || typeof presentationId !== 'string') {
    throw new Error('Invalid narration Project or presentation ID.')
  }
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

async function importNormalizedVideo(projectId: string, sourcePath: string) {
  const resolvedSourcePath = path.resolve(sourcePath)
  const extension = path.extname(resolvedSourcePath).toLowerCase()
  if (extension !== '.mp4' && extension !== '.mov') {
    throw new Error('Only MP4 and QuickTime video files can be imported.')
  }
  let sourceInfo
  try {
    sourceInfo = await stat(resolvedSourcePath)
  } catch {
    throw new Error('The selected video is unavailable.')
  }
  if (!sourceInfo.isFile()) throw new Error('The selected video is not a regular file.')
  if (sourceInfo.size === 0 || sourceInfo.size > MAX_VIDEO_BYTES) {
    throw new Error(`Video files must be between 1 byte and ${MAX_VIDEO_BYTES / 1024 / 1024 / 1024} GB.`)
  }
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'ai-presentation-video-import-'))
  const outputPath = path.join(temporaryRoot, 'normalized.mp4')
  try {
    const child = spawnFfmpeg([
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-i', resolvedSourcePath,
      '-map', '0:v:0', '-an',
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      outputPath,
    ])
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    await waitForSpawn(child)
    child.stdin.end()
    try {
      await waitForExit(child, { get value() { return stderr } })
    } catch {
      const detail = stderr.trim().split('\n').slice(-6).join('\n')
      throw new Error(`The selected video could not be decoded${detail ? `: ${detail}` : '.'}`)
    }
    return await projects.importVideoFile(projectId, outputPath, path.basename(resolvedSourcePath))
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined)
  }
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
  ipcMain.handle(CHANNELS.projectChooseVideo, async (event, projectId: unknown) => {
    assertMainSender(event.sender)
    if (typeof projectId !== 'string') throw new Error('Invalid Project ID.')
    projects.revealPath(projectId)
    const selected = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Video',
      buttonLabel: 'Import Video',
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov'] }],
    })
    if (selected.canceled || selected.filePaths.length !== 1) return { status: 'cancelled' as const }
    return { status: 'imported' as const, asset: await importNormalizedVideo(projectId, selected.filePaths[0]) }
  })
  ipcMain.handle(CHANNELS.projectImportImage, async (event, request: unknown) => {
    assertMainSender(event.sender)
    if (!request || typeof request !== 'object') throw new Error('Invalid image import request.')
    const { projectId, sourcePath } = request as Record<string, unknown>
    if (typeof projectId !== 'string' || typeof sourcePath !== 'string') throw new Error('Invalid image import request.')
    return projects.importFile(projectId, sourcePath)
  })
  ipcMain.handle(CHANNELS.projectImportVideo, async (event, request: unknown) => {
    assertMainSender(event.sender)
    if (!request || typeof request !== 'object') throw new Error('Invalid video import request.')
    const { projectId, sourcePath } = request as Record<string, unknown>
    if (typeof projectId !== 'string' || typeof sourcePath !== 'string') throw new Error('Invalid video import request.')
    return importNormalizedVideo(projectId, sourcePath)
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
  ipcMain.handle(CHANNELS.narrationStatus, (event, projectId: unknown, presentationId: unknown) => {
    assertMainSender(event.sender)
    assertNarrationIdentity(projectId, presentationId)
    return narration.status(projectId as string, presentationId as string)
  })
  ipcMain.handle(CHANNELS.narrationList, (event, projectId: unknown, presentationId: unknown, sectionId: unknown) => {
    assertMainSender(event.sender)
    assertNarrationIdentity(projectId, presentationId)
    if (typeof sectionId !== 'string') throw new Error('Invalid narration section ID.')
    return narration.list(projectId as string, presentationId as string, sectionId)
  })
  ipcMain.handle(CHANNELS.narrationGet, (event, projectId: unknown, presentationId: unknown, takeId: unknown) => {
    assertMainSender(event.sender)
    assertNarrationIdentity(projectId, presentationId)
    if (typeof takeId !== 'string') throw new Error('Invalid narration take ID.')
    return narration.get(projectId as string, presentationId as string, takeId)
  })
  ipcMain.handle(CHANNELS.narrationStore, (event, projectId: unknown, take: unknown) => {
    assertMainSender(event.sender)
    if (typeof projectId !== 'string' || !take || typeof take !== 'object') throw new Error('Invalid narration take request.')
    return narration.store(projectId, take as DesktopNarrationTakeWrite)
  })
  ipcMain.handle(CHANNELS.narrationDelete, (event, projectId: unknown, presentationId: unknown, takeId: unknown) => {
    assertMainSender(event.sender)
    assertNarrationIdentity(projectId, presentationId)
    if (typeof takeId !== 'string') throw new Error('Invalid narration take ID.')
    return narration.delete(projectId as string, presentationId as string, takeId)
  })
  ipcMain.handle(CHANNELS.narrationSelect, (event, projectId: unknown, presentationId: unknown, sectionId: unknown, takeId: unknown) => {
    assertMainSender(event.sender)
    assertNarrationIdentity(projectId, presentationId)
    if (typeof sectionId !== 'string' || (takeId !== null && typeof takeId !== 'string')) throw new Error('Invalid narration selection.')
    return narration.select(projectId as string, presentationId as string, sectionId, takeId as string | null)
  })
  ipcMain.handle(CHANNELS.narrationInvalidate, (event, projectId: unknown, presentationId: unknown, sectionId: unknown) => {
    assertMainSender(event.sender)
    assertNarrationIdentity(projectId, presentationId)
    if (typeof sectionId !== 'string') throw new Error('Invalid narration section ID.')
    return narration.invalidate(projectId as string, presentationId as string, sectionId)
  })
  ipcMain.handle(CHANNELS.narrationDeleteSection, (event, projectId: unknown, presentationId: unknown, sectionId: unknown) => {
    assertMainSender(event.sender)
    assertNarrationIdentity(projectId, presentationId)
    if (typeof sectionId !== 'string') throw new Error('Invalid narration section ID.')
    return narration.deleteSection(projectId as string, presentationId as string, sectionId)
  })
  ipcMain.handle(CHANNELS.narrationDeletePresentation, (event, projectId: unknown, presentationId: unknown) => {
    assertMainSender(event.sender)
    assertNarrationIdentity(projectId, presentationId)
    return narration.deletePresentation(projectId as string, presentationId as string)
  })
  ipcMain.handle(CHANNELS.narrationMigrate, (event, projectId: unknown, presentationId: unknown, takes: unknown) => {
    assertMainSender(event.sender)
    assertNarrationIdentity(projectId, presentationId)
    if (!Array.isArray(takes)) throw new Error('Invalid legacy narration takes.')
    return narration.migrate(projectId as string, presentationId as string, takes as DesktopNarrationTakeWrite[])
  })
  ipcMain.handle(CHANNELS.narrationTranscribe, async (event, projectId: unknown, presentationId: unknown, takeId: unknown) => {
    assertMainSender(event.sender)
    assertNarrationIdentity(projectId, presentationId)
    if (typeof takeId !== 'string' || !takeId.trim()) throw new Error('Invalid narration take ID.')
    await captionTranscriber.transcribe(projectId as string, presentationId as string, takeId)
    const take = await narration.get(projectId as string, presentationId as string, takeId)
    if (!take) throw new Error('The narration take no longer exists.')
    return take
  })
  ipcMain.handle(CHANNELS.narrationUpdateCaptions, async (event, projectId: unknown, presentationId: unknown, takeId: unknown, track: unknown) => {
    assertMainSender(event.sender)
    assertNarrationIdentity(projectId, presentationId)
    if (typeof takeId !== 'string' || !takeId.trim() || !track || typeof track !== 'object' || Array.isArray(track)) {
      throw new Error('Invalid caption update request.')
    }
    await narration.setCaptions(projectId as string, presentationId as string, takeId, track as NarrationCaptionTrack, true)
    const take = await narration.get(projectId as string, presentationId as string, takeId)
    if (!take) throw new Error('The narration take no longer exists.')
    return take
  })
  ipcMain.handle(CHANNELS.exportStart, async (event, value: unknown) => {
    assertMainSender(event.sender)
    validateExportJob(value)
    await projects.assertRequiredAssetsAvailable(value.presentation)
    const presentation = await projects.captureExportAssets(value.jobId, value.presentation)
    try {
      return await exporter!.export({ ...value, presentation: presentation as unknown as typeof value.presentation }, event.sender)
    } finally {
      await projects.releaseExportAssets(value.jobId)
    }
  })
  ipcMain.handle(CHANNELS.exportCancel, async (event) => {
    assertMainSender(event.sender)
    await exporter!.cancel()
  })
  ipcMain.handle(CHANNELS.narrationEnhancePreview, async (event, request: unknown) => {
    assertMainSender(event.sender)
    return narrationPreviewCache.prepare(request)
  })
  ipcMain.handle(CHANNELS.finalPreviewAudio, async (event, request: unknown) => {
    assertMainSender(event.sender)
    return finalPreviewAudioCache.prepare(request)
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
  ipcMain.on(CHANNELS.renderFrameRendered, (event, value: unknown) => {
    if (!exporter?.ownsRenderSender(event.sender)) return
    const request = validateRenderFrameRequest(value)
    exporter.handleRenderFrameRendered(event.sender, request)
  })
  ipcMain.on(CHANNELS.renderFailed, (event, value: unknown) => {
    if (!exporter?.ownsRenderSender(event.sender) || !value || typeof value !== 'object') return
    const { jobId: rawJobId, message } = value as Record<string, unknown>
    const jobId = validateJobId(rawJobId)
    if (typeof message !== 'string' || message.length === 0 || message.length > 2_000) return
    exporter.handleRenderFailed(event.sender, jobId, message)
  })
}

function installProjectAssetProtocol() {
  protocol.handle(PROJECT_ASSET_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      const segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment))
      if (url.hostname === 'export' && segments.length === 2) {
        const asset = projects.resolveExportAsset(segments[0], segments[1])
        if (asset.bytes) return bufferAssetResponse(request, asset.bytes, asset.mimeType)
        if (asset.filePath) return await fileAssetResponse(request, asset.filePath, asset.mimeType)
        throw new Error('Export asset data is unavailable.')
      }
      if (url.hostname !== 'project') return new Response('Not found', { status: 404 })
      const projectId = segments.shift()
      if (!projectId) return new Response('Not found', { status: 404 })
      const relativePath = segments.join('/')
      const asset = await projects.resolveProtocolAsset(projectId, relativePath)
      return await fileAssetResponse(request, asset.filePath, asset.mimeType)
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
    void narrationPreviewCache.prune().catch((error) => console.warn('Narration preview cache cleanup failed:', error))
    void finalPreviewAudioCache.prune().catch((error) => console.warn('Final preview audio cache cleanup failed:', error))
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
