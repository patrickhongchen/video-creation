import { randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
} from 'node:fs/promises'
import path from 'node:path'
import type { DesktopNarrationTakeData, DesktopNarrationTakeWrite } from '../../src/desktop/desktopTypes'
import type {
  NarrationCaptionSegment,
  NarrationCaptionTrack,
  NarrationPointerSample,
  SceneCue,
} from '../../src/narration/narrationTypes'
import type { ProjectStore } from './projectStore'

const MANIFEST_VERSION = 1
const MANIFEST_FILE_NAME = 'manifest.json'
const TAKES_DIRECTORY = 'takes'
const MIGRATION_MARKER_FILE_NAME = '.migration.json'

interface PortableNarrationManifestTake {
  id: string
  sectionId: string
  createdAt: string
  durationMs: number
  mimeType: string
  audioPath: string
  cues: SceneCue[]
  pointerTrack?: NarrationPointerSample[]
  captions?: NarrationCaptionTrack
  selected: boolean
  invalidated?: boolean
}

interface PortableNarrationManifest {
  version: typeof MANIFEST_VERSION
  presentationId: string
  takes: PortableNarrationManifestTake[]
}

interface PortableNarrationMigrationMarker {
  version: 1
  presentationId: string
}

interface PortableNarrationStoreOptions {
  writeAudio?: (filePath: string, bytes: Uint8Array) => Promise<void>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 512 || /[\u0000-\u001f\u007f/\\]/.test(value)) {
    throw new Error(`${label} must be a safe non-empty identifier.`)
  }
}

function audioExtension(mimeType: unknown) {
  if (typeof mimeType !== 'string') throw new Error('Narration take MIME type is invalid.')
  switch (mimeType.toLowerCase().split(';', 1)[0].trim()) {
    case 'audio/webm': return '.webm'
    case 'audio/ogg': return '.ogg'
    case 'audio/mp4': return '.m4a'
    default: throw new Error(`Unsupported narration audio MIME type: ${mimeType || '(empty)'}.`)
  }
}

export function validateNarrationAudioPath(value: unknown, mimeType?: string) {
  if (typeof value !== 'string' || value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value)) {
    throw new Error('Narration audio path must be a safe relative path under takes/.')
  }
  const parts = value.split('/')
  if (path.posix.normalize(value) !== value || !value.startsWith(`${TAKES_DIRECTORY}/`) || parts.length !== 2
    || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Narration audio path must be a safe relative path under takes/.')
  }
  if (mimeType && path.posix.extname(value).toLowerCase() !== audioExtension(mimeType)) {
    throw new Error('Narration audio path extension does not match its MIME type.')
  }
  return value
}

function assertFiniteNonnegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`)
  }
}

function validateCue(value: unknown, index: number): SceneCue {
  if (!isObject(value)) throw new Error(`Narration cue ${index} is malformed.`)
  assertIdentifier(value.sceneId, `Narration cue ${index} sceneId`)
  assertFiniteNonnegative(value.timeMs, `Narration cue ${index} timeMs`)
  if (value.type === undefined) return { sceneId: value.sceneId, timeMs: value.timeMs }
  if (value.type === 'slide') return { type: 'slide', sceneId: value.sceneId, timeMs: value.timeMs }
  if (value.type === 'reveal' && Number.isSafeInteger(value.order) && (value.order as number) > 0) {
    return { type: 'reveal', sceneId: value.sceneId, order: value.order as number, timeMs: value.timeMs }
  }
  throw new Error(`Narration cue ${index} has an unsupported type or reveal order.`)
}

function validatePointerSample(value: unknown, index: number): NarrationPointerSample {
  if (!isObject(value)) throw new Error(`Narration pointer sample ${index} is malformed.`)
  assertIdentifier(value.sceneId, `Narration pointer sample ${index} sceneId`)
  assertFiniteNonnegative(value.timeMs, `Narration pointer sample ${index} timeMs`)
  if (typeof value.x !== 'number' || !Number.isFinite(value.x) || value.x < 0 || value.x > 1
    || typeof value.y !== 'number' || !Number.isFinite(value.y) || value.y < 0 || value.y > 1
    || typeof value.visible !== 'boolean') {
    throw new Error(`Narration pointer sample ${index} is malformed.`)
  }
  return {
    timeMs: value.timeMs,
    sceneId: value.sceneId,
    x: value.x,
    y: value.y,
    visible: value.visible,
  }
}

function validateCaptionSegment(
  value: unknown,
  index: number,
  durationMs: number,
): NarrationCaptionSegment {
  if (!isObject(value)) throw new Error(`Narration caption segment ${index} is malformed.`)
  assertIdentifier(value.id, `Narration caption segment ${index} id`)
  assertFiniteNonnegative(value.startMs, `Narration caption segment ${index} startMs`)
  assertFiniteNonnegative(value.endMs, `Narration caption segment ${index} endMs`)
  if (value.endMs <= value.startMs) {
    throw new Error(`Narration caption segment ${index} must end after it starts.`)
  }
  if (value.endMs > durationMs + 1_000) {
    throw new Error(`Narration caption segment ${index} extends beyond the narration take.`)
  }
  if (typeof value.generatedText !== 'string' || !value.generatedText.trim()) {
    throw new Error(`Narration caption segment ${index} generatedText must be non-empty.`)
  }
  if (typeof value.text !== 'string' || !value.text.trim()) {
    throw new Error(`Narration caption segment ${index} text must be non-empty.`)
  }
  return {
    id: value.id,
    startMs: value.startMs,
    endMs: value.endMs,
    generatedText: value.generatedText,
    text: value.text,
  }
}

function validateCaptionTrack(value: unknown, durationMs: number): NarrationCaptionTrack {
  if (!isObject(value)) throw new Error('Narration captions are malformed.')
  if (value.version !== 1 || value.provider !== 'whisper.cpp' || value.model !== 'medium.en') {
    throw new Error('Narration captions version, provider, or model is unsupported.')
  }
  if (typeof value.generatedAt !== 'string' || value.generatedAt.length > 100
    || !Number.isFinite(Date.parse(value.generatedAt))) {
    throw new Error('Narration captions generatedAt is invalid.')
  }
  if (!Array.isArray(value.segments)) throw new Error('Narration captions segments must be an array.')
  const segments = value.segments
    .map((segment, index) => validateCaptionSegment(segment, index, durationMs))
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
  const ids = new Set<string>()
  for (const segment of segments) {
    if (ids.has(segment.id)) {
      throw new Error(`Narration captions contain duplicate segment id ${segment.id}.`)
    }
    ids.add(segment.id)
  }
  return {
    version: 1,
    provider: 'whisper.cpp',
    model: 'medium.en',
    generatedAt: value.generatedAt,
    segments,
  }
}

function validateTakeMetadata(
  value: unknown,
  audio: { generate: true } | { path: unknown },
): PortableNarrationManifestTake {
  if (!isObject(value)) throw new Error('Narration take metadata is malformed.')
  assertIdentifier(value.id, 'Narration take id')
  assertIdentifier(value.sectionId, 'Narration take sectionId')
  if (typeof value.createdAt !== 'string' || value.createdAt.length > 100 || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new Error('Narration take createdAt is invalid.')
  }
  assertFiniteNonnegative(value.durationMs, 'Narration take durationMs')
  const extension = audioExtension(value.mimeType)
  if (!Array.isArray(value.cues)) throw new Error('Narration take cues must be an array.')
  if (typeof value.selected !== 'boolean') throw new Error('Narration take selected state is invalid.')
  if (value.invalidated !== undefined && typeof value.invalidated !== 'boolean') {
    throw new Error('Narration take invalidated state is invalid.')
  }
  if (value.pointerTrack !== undefined && !Array.isArray(value.pointerTrack)) {
    throw new Error('Narration take pointerTrack must be an array.')
  }
  const resolvedAudioPath = 'generate' in audio
    ? `${TAKES_DIRECTORY}/take-${randomUUID()}${extension}`
    : validateNarrationAudioPath(audio.path, value.mimeType as string)
  return {
    id: value.id,
    sectionId: value.sectionId,
    createdAt: value.createdAt,
    durationMs: value.durationMs,
    mimeType: value.mimeType as string,
    audioPath: resolvedAudioPath,
    cues: value.cues.map(validateCue),
    ...(value.pointerTrack === undefined
      ? {}
      : { pointerTrack: value.pointerTrack.map(validatePointerSample) }),
    ...(value.captions === undefined
      ? {}
      : { captions: validateCaptionTrack(value.captions, value.durationMs) }),
    selected: value.selected,
    ...(value.invalidated === undefined ? {} : { invalidated: value.invalidated }),
  }
}

function validateManifest(value: unknown, presentationId: string): PortableNarrationManifest {
  if (!isObject(value)) throw new Error('Portable narration manifest is malformed.')
  if (value.version !== MANIFEST_VERSION) throw new Error('Portable narration manifest version is unsupported.')
  assertIdentifier(value.presentationId, 'Portable narration presentationId')
  if (value.presentationId !== presentationId) {
    throw new Error('Portable narration manifest belongs to a different presentation.')
  }
  if (!Array.isArray(value.takes)) throw new Error('Portable narration manifest takes must be an array.')
  const takes = value.takes.map((take) => validateTakeMetadata(take, {
    path: isObject(take) ? take.audioPath : undefined,
  }))
  const ids = new Set<string>()
  const audioPaths = new Set<string>()
  const selectedSections = new Set<string>()
  for (const take of takes) {
    if (ids.has(take.id)) throw new Error(`Portable narration manifest contains duplicate take id ${take.id}.`)
    ids.add(take.id)
    if (audioPaths.has(take.audioPath)) {
      throw new Error(`Portable narration manifest contains duplicate audio path ${take.audioPath}.`)
    }
    audioPaths.add(take.audioPath)
    if (take.selected) {
      if (selectedSections.has(take.sectionId)) {
        throw new Error(`Portable narration manifest selects multiple takes for section ${take.sectionId}.`)
      }
      selectedSections.add(take.sectionId)
    }
  }
  return { version: MANIFEST_VERSION, presentationId, takes }
}

function emptyManifest(presentationId: string): PortableNarrationManifest {
  assertIdentifier(presentationId, 'Presentation id')
  return { version: MANIFEST_VERSION, presentationId, takes: [] }
}

function pathIsWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function durableWrite(filePath: string, bytes: Uint8Array) {
  const handle = await open(filePath, 'wx', 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function syncDirectory(directory: string) {
  const handle = await open(directory, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function atomicWriteManifest(root: string, manifest: PortableNarrationManifest) {
  const manifestPath = path.join(root, MANIFEST_FILE_NAME)
  const temporaryPath = path.join(root, `.manifest-${process.pid}-${randomUUID()}.tmp`)
  let temporaryCreated = false
  try {
    const handle = await open(temporaryPath, 'wx', 0o600)
    temporaryCreated = true
    try {
      await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, manifestPath)
    temporaryCreated = false
    await syncDirectory(root)
  } finally {
    if (temporaryCreated) await unlink(temporaryPath).catch(() => undefined)
  }
}

async function atomicWriteMigrationMarker(root: string, marker: PortableNarrationMigrationMarker) {
  const markerPath = path.join(root, MIGRATION_MARKER_FILE_NAME)
  const temporaryPath = path.join(root, `.migration-${process.pid}-${randomUUID()}.tmp`)
  let temporaryCreated = false
  try {
    const handle = await open(temporaryPath, 'wx', 0o600)
    temporaryCreated = true
    try {
      await handle.writeFile(`${JSON.stringify(marker, null, 2)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, markerPath)
    temporaryCreated = false
    await syncDirectory(root)
  } finally {
    if (temporaryCreated) await unlink(temporaryPath).catch(() => undefined)
  }
}

