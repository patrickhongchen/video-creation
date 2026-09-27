import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DesktopNarrationPreviewRequest, DesktopNarrationPreviewResult } from '../src/desktop/desktopTypes'

const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000

function sourceBytes(bytes: ArrayBuffer) {
  return Buffer.from(bytes)
}

export function previewCacheKey(request: DesktopNarrationPreviewRequest, processingVersion: string) {
  return createHash('sha256')
    .update(processingVersion)
    .update('\0')
    .update(request.takeId)
    .update('\0')
    .update(request.mimeType)
    .update('\0')
    .update(String(request.durationMs))
    .update('\0')
    .update(sourceBytes(request.bytes))
    .digest('hex')
}

function inputExtension(mimeType: string) {
  const type = mimeType.toLowerCase().split(';', 1)[0]
  if (type === 'audio/webm') return '.webm'
  if (type === 'audio/ogg') return '.ogg'
  if (type === 'audio/mp4' || type === 'audio/x-m4a' || type === 'audio/aac') return '.m4a'
  if (type === 'audio/wav' || type === 'audio/wave' || type === 'audio/x-wav') return '.wav'
  if (type === 'audio/mpeg') return '.mp3'
  throw new Error('This recording format cannot be enhanced.')
}

function validateRequest(value: unknown): asserts value is DesktopNarrationPreviewRequest {
  if (!value || typeof value !== 'object') throw new Error('Invalid narration preview request.')
  const request = value as Partial<DesktopNarrationPreviewRequest>
  if (typeof request.takeId !== 'string' || request.takeId.length < 1 || request.takeId.length > 160
    || !/^[\w.-]+$/.test(request.takeId)
    || typeof request.mimeType !== 'string' || request.mimeType.length > 100
    || !Number.isFinite(request.durationMs) || !request.durationMs || request.durationMs < 100 || request.durationMs > 3_600_000
    || !(request.bytes instanceof ArrayBuffer) || request.bytes.byteLength === 0 || request.bytes.byteLength > 512 * 1024 * 1024) {
    throw new Error('Invalid narration preview request.')
  }
  inputExtension(request.mimeType)
}

export type TakeProcessor = (options: {
  inputPath: string
  outputPath: string
  durationMs: number
  mode: 'standard'
}) => Promise<{ gainDb: number; warning?: string }>

/** Only derivatives live here. The source Blob stays in IndexedDB. */
export class NarrationPreviewCache {
  private inFlight = new Map<string, Promise<DesktopNarrationPreviewResult>>()
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly directory: string,
    private readonly processingVersion: string,
    private readonly processor: TakeProcessor,
  ) {}

  async prune() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const entries = await readdir(this.directory, { withFileTypes: true })
    const now = Date.now()
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile()) return
      const file = path.join(this.directory, entry.name)
      const info = await stat(file).catch(() => null)
      if (info && now - info.mtimeMs > MAX_CACHE_AGE_MS) await rm(file, { force: true })
    }))
  }

  prepare(value: unknown): Promise<DesktopNarrationPreviewResult> {
    validateRequest(value)
    const request = value
    const key = previewCacheKey(request, this.processingVersion)
    const existing = this.inFlight.get(key)
    if (existing) return existing
    const promise = this.queue.then(() => this.prepareKey(key, request)).finally(() => this.inFlight.delete(key))
    this.queue = promise.then(() => undefined, () => undefined)
    this.inFlight.set(key, promise)
    return promise
  }

  private async prepareKey(key: string, request: DesktopNarrationPreviewRequest): Promise<DesktopNarrationPreviewResult> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const outputPath = path.join(this.directory, `${key}.wav`)
    const metadataPath = path.join(this.directory, `${key}.json`)
    const cached = await readFile(outputPath).catch(() => null)
    if (cached?.length) {
      const metadata: { warning?: string } = await readFile(metadataPath, 'utf8')
        .then((text) => JSON.parse(text) as { warning?: string })
        .catch(() => ({}))
      return { bytes: Uint8Array.from(cached).buffer, warning: metadata.warning }
    }

    const nonce = createHash('sha256').update(`${key}-${process.pid}-${Math.random()}`).digest('hex').slice(0, 16)
    const inputPath = path.join(this.directory, `${nonce}${inputExtension(request.mimeType)}`)
    const partialPath = path.join(this.directory, `${nonce}-processed.wav`)
    try {
      await writeFile(inputPath, sourceBytes(request.bytes), { mode: 0o600 })
      const result = await this.processor({ inputPath, outputPath: partialPath, durationMs: request.durationMs, mode: 'standard' })
      const processed = await readFile(partialPath)
      if (!processed.length) throw new Error('Enhanced preview processing produced no audio.')
      await rename(partialPath, outputPath)
      await writeFile(metadataPath, JSON.stringify({ warning: result.warning }), { mode: 0o600 })
      return { bytes: Uint8Array.from(processed).buffer, warning: result.warning }
    } finally {
      await Promise.all([
        rm(inputPath, { force: true }),
        rm(partialPath, { force: true }),
      ])
    }
  }
}
