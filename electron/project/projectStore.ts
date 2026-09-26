import { createHash, randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { watch } from 'node:fs'
import { request } from 'node:https'
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { isIP, type LookupFunction } from 'node:net'
import type {
  Presentation,
  PresentationImageAsset,
  PresentationImageMimeType,
} from '../../src/model'
import { validatePresentation } from '../../src/presentationValidation'
import type {
  DesktopImportedAsset,
  DesktopMissingAsset,
  DesktopProjectExternalChange,
  DesktopProjectSaveResult,
  DesktopProjectSnapshot,
} from '../../src/desktop/desktopTypes'

export const PROJECT_FILE_NAME = 'presentation.json'
export const PROJECT_ASSETS_DIRECTORY = 'assets'
export const PROJECT_INSTRUCTIONS_FILE_NAME = 'AGENTS.md'
export const PROJECT_ASSET_PROTOCOL = 'ves-asset'

export const PROJECT_AGENTS_MD = `# AI Presentation Studio Project

\`presentation.json\` is the source of truth. Its Slides are the presentation timeline; each Slide contains ordinary Text, Image, Chart, Shape, or Arrow Elements. Element frames use a fixed 1080×1920 coordinate system. \`assets/\` holds visual files registered in \`imageAssets\` with safe Project-relative paths. Inspect both the JSON and existing assets before editing.

## Authoring workflow

1. Understand the requested story, audience, tone, and length. Outline one main communication idea per Slide before composing elements.
2. Give each Slide a clear focal point. Prefer a short headline, labels, and strong visuals to visible paragraphs. Put explanation, sources, and delivery cues in \`notes\`.
3. Choose layouts for the idea: a statement, image, comparison, explanation, chart, or visual joke. Vary scale and composition intentionally; leave useful whitespace. Important content is usually within x ≈ 80–1000 and y ≈ 120–1720, but deliberate crops and asymmetry are welcome.
4. Use charts only when numeric relationships matter. Never invent factual values for appearance; label illustrative data. Use \`contain\` for illustrations and \`cover\` for photos. Reuse existing assets before adding new files under \`assets/\`.
5. Use \`sharedElementId\` only when the viewer should perceive the same concept moving or changing across Slides. For continuing charts, preserve \`chartId\` and datum IDs as well. Slides, not timestamps, define motion.
6. Preserve \`presentation.id\`, surviving Slide and element IDs, narration section IDs, asset IDs, chart identities, and shared identities when revising an existing Project. Create readable unique IDs for genuinely new objects. The app manages narration recordings separately.
7. Write related \`presentation.json\` and \`assets/\` changes close together, then run \`npm run validate-project -- /path/to/this/project\` from the AI Presentation Studio repository. Fix errors and review actionable warnings, then check the story, readability, visual variety, and factual accuracy.

AI Presentation Studio watches the open Project and applies stable, valid external changes automatically. Keep \`presentation.json\` valid JSON. Do not use remote image URLs or add a separate layout type.
`

const IMAGE_EXTENSIONS: Record<PresentationImageMimeType, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

const EXTENSION_MIME_TYPES = new Map<string, PresentationImageMimeType>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
])

const MAX_IMAGE_BYTES = 100 * 1024 * 1024
const MAX_REMOTE_REDIRECTS = 5

interface ActiveProject {
  id: string
  rootPath: string
  realRootPath: string
  contentHash: string
  savingHash: string | null
  dirty: boolean
  rootDevice: number
  rootInode: number
  assetFingerprints: Map<string, string>
  internalAssetWrites: Map<string, string>
  assetRevision: string
  lastPresentationHintHash: string | null
  issueKind: 'invalid' | 'unavailable' | null
}

interface ProjectWatcher {
  close(): void
}

interface ProjectStoreOptions {
  debounceMs?: number
  stabilizationMs?: number
  retryDelayMs?: number
  maximumReadAttempts?: number
  watchFactory?: (
    directory: string,
    listener: (eventType: string, filename: string | Buffer | null) => void,
  ) => ProjectWatcher
}

function hash(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalJson(presentation: Presentation) {
  return `${JSON.stringify(presentation, null, 2)}\n`
}

function pathIsWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export function validateAssetRelativePath(value: unknown) {
  if (typeof value !== 'string' || value.includes('\\') || value.includes('\0') || path.isAbsolute(value)) {
    throw new Error('Asset path must be a safe project-relative path under assets/.')
  }
  const normalized = path.posix.normalize(value)
  const parts = value.split('/')
  if (normalized !== value || !value.startsWith('assets/') || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Asset path must be a safe project-relative path under assets/.')
  }
  return value
}

function sanitizeStem(value: string, fallback: string) {
  return path.basename(value, path.extname(value))
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback
}

function assertMimeType(value: unknown): asserts value is PresentationImageMimeType {
  if (value !== 'image/png' && value !== 'image/jpeg' && value !== 'image/webp' && value !== 'image/svg+xml') {
    throw new Error('Only PNG, JPEG, WebP, and SVG images are supported.')
  }
}

function addressIsPrivate(value: string) {
  const address = value.toLowerCase().split('%')[0]
  if (address.includes(':')) {
    if (address === '::' || address === '::1' || address.startsWith('fc') || address.startsWith('fd')) return true
    if (/^fe[89ab]/.test(address)) return true
    if (address.startsWith('::ffff:')) return addressIsPrivate(address.slice(7))
    return false
  }
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true
  const [first, second, third] = octets
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 192 && second === 0 && (third === 0 || third === 2))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113)
  }

