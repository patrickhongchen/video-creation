import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  DesktopFinalPreviewAudioRequest,
  DesktopFinalPreviewAudioResult,
} from '../src/desktop/desktopTypes'
import { createAudioTimeline, type AudioTimeline } from './export/audioTimeline'
import { runAudioFfmpeg } from './export/narrationLoudness'
import type { DesktopExportJob } from './export/types'

const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_DURATION_MS = 4 * 60 * 60 * 1000
const MAX_TOTAL_AUDIO_BYTES = 2 * 1024 * 1024 * 1024
const MAX_SEGMENTS = 10_000
const ALLOWED_MIME_TYPES = new Set([
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
  'audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav',
])

type TimelineBuilder = (job: DesktopExportJob, directory: string) => Promise<AudioTimeline>
type PreviewEncoder = (inputPath: string, outputPath: string) => Promise<void>

export interface MasteredPreviewAudio {
  audioPath: string
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function isDuration(value: unknown, allowZero = false): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && (allowZero ? value >= 0 : value > 0) && value <= MAX_DURATION_MS
}

function normalizedMimeType(value: string) {
  return value.toLowerCase().split(';', 1)[0].trim()
}

export function validateFinalPreviewAudioRequest(value: unknown): asserts value is DesktopFinalPreviewAudioRequest {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ['voiceEnhance', 'segments', 'finalHoldMs', 'totalDurationMs'])
    || (value.voiceEnhance !== 'off' && value.voiceEnhance !== 'standard')
    || !Array.isArray(value.segments) || value.segments.length > MAX_SEGMENTS
    || !isDuration(value.finalHoldMs, true) || !isDuration(value.totalDurationMs)) {
    throw new Error('Invalid final preview audio request.')
  }

  let totalBytes = 0
  let plannedDurationMs = value.finalHoldMs
  for (const segment of value.segments) {
    if (!isRecord(segment) || !isDuration(segment.durationMs)) {
      throw new Error('The final preview contains an invalid audio segment.')
    }
    plannedDurationMs += segment.durationMs
    if (segment.type === 'silent-scene') {
      if (!hasOnlyKeys(segment, ['type', 'durationMs'])) {
        throw new Error('The final preview contains an invalid silent segment.')
      }
      continue
    }
    if (segment.type !== 'narration'
      || !hasOnlyKeys(segment, ['type', 'takeId', 'mimeType', 'durationMs', 'bytes'])
      || typeof segment.takeId !== 'string' || segment.takeId.length < 1 || segment.takeId.length > 200
      || typeof segment.mimeType !== 'string' || segment.mimeType.length > 100
      || !ALLOWED_MIME_TYPES.has(normalizedMimeType(segment.mimeType))
      || !(segment.bytes instanceof ArrayBuffer) || segment.bytes.byteLength === 0) {
      throw new Error('The final preview contains an invalid narration segment.')
    }
    totalBytes += segment.bytes.byteLength
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_AUDIO_BYTES) {
      throw new Error('The final preview contains too much narration audio.')
    }
  }
  if (Math.abs(plannedDurationMs - value.totalDurationMs) > 1) {
    throw new Error('The final preview duration does not match its audio segments.')
  }
}

export function finalPreviewAudioCacheKey(request: DesktopFinalPreviewAudioRequest, processingVersion: string) {
  const hash = createHash('sha256')
    .update(processingVersion).update('\0')
    .update(request.voiceEnhance).update('\0')
    .update(String(request.finalHoldMs)).update('\0')
    .update(String(request.totalDurationMs)).update('\0')
  for (const segment of request.segments) {
    hash.update(segment.type).update('\0').update(String(segment.durationMs)).update('\0')
    if (segment.type === 'narration') {
      hash.update(segment.takeId).update('\0')
        .update(segment.mimeType).update('\0')
        .update(Buffer.from(segment.bytes)).update('\0')
    }
  }
  return hash.digest('hex')
}