async function ensureTakesRoot(narrationRoot: string) {
  const takesRoot = path.join(narrationRoot, TAKES_DIRECTORY)
  try {
    await mkdir(takesRoot)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const info = await lstat(takesRoot)
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error('The Project narration takes path must be a regular directory.')
  }
  const realTakesRoot = await realpath(takesRoot)
  if (!pathIsWithin(narrationRoot, realTakesRoot)) {
    throw new Error('The Project narration takes path escapes the narration directory.')
  }
  return realTakesRoot
}

async function hasNarrationData(narrationRoot: string) {
  const entries = await readdir(narrationRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === MIGRATION_MARKER_FILE_NAME || entry.name === '.DS_Store'
      || /^\.migration-.+\.tmp$/.test(entry.name)) continue
    if (entry.name !== TAKES_DIRECTORY) return true
    if (!entry.isDirectory() || entry.isSymbolicLink()) return true
    if ((await readdir(path.join(narrationRoot, TAKES_DIRECTORY))).some((name) => name !== '.DS_Store')) return true
  }
  return false
}

function arrayBuffer(bytes: Buffer) {
  return Uint8Array.from(bytes).buffer
}

export class PortableNarrationStore {
  private readonly mutationQueues = new Map<string, Promise<void>>()
  private readonly writeAudio: (filePath: string, bytes: Uint8Array) => Promise<void>

