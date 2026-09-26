import path from 'node:path'
import type { DesktopExportJob, DesktopRenderFrameRequest, ExportCue, ExportSegment, NarrationExportSegment } from './types'

const MAX_JOB_DURATION_MS = 4 * 60 * 60 * 1000
const MAX_AUDIO_BYTES = 2 * 1024 * 1024 * 1024
const MIME_PATTERN = /^audio\/[a-z0-9.+-]+(?:\s*;[^\r\n]*)?$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown, maxLength = 500): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isDuration(value: unknown, allowZero = false): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && (allowZero ? value >= 0 : value > 0)
    && value <= MAX_JOB_DURATION_MS
}

function isCue(value: unknown): value is ExportCue {
  return isRecord(value)
    && isNonEmptyString(value.sceneId)
    && isDuration(value.timeMs, true)
    && (value.type === undefined || value.type === 'slide'
      || (value.type === 'reveal' && typeof value.order === 'number' && Number.isSafeInteger(value.order) && value.order > 0))
}

function byteLength(value: unknown) {
  if (value instanceof ArrayBuffer) return value.byteLength
  if (ArrayBuffer.isView(value)) return value.byteLength
  return -1
}

function assertSegment(value: unknown, sceneIds: Set<string>): asserts value is ExportSegment {
  if (!isRecord(value) || !isDuration(value.durationMs) || typeof value.type !== 'string') {
    throw new Error('The export contains an invalid playback segment.')
  }
  const segmentDurationMs = value.durationMs

  if (value.type === 'silent-scene') {
    if (!isNonEmptyString(value.sceneId) || !sceneIds.has(value.sceneId)) {
      throw new Error('A silent export segment references an unknown slide.')
    }
    return
  }

  if (value.type !== 'narration') throw new Error('The export contains an unknown playback segment type.')
  if (!isNonEmptyString(value.sectionId) || !isNonEmptyString(value.title)) {
    throw new Error('A narration export segment is missing its section identity.')
  }
  const segmentSceneIds = value.sceneIds
  if (!Array.isArray(segmentSceneIds) || segmentSceneIds.length === 0
    || !segmentSceneIds.every((id) => isNonEmptyString(id) && sceneIds.has(id))) {
    throw new Error(`Narration section “${value.title}” references an unknown slide.`)
  }
  const cues = value.cues
  if (!Array.isArray(cues) || !cues.every(isCue)
    || !cues.every((cue) => segmentSceneIds.includes(cue.sceneId) && cue.timeMs <= segmentDurationMs)) {
    throw new Error(`Narration section “${value.title}” contains invalid narration cues.`)
  }
  const audio = value.audio
  if (!isRecord(audio)
    || !isNonEmptyString(audio.takeId)
    || typeof audio.mimeType !== 'string'
    || !MIME_PATTERN.test(audio.mimeType)) {
    throw new Error(`Narration section “${value.title}” is missing usable audio metadata.`)
  }
  const size = byteLength(audio.bytes)
  if (size <= 0 || size > MAX_AUDIO_BYTES) {
    throw new Error(`Narration section “${value.title}” has invalid audio bytes.`)
  }
}

export function validateExportJob(value: unknown): asserts value is DesktopExportJob {
  if (!isRecord(value) || !isNonEmptyString(value.jobId, 200) || !isRecord(value.presentation)) {
    throw new Error('The desktop export job is invalid.')
  }
  const presentation = value.presentation
  if (presentation.schemaVersion !== 2
    || !isNonEmptyString(presentation.id)
    || !isNonEmptyString(presentation.title)
    || !Array.isArray(presentation.slides)
    || presentation.slides.length === 0) {
    throw new Error('The export presentation is invalid or unsupported.')
  }
  const slideIds = new Set<string>()
  for (const slide of presentation.slides) {
    if (!isRecord(slide) || !isNonEmptyString(slide.id) || slideIds.has(slide.id)) {
      throw new Error('The export presentation contains an invalid slide list.')
    }
    slideIds.add(slide.id)
  }
  const segments = value.segments
  if (!Array.isArray(segments)) throw new Error('The export playback plan is missing.')
  segments.forEach((segment) => assertSegment(segment, slideIds))
  if (typeof value.editorViewportWidth !== 'number'
    || !Number.isFinite(value.editorViewportWidth)
    || value.editorViewportWidth < 320
    || value.editorViewportWidth > 10_000) {
    throw new Error('The export editor viewport width is invalid.')
  }
  if (!isDuration(value.finalHoldMs, true) || !isDuration(value.totalDurationMs)) {
    throw new Error('The export duration is invalid.')
  }
  const plannedMs = segments.reduce((total, segment) => total + segment.durationMs, 0) + value.finalHoldMs
  if (Math.abs(plannedMs - value.totalDurationMs) > 1) {
    throw new Error('The export duration does not match its playback segments.')
  }
  if (typeof value.suggestedBaseName !== 'string' || value.suggestedBaseName.length > 200) {
    throw new Error('The export filename is invalid.')
  }
}

export function validateJobId(value: unknown) {
  if (!isNonEmptyString(value, 200)) throw new Error('Invalid export job identifier.')
  return value
}

export function validateRenderFrameRequest(value: unknown): DesktopRenderFrameRequest {
  if (!isRecord(value) || !isNonEmptyString(value.jobId, 200)
    || typeof value.frameIndex !== 'number' || !Number.isInteger(value.frameIndex) || value.frameIndex < 0
    || !isDuration(value.elapsedMs, true)) {
    throw new Error('Invalid export render frame request.')
  }
  return { jobId: value.jobId, frameIndex: value.frameIndex, elapsedMs: value.elapsedMs }
}

export function validateCompletedVideoPath(value: unknown, completedOutputs: ReadonlySet<string>) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.extname(value).toLowerCase() !== '.mp4') {
    throw new Error('Invalid exported video path.')
  }
  const normalized = path.resolve(value)
  if (!completedOutputs.has(normalized)) throw new Error('That video was not created by this application session.')
  return normalized
}

export function narrationSegments(job: DesktopExportJob): NarrationExportSegment[] {
  return job.segments.filter((segment): segment is NarrationExportSegment => segment.type === 'narration')
}