function timelineJob(request: DesktopFinalPreviewAudioRequest, key: string): DesktopExportJob {
  return {
    jobId: `final-preview-${key}`,
    presentation: {
      schemaVersion: 2,
      id: 'final-preview',
      title: 'Final preview',
      slides: [],
      voiceEnhance: request.voiceEnhance,
    },
    segments: request.segments.map((segment) => segment.type === 'silent-scene'
      ? { type: 'silent-scene' as const, sceneId: 'final-preview', durationMs: segment.durationMs }
      : {
          type: 'narration' as const,
          sectionId: segment.takeId,
          title: segment.takeId,
          sceneIds: [],
          durationMs: segment.durationMs,
          cues: [],
          audio: {
            takeId: segment.takeId,
            mimeType: segment.mimeType,
            bytes: segment.bytes,
          },
        }),
    editorViewportWidth: 1080,
    finalHoldMs: request.finalHoldMs,
    totalDurationMs: request.totalDurationMs,
    suggestedBaseName: 'final-preview',
  }
}

function copiedArrayBuffer(bytes: ArrayBuffer | ArrayBufferView) {
  if (bytes instanceof ArrayBuffer) return bytes
  return Uint8Array.from(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).buffer
}

export function finalPreviewAudioRequestFromExportJob(job: DesktopExportJob): DesktopFinalPreviewAudioRequest {
  return {
    voiceEnhance: job.presentation.voiceEnhance ?? 'off',
    segments: job.segments.map((segment) => segment.type === 'silent-scene'
      ? { type: 'silent-scene' as const, durationMs: segment.durationMs }
      : {
          type: 'narration' as const,
          takeId: segment.audio.takeId,
          mimeType: segment.audio.mimeType,
          durationMs: segment.durationMs,
          bytes: copiedArrayBuffer(segment.audio.bytes),
        }),
    finalHoldMs: job.finalHoldMs,
    totalDurationMs: job.totalDurationMs,
  }
}

async function encodePreviewAac(inputPath: string, outputPath: string) {
  await runAudioFfmpeg([
    '-hide_banner', '-loglevel', 'warning', '-y', '-i', inputPath,
    '-vn', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart', outputPath,
  ])
}

function readWarnings(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as { warnings?: unknown }
    return Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((warning): warning is string => typeof warning === 'string')
      : []
  } catch {
    return []
  }
}