async function validatedRemoteUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('The copied image does not contain a valid URL.')
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Copied web images must use a public HTTPS URL.')
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
    throw new Error('Local network image URLs are not allowed.')
  }
  const literalKind = isIP(url.hostname)
  const addresses = literalKind
    ? [{ address: url.hostname, family: literalKind }]
    : await lookup(url.hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some(({ address }) => addressIsPrivate(address))) {
    throw new Error('Local or private network image URLs are not allowed.')
  }
  return { url, resolvedAddress: addresses[0] }
}

async function readRemoteImage(urlValue: string) {
  let target = await validatedRemoteUrl(urlValue)
  for (let redirectCount = 0; redirectCount <= MAX_REMOTE_REDIRECTS; redirectCount += 1) {
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      const result = target.resolvedAddress
      if (options.all) callback(null, [result])
      else callback(null, result.address, result.family)
    }
    const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
      const outgoing = request(target.url, {
        method: 'GET',
        lookup: pinnedLookup,
        servername: target.url.hostname,
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: 'image/png,image/jpeg,image/webp,image/svg+xml' },
      }, resolve)
      outgoing.setTimeout(20_000, () => outgoing.destroy(new Error('The copied image download timed out.')))
      outgoing.on('error', reject)
      outgoing.end()
    })
    const status = response.statusCode ?? 0
    if (status >= 300 && status < 400) {
      const location = response.headers.location
      response.resume()
      if (!location || redirectCount === MAX_REMOTE_REDIRECTS) throw new Error('The copied image redirected too many times.')
      target = await validatedRemoteUrl(new URL(location, target.url).toString())
      continue
    }
    if (status < 200 || status >= 300) {
      response.resume()
      throw new Error(`The copied image could not be downloaded (HTTP ${status}).`)
    }
    const declaredLength = Number(response.headers['content-length'] ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      response.destroy()
      throw new Error('The copied image is larger than 100 MB.')
    }
    const contentType = response.headers['content-type']?.split(';')[0].trim().toLowerCase()
    const mimeType = contentType === 'image/jpg' ? 'image/jpeg' : contentType
    try {
      assertMimeType(mimeType)
    } catch (error) {
      response.destroy()
      throw error
    }
    const chunks: Buffer[] = []
    let byteLength = 0
    for await (const value of response) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
      byteLength += chunk.byteLength
      if (byteLength > MAX_IMAGE_BYTES) {
        response.destroy()
        throw new Error('The copied image is larger than 100 MB.')
      }
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks, byteLength)
    verifyImageBytes(bytes, mimeType)
    return { bytes, mimeType, finalUrl: target.url }
  }
  throw new Error('The copied image could not be downloaded.')
}