  constructor(private readonly projects: ProjectStore, options: PortableNarrationStoreOptions = {}) {
    this.writeAudio = options.writeAudio ?? durableWrite
  }

  async status(projectId: string, presentationId: string): Promise<{ exists: boolean }> {
    assertIdentifier(presentationId, 'Presentation id')
    const root = await this.projects.resolveActiveNarrationRoot(projectId)
    if (!root) return { exists: false }
    const manifest = await this.readManifest(root, presentationId)
    if (manifest) return { exists: true }
    const marker = await this.readMigrationMarker(root)
    // A matching marker proves these orphaned files came from our own interrupted
    // migration, so the renderer may safely retry using the same IndexedDB source.
    if (marker?.presentationId === presentationId) return { exists: false }
    if (marker) return { exists: true }
    return { exists: await hasNarrationData(root) }
  }

  async list(projectId: string, presentationId: string, sectionId: string): Promise<DesktopNarrationTakeData[]> {
    assertIdentifier(sectionId, 'Section id')
    const root = await this.projects.resolveActiveNarrationRoot(projectId)
    if (!root) return []
    const manifest = await this.readManifest(root, presentationId)
    if (!manifest) return []
    const takes = manifest.takes.filter((take) => take.sectionId === sectionId)
    return Promise.all(takes
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((take) => this.hydrate(root, presentationId, take)))
  }

  async get(projectId: string, presentationId: string, takeId: string): Promise<DesktopNarrationTakeData | undefined> {
    assertIdentifier(takeId, 'Take id')
    const root = await this.projects.resolveActiveNarrationRoot(projectId)
    if (!root) return undefined
    const manifest = await this.readManifest(root, presentationId)
    const take = manifest?.takes.find((candidate) => candidate.id === takeId)
    return take ? this.hydrate(root, presentationId, take) : undefined
  }

  store(projectId: string, take: DesktopNarrationTakeWrite): Promise<void> {
    return this.serialize(projectId, async () => {
      const presentationId = this.validateWrite(take)
      const root = await this.requireRoot(projectId)
      const manifest = await this.readManifest(root, presentationId) ?? emptyManifest(presentationId)
      const metadata = validateTakeMetadata(take, { generate: true })
      const takesRoot = await ensureTakesRoot(root)
      const audioFile = path.join(root, metadata.audioPath)
      if (!pathIsWithin(takesRoot, audioFile)) throw new Error('Narration audio path escapes the takes directory.')
      await this.writeAudio(audioFile, new Uint8Array(take.bytes))

      const previous = manifest.takes.find((candidate) => candidate.id === metadata.id)
      const remaining = manifest.takes.filter((candidate) => candidate.id !== metadata.id)
      if (metadata.selected) {
        for (const candidate of remaining) {
          if (candidate.sectionId === metadata.sectionId) candidate.selected = false
        }
      }
      await atomicWriteManifest(root, { ...manifest, takes: [...remaining, metadata] })
      if (previous && previous.audioPath !== metadata.audioPath) await this.removeManagedAudio(root, previous.audioPath)
    })
  }