/** Stores only disposable mastered and compressed derivatives in the OS temp area. */
export class FinalPreviewAudioCache {
  private previewInFlight = new Map<string, Promise<DesktopFinalPreviewAudioResult>>()
  private masteredInFlight = new Map<string, Promise<MasteredPreviewAudio>>()
  private masterQueue: Promise<void> = Promise.resolve()
  private previewQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly directory: string,
    private readonly processingVersion: string,
    private readonly buildTimeline: TimelineBuilder = createAudioTimeline,
    private readonly encodePreview: PreviewEncoder = encodePreviewAac,
  ) {}

  async prune() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const now = Date.now()
    await Promise.all((await readdir(this.directory, { withFileTypes: true })).map(async (entry) => {
      const target = path.join(this.directory, entry.name)
      const info = await stat(target).catch(() => null)
      if (info && now - info.mtimeMs > MAX_CACHE_AGE_MS) {
        await rm(target, { recursive: true, force: true })
      }
    }))
  }

  prepare(value: unknown): Promise<DesktopFinalPreviewAudioResult> {
    validateFinalPreviewAudioRequest(value)
    const request = value
    const key = finalPreviewAudioCacheKey(request, this.processingVersion)
    const existing = this.previewInFlight.get(key)
    if (existing) return existing
    const promise = this.previewQueue.then(() => this.preparePreviewKey(key, request))
      .finally(() => this.previewInFlight.delete(key))
    this.previewQueue = promise.then(() => undefined, () => undefined)
    this.previewInFlight.set(key, promise)
    return promise
  }

  prepareMastered(value: unknown, signal?: AbortSignal): Promise<MasteredPreviewAudio> {
    validateFinalPreviewAudioRequest(value)
    if (signal?.aborted) return Promise.reject(abortError())
    const request = value
    const key = finalPreviewAudioCacheKey(request, this.processingVersion)
    let promise = this.masteredInFlight.get(key)
    if (!promise) {
      promise = this.masterQueue.then(() => this.prepareMasteredKey(key, request))
        .finally(() => this.masteredInFlight.delete(key))
      this.masterQueue = promise.then(() => undefined, () => undefined)
      this.masteredInFlight.set(key, promise)
    }
    if (!signal) return promise
    return new Promise<MasteredPreviewAudio>((resolve, reject) => {
      const cancelled = () => {
        signal.removeEventListener('abort', cancelled)
        reject(abortError())
      }
      signal.addEventListener('abort', cancelled, { once: true })
      promise.then(
        (result) => {
          signal.removeEventListener('abort', cancelled)
          resolve(result)
        },
        (error: unknown) => {
          signal.removeEventListener('abort', cancelled)
          reject(error)
        },
      )
    })
  }

  private async prepareMasteredKey(
    key: string,
    request: DesktopFinalPreviewAudioRequest,
  ): Promise<MasteredPreviewAudio> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const masteredPath = path.join(this.directory, `${key}.wav`)
    const metadataPath = path.join(this.directory, `${key}.json`)
    const [masteredInfo, metadata] = await Promise.all([
      stat(masteredPath).catch(() => null),
      readFile(metadataPath, 'utf8').then(readWarnings).catch(() => []),
    ])
    if (masteredInfo?.isFile()) {
      const now = new Date()
      await Promise.all([
        utimes(masteredPath, now, now), utimes(metadataPath, now, now).catch(() => undefined),
      ])
      return { audioPath: masteredPath, warnings: metadata }
    }

    const nonce = createHash('sha256').update(`${key}-${process.pid}-${Math.random()}`).digest('hex').slice(0, 16)
    const workDirectory = path.join(this.directory, `${nonce}.work`)
    try {
      await mkdir(workDirectory, { recursive: true, mode: 0o700 })
      const timeline = await this.buildTimeline(timelineJob(request, key), workDirectory)
      const warnings = [...new Set(timeline.takeResults.flatMap((result) => result.warning ? [result.warning] : []))]
      await rename(timeline.audioPath, masteredPath)
      await writeFile(metadataPath, JSON.stringify({ warnings }), { mode: 0o600 })
      return { audioPath: masteredPath, warnings }
    } finally {
      await rm(workDirectory, { recursive: true, force: true })
    }
  }

  private async preparePreviewKey(
    key: string,
    request: DesktopFinalPreviewAudioRequest,
  ): Promise<DesktopFinalPreviewAudioResult> {
    const mastered = await this.prepareMastered(request)
    const previewPath = path.join(this.directory, `${key}.m4a`)
    const cachedPreview = await readFile(previewPath).catch(() => null)
    if (cachedPreview?.length) {
      const now = new Date()
      await utimes(previewPath, now, now)
      return {
        bytes: Uint8Array.from(cachedPreview).buffer,
        mimeType: 'audio/mp4',
        durationMs: request.totalDurationMs,
        warnings: mastered.warnings,
      }
    }

    const nonce = createHash('sha256').update(`${key}-${process.pid}-${Math.random()}`).digest('hex').slice(0, 16)
    const partialPreviewPath = path.join(this.directory, `${nonce}.m4a`)
    try {
      await this.encodePreview(mastered.audioPath, partialPreviewPath)
      const bytes = await readFile(partialPreviewPath)
      if (!bytes.length) throw new Error('Final preview audio processing produced no audio.')
      await rename(partialPreviewPath, previewPath)
      return {
        bytes: Uint8Array.from(bytes).buffer,
        mimeType: 'audio/mp4',
        durationMs: request.totalDurationMs,
        warnings: mastered.warnings,
      }
    } finally {
      await rm(partialPreviewPath, { force: true })
    }
  }
}

function abortError() {
  const error = new Error('Final preview audio preparation was cancelled.')
  error.name = 'AbortError'
  return error
}