function verifyImageBytes(bytes: Buffer, mimeType: PresentationImageMimeType) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image data must be between 1 byte and ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`)
  }
  const valid = mimeType === 'image/png'
    ? bytes.byteLength >= 45
      && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      && bytes.toString('ascii', 12, 16) === 'IHDR'
      && bytes.readUInt32BE(16) > 0
      && bytes.readUInt32BE(20) > 0
      && bytes.indexOf(Buffer.from('IDAT')) >= 0
      && bytes.indexOf(Buffer.from('IEND')) >= 0
    : mimeType === 'image/jpeg'
      ? bytes.byteLength >= 16
        && bytes[0] === 0xff && bytes[1] === 0xd8
        && bytes[bytes.byteLength - 2] === 0xff && bytes[bytes.byteLength - 1] === 0xd9
        && bytes.some((value, index) => value === 0xff && index + 1 < bytes.length
          && ((bytes[index + 1] >= 0xc0 && bytes[index + 1] <= 0xc3)
            || (bytes[index + 1] >= 0xc5 && bytes[index + 1] <= 0xc7)
            || (bytes[index + 1] >= 0xc9 && bytes[index + 1] <= 0xcb)
            || (bytes[index + 1] >= 0xcd && bytes[index + 1] <= 0xcf)))
      : mimeType === 'image/webp'
        ? bytes.byteLength >= 20
          && bytes.toString('ascii', 0, 4) === 'RIFF'
          && bytes.toString('ascii', 8, 12) === 'WEBP'
          && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))
          && bytes.readUInt32LE(4) + 8 <= bytes.byteLength
        : (() => {
            const start = bytes.toString('utf8', 0, Math.min(bytes.byteLength, 1_000_000))
            const end = bytes.toString('utf8', Math.max(0, bytes.byteLength - 4_096))
            return /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(start)
              && (/<\/svg>\s*$/i.test(end) || /<svg[^>]*\/\s*>\s*$/is.test(start))
          })()
  if (!valid) throw new Error(`The selected file does not contain valid ${mimeType} image data.`)
}

function dataUrlBytes(source: string, expectedMimeType: PresentationImageMimeType) {
  const match = /^data:([^;,]+)((?:;[^,]*)?),(.*)$/is.exec(source)
  if (!match || match[1].toLowerCase() !== expectedMimeType) throw new Error(`Invalid ${expectedMimeType} data URL.`)
  let bytes: Buffer
  try {
    bytes = /;base64/i.test(match[2])
      ? Buffer.from(match[3].replace(/\s/g, ''), 'base64')
      : Buffer.from(decodeURIComponent(match[3]), 'utf8')
  } catch {
    throw new Error(`Invalid ${expectedMimeType} data URL encoding.`)
  }
  verifyImageBytes(bytes, expectedMimeType)
  return bytes
}

async function pathExists(value: string) {
  try {
    await access(value)
    return true
  } catch {
    return false
  }
}

async function duplicateSafePath(directory: string, requestedName: string, mimeType: PresentationImageMimeType) {
  const requestedExtension = path.extname(requestedName).toLowerCase()
  const extension = EXTENSION_MIME_TYPES.get(requestedExtension) === mimeType
    ? requestedExtension
    : IMAGE_EXTENSIONS[mimeType]
  const stem = sanitizeStem(requestedName, 'image')
  for (let index = 1; index < 10_000; index += 1) {
    const fileName = index === 1 ? `${stem}${extension}` : `${stem}-${index}${extension}`
    const destination = path.join(directory, fileName)
    if (!await pathExists(destination)) return { fileName, destination }
  }
  throw new Error('Could not allocate an available asset filename.')
}

async function atomicWrite(filePath: string, contents: string) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  let temporaryCreated = false
  try {
    const handle = await open(temporaryPath, 'wx', 0o600)
    temporaryCreated = true
    try {
      await handle.writeFile(contents, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, filePath)
    temporaryCreated = false
  } finally {
    if (temporaryCreated) await unlink(temporaryPath).catch(() => undefined)
  }
}

function canonicalizePresentation(value: unknown) {
  const validated = validatePresentation(value)
  const imageAssets = validated.imageAssets?.map(({ source: _source, ...asset }, index) => {
    if (!asset.path) throw new Error(`presentation.imageAssets[${index}].path is required for a desktop Project.`)
    validateAssetRelativePath(asset.path)
    const pathMimeType = EXTENSION_MIME_TYPES.get(path.extname(asset.path).toLowerCase())
    if (pathMimeType !== asset.mimeType) {
      throw new Error(`presentation.imageAssets[${index}].path extension does not match ${asset.mimeType}.`)
    }
    if (EXTENSION_MIME_TYPES.get(path.posix.extname(asset.path).toLowerCase()) !== asset.mimeType) {
      throw new Error(`presentation.imageAssets[${index}].path extension does not match ${asset.mimeType}.`)
    }
    return asset
  })
  return validatePresentation({
    ...validated,
    ...(imageAssets ? { imageAssets } : {}),
  })
}

function assetUrl(projectId: string, relativePath: string, revision?: string) {
  validateAssetRelativePath(relativePath)
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/')
  const version = revision ? `?v=${encodeURIComponent(revision)}` : ''
  return `${PROJECT_ASSET_PROTOCOL}://project/${encodeURIComponent(projectId)}/${encodedPath}${version}`
}

function withRuntimeAssetSources(
  presentation: Presentation,
  projectId: string,
  missingAssetIds: ReadonlySet<string>,
  fingerprints: ReadonlyMap<string, string>,
): Presentation {
  return {
    ...presentation,
    imageAssets: presentation.imageAssets?.map((asset) => ({
      ...asset,
      ...(missingAssetIds.has(asset.id) ? {} : {
        source: assetUrl(projectId, asset.path!, fingerprints.get(asset.path!) ?? 'untracked'),
      }),
    })),
  }
}

function assetRevision(fingerprints: ReadonlyMap<string, string>) {
  return hash([...fingerprints.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relativePath, fingerprint]) => `${relativePath}\0${fingerprint}`)
    .join('\0'))
}