  delete(projectId: string, presentationId: string, takeId: string): Promise<void> {
    assertIdentifier(takeId, 'Take id')
    return this.serialize(projectId, async () => {
      const root = await this.requireRoot(projectId)
      const manifest = await this.readManifest(root, presentationId) ?? emptyManifest(presentationId)
      const removed = manifest.takes.find((take) => take.id === takeId)
      if (!removed) return
      await atomicWriteManifest(root, { ...manifest, takes: manifest.takes.filter((take) => take.id !== takeId) })
      await this.removeManagedAudio(root, removed.audioPath)
    })
  }

  select(projectId: string, presentationId: string, sectionId: string, takeId: string | null): Promise<void> {
    assertIdentifier(sectionId, 'Section id')
    if (takeId !== null) assertIdentifier(takeId, 'Take id')
    return this.serialize(projectId, async () => {
      const root = await this.requireRoot(projectId)
      const manifest = await this.readManifest(root, presentationId) ?? emptyManifest(presentationId)
      const selectedTake = takeId === null
        ? undefined
        : manifest.takes.find((take) => take.id === takeId && take.sectionId === sectionId)
      if (takeId !== null && !selectedTake) {
        throw new Error('The selected narration take no longer exists in this section.')
      }
      if (selectedTake?.invalidated) throw new Error('An invalidated narration take cannot be selected.')
      if (selectedTake) {
        const hydrated = await this.hydrate(root, presentationId, selectedTake)
        if (hydrated.bytes === null) throw new Error(hydrated.storageError ?? 'The narration audio is unavailable.')
      }
      await atomicWriteManifest(root, {
        ...manifest,
        takes: manifest.takes.map((take) => take.sectionId === sectionId
          ? { ...take, selected: take.id === takeId }
          : take),
      })
    })
  }

  invalidate(projectId: string, presentationId: string, sectionId: string): Promise<void> {
    assertIdentifier(sectionId, 'Section id')
    return this.updateManifest(projectId, presentationId, (manifest) => ({
      ...manifest,
      takes: manifest.takes.map((take) => take.sectionId === sectionId
        ? { ...take, invalidated: true }
        : take),
    }))
  }

  setCaptions(
    projectId: string,
    presentationId: string,
    takeId: string,
    track: NarrationCaptionTrack | null,
  ): Promise<void> {
    assertIdentifier(takeId, 'Take id')
    return this.serialize(projectId, async () => {
      const root = await this.requireRoot(projectId)
      const manifest = await this.readManifest(root, presentationId) ?? emptyManifest(presentationId)
      const target = manifest.takes.find((take) => take.id === takeId)
      if (!target) throw new Error('The narration take no longer exists.')
      const captions = track === null ? undefined : validateCaptionTrack(track, target.durationMs)
      await atomicWriteManifest(root, {
        ...manifest,
        takes: manifest.takes.map((take) => {
          if (take.id !== takeId) return take
          const { captions: _previous, ...metadata } = take
          return captions === undefined ? metadata : { ...metadata, captions }
        }),
      })
    })
  }

  deleteSection(projectId: string, presentationId: string, sectionId: string): Promise<void> {
    assertIdentifier(sectionId, 'Section id')
    return this.removeMatching(projectId, presentationId, (take) => take.sectionId === sectionId)
  }

  deletePresentation(projectId: string, presentationId: string): Promise<void> {
    return this.removeMatching(projectId, presentationId, () => true)
  }

