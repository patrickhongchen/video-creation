import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import type { DesktopExportJob, NarrationExportSegment } from './types'
import { durationSeconds, exactDurationFilters } from './narrationAudioProcessing'
import { masterNarrationProgram, runAudioFfmpeg } from './narrationLoudness'
import { processNarrationTake, type ProcessNarrationTakeResult } from './narrationTakeProcessor'

function extensionForMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase().split(';', 1)[0]
  if (normalized === 'audio/webm') return '.webm'
  if (normalized === 'audio/ogg') return '.ogg'
  if (normalized === 'audio/mp4' || normalized === 'audio/x-m4a' || normalized === 'audio/aac') return '.m4a'
  if (normalized === 'audio/mpeg') return '.mp3'
  if (normalized === 'audio/wav' || normalized === 'audio/wave' || normalized === 'audio/x-wav') return '.wav'
  return '.audio'
}

function audioBuffer(segment: NarrationExportSegment) {
  const bytes = segment.audio.bytes
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes)
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function safeFilenamePart(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'section'
}

export interface AudioTimeline {
  /** Exact-duration, final-mastered PCM WAV consumed by the video encoder. */
  audioPath: string
  /** Exposed for diagnostics/tests; these files contain the original bytes verbatim. */
  rawInputPaths: string[]
  takeResults: ProcessNarrationTakeResult[]
  normalized: boolean
}

export async function createAudioTimeline(
  job: DesktopExportJob,
  tempDirectory: string,
  signal?: AbortSignal,
): Promise<AudioTimeline> {
  const inputArgs: string[] = []
  const processedInputBySegment = new Map<number, number>()
  const rawInputPaths: string[] = []
  const takeResults: ProcessNarrationTakeResult[] = []
  const mode = job.presentation.voiceEnhance ?? 'off'

  for (let index = 0; index < job.segments.length; index += 1) {
    const segment = job.segments[index]
    if (segment.type !== 'narration') continue
    const stem = `take-${String(index + 1).padStart(3, '0')}-${safeFilenamePart(segment.sectionId || segment.title)}`
    const rawInputPath = path.join(tempDirectory, `${stem}-raw${extensionForMimeType(segment.audio.mimeType)}`)
    const processedPath = path.join(tempDirectory, `${stem}-processed.wav`)
    await writeFile(rawInputPath, audioBuffer(segment), { mode: 0o600 })
    rawInputPaths.push(rawInputPath)
    takeResults.push(await processNarrationTake({
      inputPath: rawInputPath,
      outputPath: processedPath,
      durationMs: segment.durationMs,
      mode,
      signal,
    }))
    processedInputBySegment.set(index, inputArgs.length / 2)
    inputArgs.push('-i', processedPath)
  }

  const filters: string[] = []
  const labels: string[] = []
  job.segments.forEach((segment, index) => {
    const output = `a${index}`
    if (segment.type === 'silent-scene') {
      filters.push(`anullsrc=r=48000:cl=stereo:d=${durationSeconds(segment.durationMs)},asetpts=PTS-STARTPTS[${output}]`)
    } else {
      const inputIndex = processedInputBySegment.get(index)
      if (inputIndex === undefined) throw new Error(`Narration audio for “${segment.title}” was not prepared.`)
      filters.push(`[${inputIndex}:a:0]${exactDurationFilters(segment.durationMs).join(',')}[${output}]`)
    }
    labels.push(`[${output}]`)
  })

  if (job.finalHoldMs > 0) {
    const holdLabel = `a${job.segments.length}`
    filters.push(`anullsrc=r=48000:cl=stereo:d=${durationSeconds(job.finalHoldMs)},asetpts=PTS-STARTPTS[${holdLabel}]`)
    labels.push(`[${holdLabel}]`)
  }
  if (labels.length === 0) {
    const label = 'a0'
    filters.push(`anullsrc=r=48000:cl=stereo:d=${durationSeconds(job.totalDurationMs)},asetpts=PTS-STARTPTS[${label}]`)
    labels.push(`[${label}]`)
  }
  filters.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[aout]`)

  const assembledPath = path.join(tempDirectory, 'narration-assembled.wav')
  await runAudioFfmpeg([
    '-hide_banner', '-loglevel', 'warning', '-y',
    ...inputArgs,
    '-filter_complex', filters.join(';'),
    '-map', '[aout]',
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
    assembledPath,
  ], signal)

  const audioPath = path.join(tempDirectory, 'narration-mastered.wav')
  const master = await masterNarrationProgram({
    inputPath: assembledPath,
    outputPath: audioPath,
    durationMs: job.totalDurationMs,
    signal,
    whollySilent: processedInputBySegment.size === 0,
  })
  return { audioPath, rawInputPaths, takeResults, normalized: master.normalized }
}