async function scanAssetTree(rootPath: string) {
  const fingerprints = new Map<string, string>()
  const directories: string[] = []
  const assetsPath = path.join(rootPath, PROJECT_ASSETS_DIRECTORY)
  let assetsInfo
  try {
    assetsInfo = await lstat(assetsPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { fingerprints, directories }
    }
    throw error
  }
  if (assetsInfo.isSymbolicLink() || !assetsInfo.isDirectory()) {
    return { fingerprints, directories }
  }

  const visit = async (directory: string) => {
    directories.push(directory)
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/')
      let info
      try {
        info = await lstat(absolutePath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      if (info.isSymbolicLink()) {
        fingerprints.set(relativePath, 'symlink')
      } else if (info.isDirectory()) {
        await visit(absolutePath)
      } else if (info.isFile()) {
        fingerprints.set(relativePath, hash(await readFile(absolutePath)))
      }
    }
  }
  await visit(assetsPath)
  return { fingerprints, directories }
}

function changedAssetPaths(previous: ReadonlyMap<string, string>, next: ReadonlyMap<string, string>) {
  return [...new Set([...previous.keys(), ...next.keys()])]
    .filter((relativePath) => previous.get(relativePath) !== next.get(relativePath))
    .sort()
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

async function missingAssets(rootPath: string, presentation: Presentation): Promise<DesktopMissingAsset[]> {
  const referencedBy = new Map<string, Array<{ id: string; label: string }>>()
  for (const [slideIndex, slide] of presentation.slides.entries()) {
    for (const element of slide.elements) {
      if (element.type !== 'image') continue
      const slides = referencedBy.get(element.assetId) ?? []
      if (!slides.some(({ id }) => id === slide.id)) slides.push({
        id: slide.id,
        label: `Slide ${slideIndex + 1}${slide.title ? ` ("${slide.title}")` : ''}`,
      })
      referencedBy.set(element.assetId, slides)
    }
  }
  const missing: DesktopMissingAsset[] = []
  for (const asset of presentation.imageAssets ?? []) {
    const slides = referencedBy.get(asset.id)
    if (!slides?.length || !asset.path) continue
    const slideIds = slides.map(({ id }) => id)
    const absolutePath = path.resolve(rootPath, validateAssetRelativePath(asset.path))
    let readable = pathIsWithin(rootPath, absolutePath)
    if (readable) {
      try {
        const realAssetPath = await realpath(absolutePath)
        const info = await stat(realAssetPath)
        readable = pathIsWithin(rootPath, realAssetPath) && info.isFile()
        if (readable) verifyImageBytes(await readFile(realAssetPath), asset.mimeType)
      } catch {
        readable = false
      }
    }
    if (!readable) {
      missing.push({
        assetId: asset.id,
        path: asset.path,
        slideIds,
        message: `${slides.map(({ label }) => label).join(', ')} reference${slides.length === 1 ? 's' : ''} missing asset: ${asset.path}`,
      })
    }
  }
  return missing
}

async function readProjectFile(rootPath: string) {
  const presentationPath = path.join(rootPath, PROJECT_FILE_NAME)
  let source: string
  try {
    const realPresentationPath = await realpath(presentationPath)
    if (!pathIsWithin(rootPath, realPresentationPath) || !(await stat(realPresentationPath)).isFile()) {
      throw new Error(`${PROJECT_FILE_NAME} must be a regular file inside the Project root.`)
    }
    source = await readFile(realPresentationPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`The selected folder does not contain ${PROJECT_FILE_NAME}.`)
    }
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON'
    throw new Error(`Could not parse ${PROJECT_FILE_NAME}: ${detail}`)
  }
  return { source, presentation: canonicalizePresentation(parsed) }
}

export class ProjectStore {
  private active: ActiveProject | null = null
  private readonly listeners = new Set<(change: DesktopProjectExternalChange) => void>()
  private readonly exportAssets = new Map<string, Map<string, { bytes: Buffer; mimeType: PresentationImageMimeType }>>()
  private readonly watchers = new Set<ProjectWatcher>()
  private watchedAssetDirectories: string[] = []
  private watchGeneration = 0
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private watchRecoveryTimer: ReturnType<typeof setInterval> | null = null
  private watcherFault = false
  private readonly debounceMs: number
  private readonly stabilizationMs: number
  private readonly retryDelayMs: number
  private readonly maximumReadAttempts: number
  private readonly watchFactory: ProjectStoreOptions['watchFactory']

  constructor(options: ProjectStoreOptions = {}) {
    this.debounceMs = options.debounceMs ?? 120
    this.stabilizationMs = options.stabilizationMs ?? 60
    this.retryDelayMs = options.retryDelayMs ?? 120
    this.maximumReadAttempts = options.maximumReadAttempts ?? 6
    this.watchFactory = options.watchFactory ?? ((directory, listener) => {
      const watcher = watch(directory, { persistent: false }, listener)
      watcher.on('error', () => listener('error', null))
      return watcher
    })
  }

  get activeProjectId() {
    return this.active?.id ?? null
  }

  get activeIsDirty() {
    return this.active?.dirty ?? false
  }

  onExternalChange(listener: (change: DesktopProjectExternalChange) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close() {
    this.stopWatching()
  }

  async createAt(rootPath: string, value: unknown) {
    const resolvedRoot = path.resolve(rootPath)
    const presentationPath = path.join(resolvedRoot, PROJECT_FILE_NAME)
    if (await pathExists(presentationPath)) throw new Error(`${presentationPath} already exists.`)
    await mkdir(resolvedRoot, { recursive: true })
    const realRootPath = await realpath(resolvedRoot)
    const assetsPath = path.join(realRootPath, PROJECT_ASSETS_DIRECTORY)
    await mkdir(assetsPath, { recursive: true })
    await this.assertRealPathWithin(realRootPath, assetsPath)
    const presentation = await this.materializeAssets(value, assetsPath, this.active?.realRootPath)
    const serialized = canonicalJson(presentation)
    await atomicWrite(path.join(realRootPath, PROJECT_FILE_NAME), serialized)
    const instructionsPath = path.join(realRootPath, PROJECT_INSTRUCTIONS_FILE_NAME)
    if (!await pathExists(instructionsPath)) await writeFile(instructionsPath, PROJECT_AGENTS_MD, { encoding: 'utf8', flag: 'wx' })
    return this.activate(realRootPath, presentation, hash(serialized))
  }

  async openAt(rootPath: string) {
    const resolvedRoot = path.resolve(rootPath)
    const realRootPath = await realpath(resolvedRoot)
    const info = await stat(realRootPath)
    if (!info.isDirectory()) throw new Error('A Project must be opened from a folder.')
    const { source, presentation } = await readProjectFile(realRootPath)
    return this.activate(realRootPath, presentation, hash(source))
  }

  async reload(projectId: string) {
    const active = this.assertActive(projectId)
    const acceptedHash = active.contentHash
    const startedDirty = active.dirty
    const guardReload = async () => {
      if (this.active !== active || active.contentHash !== acceptedHash || (!startedDirty && active.dirty)) {
        throw new Error('The Project changed locally while it was being reloaded.')
      }
      await this.assertActiveRootAvailable(active)
    }
    await guardReload()
    const { source, presentation } = await readProjectFile(active.realRootPath)
    await guardReload()
    const snapshot = await this.activate(active.realRootPath, presentation, hash(source), active.id, guardReload)
    // A write completed while the old watcher was being replaced may have been
    // observed by neither watcher. Inspect once after the new watcher is live.
    this.queueInspection(snapshot.projectId, this.watchGeneration)
    return snapshot
  }

  async save(projectId: string, value: unknown, overwriteExternal = false): Promise<DesktopProjectSaveResult> {
    const active = this.assertActive(projectId)
    await this.assertActiveRootAvailable(active)
    const presentation = canonicalizePresentation(value)
    const diskHash = await this.diskHash(active.realRootPath)
    if (!overwriteExternal && diskHash !== active.contentHash) return { status: 'conflict', diskHash }
    const serialized = canonicalJson(presentation)
    const savedHash = hash(serialized)
    active.savingHash = savedHash
    try {
      await atomicWrite(path.join(active.realRootPath, PROJECT_FILE_NAME), serialized)
      active.contentHash = savedHash
    } finally {
      active.savingHash = null
    }
    active.dirty = false
    return { status: 'saved', project: await this.snapshot(active, presentation) }
  }

  setDirty(projectId: string, dirty: boolean) {
    this.assertActive(projectId).dirty = dirty
  }

  revealPath(projectId: string) {
    return this.assertActive(projectId).realRootPath
  }

  async importFile(projectId: string, sourcePath: string) {
    const active = this.assertActive(projectId)
    await this.assertActiveRootAvailable(active)
    const resolvedSource = path.resolve(sourcePath)
    const mimeType = EXTENSION_MIME_TYPES.get(path.extname(resolvedSource).toLowerCase())
    if (!mimeType) throw new Error('Only PNG, JPEG, WebP, and SVG image files can be imported.')
    const sourceInfo = await stat(resolvedSource)
    if (!sourceInfo.isFile()) throw new Error('The selected image is not a regular file.')
    if (sourceInfo.size > MAX_IMAGE_BYTES) throw new Error(`Images larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB are not supported.`)
    const bytes = await readFile(resolvedSource)
    verifyImageBytes(bytes, mimeType)
    return this.writeImportedAsset(active, bytes, mimeType, path.basename(resolvedSource))
  }

  async importBytes(
    projectId: string,
    value: ArrayBuffer | Uint8Array,
    mimeType: PresentationImageMimeType,
    suggestedName = 'pasted-image',
  ) {
    const active = this.assertActive(projectId)
    await this.assertActiveRootAvailable(active)
    assertMimeType(mimeType)
    const bytes = Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value)
    verifyImageBytes(bytes, mimeType)
    return this.writeImportedAsset(active, bytes, mimeType, suggestedName || 'pasted-image')
  }

  async importRemote(projectId: string, url: string, suggestedName = 'copied-image') {
    const active = this.assertActive(projectId)
    await this.assertActiveRootAvailable(active)
    const downloaded = await readRemoteImage(url)
    let remoteName = suggestedName
    try {
      const pathName = decodeURIComponent(path.basename(downloaded.finalUrl.pathname))
      if (pathName && pathName !== '/') remoteName = pathName
    } catch {
      // Keep the readable clipboard fallback when a URL path is malformed.
    }
    return this.writeImportedAsset(active, downloaded.bytes, downloaded.mimeType, remoteName)
  }

  async resolveProtocolAsset(projectId: string, relativePath: string) {
    const active = this.assertActive(projectId)
    validateAssetRelativePath(relativePath)
    const candidate = path.resolve(active.realRootPath, relativePath)
    if (!pathIsWithin(active.realRootPath, candidate)) throw new Error('Asset path escapes the active Project.')
    const realCandidate = await realpath(candidate)
    if (!pathIsWithin(active.realRootPath, realCandidate)) throw new Error('Asset path escapes the active Project.')
    const info = await stat(realCandidate)
    if (!info.isFile()) throw new Error('Asset path does not identify a file.')
    const mimeType = EXTENSION_MIME_TYPES.get(path.extname(realCandidate).toLowerCase())
    if (!mimeType) throw new Error('Unsupported Project asset type.')
    return { filePath: realCandidate, mimeType }
  }

  async captureExportAssets(jobId: string, value: unknown) {
    if (this.exportAssets.has(jobId)) throw new Error('This export is already running.')
    const presentation = validatePresentation(value)
    const visibleAssetIds = new Set(presentation.slides.flatMap((slide) => slide.elements
      .filter((element) => element.type === 'image' && !element.hidden)
      .map((element) => element.type === 'image' ? element.assetId : '')))
    const projectAssets = presentation.imageAssets?.filter((asset) => asset.path && visibleAssetIds.has(asset.id)) ?? []
    if (projectAssets.length === 0) return presentation
    const active = this.active
    if (!active) throw new Error('This presentation references Project assets, but no Project is active.')
    await this.assertActiveRootAvailable(active)
    const captured = new Map<string, { bytes: Buffer; mimeType: PresentationImageMimeType }>()
    for (const asset of projectAssets) {
      const resolved = await this.resolveProtocolAsset(active.id, asset.path!)
      if (resolved.mimeType !== asset.mimeType) throw new Error(`Asset ${asset.path} has an unexpected image type.`)
      const bytes = await readFile(resolved.filePath)
      try {
        verifyImageBytes(bytes, asset.mimeType)
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'invalid image data'
        throw new Error(`Asset ${asset.path} could not be decoded for export: ${detail}`)
      }
      captured.set(asset.id, { bytes, mimeType: asset.mimeType })
    }
    this.exportAssets.set(jobId, captured)
    return {
      ...presentation,
      imageAssets: presentation.imageAssets?.map((asset) => {
        const frozen = captured.get(asset.id)
        return frozen ? {
          ...asset,
          source: `${PROJECT_ASSET_PROTOCOL}://export/${encodeURIComponent(jobId)}/${encodeURIComponent(asset.id)}?v=${hash(frozen.bytes)}`,
        } : asset
      }),
    }
  }

  resolveExportAsset(jobId: string, assetId: string) {
    const asset = this.exportAssets.get(jobId)?.get(assetId)
    if (!asset) throw new Error('Export asset is unavailable.')
    return asset
  }

  releaseExportAssets(jobId: string) {
    this.exportAssets.delete(jobId)
  }

  async assertRequiredAssetsAvailable(value: unknown) {
    const presentation = validatePresentation(value)
    const visibleAssetIds = new Set(presentation.slides.flatMap((slide) => slide.elements
      .filter((element) => element.type === 'image' && !element.hidden)
      .map((element) => element.type === 'image' ? element.assetId : '')))
    const projectAssets = presentation.imageAssets?.filter((asset) => asset.path && visibleAssetIds.has(asset.id)) ?? []
    if (projectAssets.length === 0) return
    if (!this.active) throw new Error('This presentation references Project assets, but no Project is active.')
    const missing = (await missingAssets(this.active.realRootPath, presentation))
      .filter((asset) => visibleAssetIds.has(asset.assetId))
    if (missing.length > 0) throw new Error(missing.map((asset) => asset.message).join('\n'))
    for (const asset of projectAssets) {
      const resolved = await this.resolveProtocolAsset(this.active.id, asset.path!)
      const bytes = await readFile(resolved.filePath)
      try {
        verifyImageBytes(bytes, resolved.mimeType)
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'invalid image data'
        throw new Error(`Asset ${asset.path} could not be decoded for export: ${detail}`)
      }
    }
  }

  async refreshAssets(projectId: string, value: unknown) {
    const active = this.assertActive(projectId)
    await this.assertActiveRootAvailable(active)
    const presentation = canonicalizePresentation(value)
    const scanned = await scanAssetTree(active.realRootPath)
    active.assetFingerprints = scanned.fingerprints
    active.assetRevision = assetRevision(scanned.fingerprints)
    this.replaceAssetWatchers(active, scanned.directories)
    return this.snapshot(active, presentation)
  }

  private assertActive(projectId: string) {
    if (!this.active || typeof projectId !== 'string' || projectId !== this.active.id) {
      throw new Error('The Project operation does not match the currently active Project.')
    }
    return this.active
  }

  private async activate(
    rootPath: string,
    presentation: Presentation,
    contentHash: string,
    id: string = randomUUID(),
    beforeActivate?: () => Promise<void> | void,
  ) {
    const rootInfo = await lstat(rootPath)
    const scanned = await scanAssetTree(rootPath)
    await beforeActivate?.()
    const active: ActiveProject = {
      id,
      rootPath,
      realRootPath: rootPath,
      contentHash,
      savingHash: null,
      dirty: false,
      rootDevice: rootInfo.dev,
      rootInode: rootInfo.ino,
      assetFingerprints: scanned.fingerprints,
      internalAssetWrites: new Map(),
      assetRevision: assetRevision(scanned.fingerprints),
      lastPresentationHintHash: null,
      issueKind: null,
    }
    this.active = active
    this.startWatching(active, scanned.directories)
    return this.snapshot(active, presentation)
  }

  private async snapshot(active: ActiveProject, presentation: Presentation): Promise<DesktopProjectSnapshot> {
    const missing = await missingAssets(active.realRootPath, presentation)
    return {
      projectId: active.id,
      rootPath: active.rootPath,
      presentationPath: path.join(active.rootPath, PROJECT_FILE_NAME),
      assetsPath: path.join(active.rootPath, PROJECT_ASSETS_DIRECTORY),
      presentation: withRuntimeAssetSources(
        presentation,
        active.id,
        new Set(missing.map(({ assetId }) => assetId)),
        active.assetFingerprints,
      ),
      contentHash: active.contentHash,
      missingAssets: missing,
    }
  }

  private async diskHash(rootPath: string) {
    try {
      const presentationPath = await realpath(path.join(rootPath, PROJECT_FILE_NAME))
      if (!pathIsWithin(rootPath, presentationPath) || !(await stat(presentationPath)).isFile()) {
        throw new Error(`${PROJECT_FILE_NAME} must be a regular file inside the Project root.`)
      }
      return hash(await readFile(presentationPath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  private async writeImportedAsset(
    active: ActiveProject,
    bytes: Buffer,
    mimeType: PresentationImageMimeType,
    requestedName: string,
  ): Promise<DesktopImportedAsset> {
    const assetsPath = path.join(active.realRootPath, PROJECT_ASSETS_DIRECTORY)
    await mkdir(assetsPath, { recursive: true })
    await this.assertRealPathWithin(active.realRootPath, assetsPath)
    const { fileName, destination } = await duplicateSafePath(assetsPath, requestedName, mimeType)
    const relativePath = `assets/${fileName}`
    const fingerprint = hash(bytes)
    active.internalAssetWrites.set(relativePath, fingerprint)
    try {
      await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      active.internalAssetWrites.delete(relativePath)
      throw error
    }
    active.assetFingerprints.set(relativePath, fingerprint)
    active.assetRevision = assetRevision(active.assetFingerprints)
    const stem = sanitizeStem(fileName, 'image')
    return {
      id: `${stem}-${randomUUID().slice(0, 8)}`,
      name: stem.replace(/-/g, ' '),
      mimeType,
      path: relativePath,
      source: assetUrl(active.id, relativePath, fingerprint),
    }
  }

  private async materializeAssets(value: unknown, assetsPath: string, sourceRoot?: string) {
    const presentation = validatePresentation(value)
    const imageAssets: PresentationImageAsset[] = []
    for (const [index, asset] of (presentation.imageAssets ?? []).entries()) {
      assertMimeType(asset.mimeType)
      let bytes: Buffer
      let requestedName = asset.name || 'image'
      if (asset.source?.startsWith('data:')) {
        bytes = dataUrlBytes(asset.source, asset.mimeType)
      } else if (asset.path && sourceRoot) {
        const relativePath = validateAssetRelativePath(asset.path)
        const candidate = path.resolve(sourceRoot, relativePath)
        const realCandidate = await realpath(candidate)
        const realSourceRoot = await realpath(sourceRoot)
        if (!pathIsWithin(realSourceRoot, realCandidate)) throw new Error(`presentation.imageAssets[${index}].path escapes its Project root.`)
        bytes = await readFile(realCandidate)
        verifyImageBytes(bytes, asset.mimeType)
        requestedName = path.basename(relativePath)
      } else {
        throw new Error(`presentation.imageAssets[${index}] cannot be copied into the new Project.`)
      }
      const { fileName, destination } = await duplicateSafePath(assetsPath, requestedName, asset.mimeType)
      await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 })
      imageAssets.push({ ...asset, path: `assets/${fileName}`, source: undefined })
    }
    return canonicalizePresentation({ ...presentation, ...(imageAssets.length ? { imageAssets } : { imageAssets: undefined }) })
  }

  private async assertRealPathWithin(rootPath: string, candidate: string) {
    const realCandidate = await realpath(candidate)
    if (!pathIsWithin(rootPath, realCandidate)) throw new Error('Project asset directory escapes the Project root.')
  }

  private async assertActiveRootAvailable(active: ActiveProject) {
    let info
    try {
      info = await lstat(active.realRootPath)
    } catch {
      throw new Error('The active Project folder is unavailable.')
    }
    if (!info.isDirectory() || info.isSymbolicLink()
      || info.dev !== active.rootDevice || info.ino !== active.rootInode) {
      throw new Error('The active Project folder is unavailable.')
    }
  }

  private emit(change: DesktopProjectExternalChange) {
    for (const listener of this.listeners) listener(change)
  }

  private startWatching(active: ActiveProject, assetDirectories: string[]) {
    this.stopWatching()
    this.watchedAssetDirectories = [...assetDirectories].sort()
    const generation = this.watchGeneration
    this.addWatchers(active, assetDirectories, generation)
  }

  private replaceAssetWatchers(active: ActiveProject, assetDirectories: string[]) {
    if (this.active !== active) return
    const nextDirectories = [...assetDirectories].sort()
    if (!this.watcherFault && nextDirectories.length === this.watchedAssetDirectories.length
      && nextDirectories.every((directory, index) => directory === this.watchedAssetDirectories[index])) return
    for (const watcher of this.watchers) watcher.close()
    this.watchers.clear()
    this.watchedAssetDirectories = nextDirectories
    const generation = ++this.watchGeneration
    this.watcherFault = false
    this.addWatchers(active, assetDirectories, generation)
  }

  private addWatchers(active: ActiveProject, directories: string[], generation: number) {
    for (const directory of [active.realRootPath, ...directories]) {
      try {
        this.watchers.add(this.watchFactory!(directory, (eventType) => {
          if (eventType === 'error') this.recoverWatcher(active, generation)
          else this.queueInspection(active.id, generation)
        }))
      } catch {
        this.recoverWatcher(active, generation)
      }
    }
    if (!this.watcherFault && this.watchRecoveryTimer) {
      clearInterval(this.watchRecoveryTimer)
      this.watchRecoveryTimer = null
    }
  }

  private recoverWatcher(active: ActiveProject, generation: number) {
    if (this.active !== active || generation !== this.watchGeneration) return
    this.watcherFault = true
    this.queueInspection(active.id, generation)
    if (!this.watchRecoveryTimer) {
      // Poll while a filesystem watcher cannot be installed, and retry watcher
      // registration after each inspection. This avoids silently losing edits.
      this.watchRecoveryTimer = setInterval(() => {
        this.queueInspection(active.id, this.watchGeneration)
      }, 1_000)
      this.watchRecoveryTimer.unref?.()
    }
  }

  private stopWatching() {
    this.watchGeneration += 1
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = null
    if (this.watchRecoveryTimer) clearInterval(this.watchRecoveryTimer)
    this.watchRecoveryTimer = null
    this.watcherFault = false
    for (const watcher of this.watchers) watcher.close()
    this.watchers.clear()
    this.watchedAssetDirectories = []
  }

  private queueInspection(projectId: string, generation: number) {
    if (generation !== this.watchGeneration || this.active?.id !== projectId) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.inspectExternalState(projectId, generation)
    }, this.debounceMs)
  }

  private async inspectExternalState(projectId: string, generation: number) {
    const active = this.active
    if (!active || active.id !== projectId || generation !== this.watchGeneration) return
    try {
      await this.assertActiveRootAvailable(active)
    } catch (error) {
      this.reportIssue(active, 'unavailable', error)
      return
    }

    let valid: Awaited<ReturnType<typeof readProjectFile>> | null = null
    let lastError: unknown = null
    for (let attempt = 0; attempt < this.maximumReadAttempts; attempt += 1) {
      try {
        const first = await readProjectFile(active.realRootPath)
        await delay(this.stabilizationMs)
        if (generation !== this.watchGeneration || this.active !== active) return
        const second = await readProjectFile(active.realRootPath)
        if (hash(first.source) !== hash(second.source)) throw new Error(`${PROJECT_FILE_NAME} is still changing.`)
        const missing = await missingAssets(active.realRootPath, second.presentation)
        if (missing.length > 0 && attempt + 1 < this.maximumReadAttempts) {
          lastError = new Error(missing.map(({ message }) => message).join('\n'))
          await delay(this.retryDelayMs)
          continue
        }
        valid = second
        break
      } catch (error) {
        lastError = error
        if (attempt + 1 < this.maximumReadAttempts) await delay(this.retryDelayMs)
      }
    }
    if (generation !== this.watchGeneration || this.active !== active) return
    if (!valid) {
      const presentationExists = await pathExists(path.join(active.realRootPath, PROJECT_FILE_NAME))
      this.reportIssue(active, presentationExists ? 'invalid' : 'unavailable', lastError)
      return
    }

    let scanned
    try {
      scanned = await scanAssetTree(active.realRootPath)
    } catch {
      this.queueInspection(projectId, generation)
      return
    }
    if (generation !== this.watchGeneration || this.active !== active) return
    // An app Save or another external write can land while assets are scanned.
    // Never announce a version that is no longer the current disk version.
    try {
      if (await this.diskHash(active.realRootPath) !== hash(valid.source)) {
        this.queueInspection(projectId, generation)
        return
      }
    } catch {
      this.queueInspection(projectId, generation)
      return
    }
    if (generation !== this.watchGeneration || this.active !== active) return
    const changedPaths = changedAssetPaths(active.assetFingerprints, scanned.fingerprints)
      .filter((relativePath) => {
        const internalFingerprint = active.internalAssetWrites.get(relativePath)
        active.internalAssetWrites.delete(relativePath)
        return internalFingerprint === undefined || scanned.fingerprints.get(relativePath) !== internalFingerprint
      })
    for (const [relativePath, internalFingerprint] of active.internalAssetWrites) {
      if (scanned.fingerprints.get(relativePath) === internalFingerprint) {
        active.internalAssetWrites.delete(relativePath)
      }
    }
    active.assetFingerprints = scanned.fingerprints
    active.assetRevision = assetRevision(scanned.fingerprints)
    this.replaceAssetWatchers(active, scanned.directories)
    const detectedAt = Date.now()
    const recovered = active.issueKind !== null
    active.issueKind = null
    if (recovered) this.emit({ projectId, kind: 'recovered', detectedAt })
    if (changedPaths.length > 0) {
      this.emit({
        projectId,
        kind: 'asset',
        relativePaths: changedPaths,
        assetRevision: active.assetRevision,
        detectedAt,
      })
    }
    const diskContentHash = hash(valid.source)
    if (diskContentHash === active.contentHash || diskContentHash === active.savingHash) {
      active.lastPresentationHintHash = null
      return
    }
    if (diskContentHash !== active.lastPresentationHintHash) {
      active.lastPresentationHintHash = diskContentHash
      this.emit({ projectId, kind: 'presentation', contentHash: diskContentHash, detectedAt })
    }
  }

  private reportIssue(active: ActiveProject, kind: 'invalid' | 'unavailable', error: unknown) {
    if (this.active !== active || active.issueKind === kind) return
    active.issueKind = kind
    active.lastPresentationHintHash = null
    const message = error instanceof Error ? error.message : `The active Project is ${kind}.`
    this.emit({ projectId: active.id, kind, message, detectedAt: Date.now() })
  }
}

export function mimeTypeForAssetPath(assetPath: string) {
  return EXTENSION_MIME_TYPES.get(path.extname(assetPath).toLowerCase()) ?? null
}