  migrate(projectId: string, presentationId: string, takes: DesktopNarrationTakeWrite[]): Promise<void> {
    if (!Array.isArray(takes)) return Promise.reject(new Error('Legacy narration takes must be an array.'))
    return this.serialize(projectId, async () => {
      assertIdentifier(presentationId, 'Presentation id')
      const root = await this.requireRoot(projectId)
      // An existing valid manifest is the authority, even when it has no takes.
      if (await this.readManifest(root, presentationId)) return
      const marker = await this.readMigrationMarker(root)
      // A marker for another presentation, or unmarked portable data, cannot be
      // merged with IndexedDB automatically. A matching marker is our retry token.
      if (marker && marker.presentationId !== presentationId) return
      if (!marker && await hasNarrationData(root)) return

      const ids = new Set<string>()
      const selectedSections = new Set<string>()
      const writes = takes.map((take) => {
        const takePresentationId = this.validateWrite(take)
        if (takePresentationId !== presentationId) throw new Error('Legacy narration take belongs to a different presentation.')
        const metadata = validateTakeMetadata(take, { generate: true })
        if (ids.has(metadata.id)) throw new Error(`Legacy narration contains duplicate take id ${metadata.id}.`)
        ids.add(metadata.id)
        if (metadata.selected) {
          if (selectedSections.has(metadata.sectionId)) {
            throw new Error(`Legacy narration selects multiple takes for section ${metadata.sectionId}.`)
          }
          selectedSections.add(metadata.sectionId)
        }
        return { take, metadata }
      })

      if (!marker) await atomicWriteMigrationMarker(root, { version: 1, presentationId })
      const takesRoot = await ensureTakesRoot(root)
      for (const { take, metadata } of writes) {
        const audioFile = path.join(root, metadata.audioPath)
        if (!pathIsWithin(takesRoot, audioFile)) throw new Error('Narration audio path escapes the takes directory.')
        await this.writeAudio(audioFile, new Uint8Array(take.bytes))
      }
      await atomicWriteManifest(root, {
        version: MANIFEST_VERSION,
        presentationId,
        takes: writes.map(({ metadata }) => metadata),
      })
      await this.removeMigrationMarker(root).catch(() => undefined)
    })
  }

  private validateWrite(take: DesktopNarrationTakeWrite) {
    if (!isObject(take)) throw new Error('Narration take is malformed.')
    assertIdentifier(take.presentationId, 'Narration take presentationId')
    if (!(take.bytes instanceof ArrayBuffer)) throw new Error('Narration take audio bytes are invalid.')
    return take.presentationId
  }

  private async requireRoot(projectId: string) {
    const root = await this.projects.resolveActiveNarrationRoot(projectId, true)
    if (!root) throw new Error('The Project narration directory is unavailable.')
    return root
  }

  private async readManifest(root: string, presentationId: string) {
    assertIdentifier(presentationId, 'Presentation id')
    const manifestPath = path.join(root, MANIFEST_FILE_NAME)
    let info
    try {
      info = await lstat(manifestPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('Portable narration manifest must be a regular file.')
    const realManifestPath = await realpath(manifestPath)
    if (!pathIsWithin(root, realManifestPath)) throw new Error('Portable narration manifest escapes the narration directory.')
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(realManifestPath, 'utf8'))
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'invalid JSON'
      throw new Error(`Could not parse portable narration manifest: ${detail}`)
    }
    return validateManifest(parsed, presentationId)
  }

  private async readMigrationMarker(root: string): Promise<PortableNarrationMigrationMarker | null> {
    const markerPath = path.join(root, MIGRATION_MARKER_FILE_NAME)
    let info
    try {
      info = await lstat(markerPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('Portable narration migration marker is invalid.')
    const realMarkerPath = await realpath(markerPath)
    if (!pathIsWithin(root, realMarkerPath)) throw new Error('Portable narration migration marker escapes the narration directory.')
    let value: unknown
    try {
      value = JSON.parse(await readFile(realMarkerPath, 'utf8'))
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'invalid JSON'
      throw new Error(`Could not parse portable narration migration marker: ${detail}`)
    }
    if (!isObject(value) || value.version !== 1) throw new Error('Portable narration migration marker is malformed.')
    assertIdentifier(value.presentationId, 'Portable narration migration presentationId')
    return { version: 1, presentationId: value.presentationId }
  }

  private async removeMigrationMarker(root: string) {
    const markerPath = path.join(root, MIGRATION_MARKER_FILE_NAME)
    let info
    try {
      info = await lstat(markerPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    if (info.isSymbolicLink() || !info.isFile()) return
    const realMarkerPath = await realpath(markerPath)
    if (!pathIsWithin(root, realMarkerPath)) return
    await unlink(markerPath)
    await syncDirectory(root)
  }

  private async hydrate(
    root: string,
    presentationId: string,
    take: PortableNarrationManifestTake,
  ): Promise<DesktopNarrationTakeData> {
    const metadata = {
      id: take.id,
      presentationId,
      sectionId: take.sectionId,
      createdAt: take.createdAt,
      durationMs: take.durationMs,
      mimeType: take.mimeType,
      cues: take.cues,
      ...(take.pointerTrack === undefined ? {} : { pointerTrack: take.pointerTrack }),
      ...(take.captions === undefined ? {} : { captions: take.captions }),
      selected: take.selected,
      ...(take.invalidated === undefined ? {} : { invalidated: take.invalidated }),
    }
    try {
      const relativePath = validateNarrationAudioPath(take.audioPath, take.mimeType)
      const audioFile = path.resolve(root, relativePath)
      if (!pathIsWithin(root, audioFile)) throw new Error('Audio path escapes the narration directory.')
      const info = await lstat(audioFile)
      if (info.isSymbolicLink() || !info.isFile()) throw new Error('Audio path is not a regular file.')
      if (info.nlink > 1) throw new Error('Audio file has multiple hard links.')
      const realAudioFile = await realpath(audioFile)
      const realInfo = await stat(realAudioFile)
      if (!pathIsWithin(root, realAudioFile) || !realInfo.isFile()) {
        throw new Error('Audio path escapes the narration directory.')
      }
      if (realInfo.nlink > 1) throw new Error('Audio file has multiple hard links.')
      if (realInfo.size === 0) throw new Error('Audio file is empty.')
      return { ...metadata, bytes: arrayBuffer(await readFile(realAudioFile)) }
    } catch (error) {
      const detail = (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'The recorded audio file is missing.'
        : `The recorded audio file is unavailable: ${error instanceof Error ? error.message : 'read failed'}`
      return { ...metadata, bytes: null, storageError: detail }
    }
  }

  private updateManifest(
    projectId: string,
    presentationId: string,
    update: (manifest: PortableNarrationManifest) => PortableNarrationManifest,
  ) {
    return this.serialize(projectId, async () => {
      const root = await this.requireRoot(projectId)
      const manifest = await this.readManifest(root, presentationId) ?? emptyManifest(presentationId)
      await atomicWriteManifest(root, update(manifest))
    })
  }

  private removeMatching(
    projectId: string,
    presentationId: string,
    matches: (take: PortableNarrationManifestTake) => boolean,
  ) {
    return this.serialize(projectId, async () => {
      const root = await this.requireRoot(projectId)
      const manifest = await this.readManifest(root, presentationId) ?? emptyManifest(presentationId)
      const removed = manifest.takes.filter(matches)
      await atomicWriteManifest(root, { ...manifest, takes: manifest.takes.filter((take) => !matches(take)) })
      await Promise.all(removed.map((take) => this.removeManagedAudio(root, take.audioPath)))
    })
  }

  private async removeManagedAudio(root: string, audioPath: string) {
    const relativePath = validateNarrationAudioPath(audioPath)
    const audioFile = path.resolve(root, relativePath)
    const takesRoot = await ensureTakesRoot(root)
    if (!pathIsWithin(takesRoot, audioFile)) {
      throw new Error('Narration audio path escapes the takes directory.')
    }
    let info
    try {
      info = await lstat(audioFile)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    // A managed audio path replaced by a link is no longer ours to clean up.
    if (info.isSymbolicLink() || !info.isFile()) return
    const realAudioFile = await realpath(audioFile)
    if (!pathIsWithin(takesRoot, realAudioFile)) return
    await unlink(audioFile).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    })
  }

  private serialize<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueues.get(projectId) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(operation)
    const tail = current.then(() => undefined, () => undefined)
    this.mutationQueues.set(projectId, tail)
    void tail.finally(() => {
      if (this.mutationQueues.get(projectId) === tail) this.mutationQueues.delete(projectId)
    })
    return current
  }
}
