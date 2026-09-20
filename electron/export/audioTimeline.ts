import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import type { DesktopExportJob, NarrationExportSegment } from './types'

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

function seconds(durationMs: number) {
  return (durationMs / 1000).toFixed(6)
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
  inputArgs: string[]
  filterComplex: string
}

export async function createAudioTimeline(job: DesktopExportJob, tempDirectory: string): Promise<AudioTimeline> {
  const inputArgs: string[] = []
  const inputIndexBySegment = new Map<number, number>()
  let nextInputIndex = 1 // raw video is input zero

  for (let index = 0; index < job.segments.length; index += 1) {
    const segment = job.segments[index]
    if (segment.type !== 'narration') continue
    const filename = `take-${String(index + 1).padStart(3, '0')}-${safeFilenamePart(segment.sectionId || segment.title)}${extensionForMimeType(segment.audio.mimeType)}`
    const inputPath = path.join(tempDirectory, filename)
    await writeFile(inputPath, audioBuffer(segment), { mode: 0o600 })
    inputArgs.push('-i', inputPath)
    inputIndexBySegment.set(index, nextInputIndex)
    nextInputIndex += 1
  }

  const filters: string[] = []
  const labels: string[] = []
  job.segments.forEach((segment, index) => {
    const output = `a${index}`
    const duration = seconds(segment.durationMs)
    if (segment.type === 'silent-scene') {
      filters.push(`anullsrc=r=48000:cl=stereo:d=${duration},asetpts=PTS-STARTPTS[${output}]`)
    } else {
      const inputIndex = inputIndexBySegment.get(index)
      if (inputIndex === undefined) throw new Error(`Narration audio for “${segment.title}” was not prepared.`)
      filters.push(
        `[${inputIndex}:a:0]aresample=48000,`
        + `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,`
        + `atrim=duration=${duration},apad=pad_dur=${duration},atrim=duration=${duration},`
        + `asetpts=PTS-STARTPTS[${output}]`,
      )
    }
    labels.push(`[${output}]`)
  })

  if (job.finalHoldMs > 0) {
    const holdLabel = `a${job.segments.length}`
    filters.push(`anullsrc=r=48000:cl=stereo:d=${seconds(job.finalHoldMs)},asetpts=PTS-STARTPTS[${holdLabel}]`)
    labels.push(`[${holdLabel}]`)
  }
  filters.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[aout]`)

  return { inputArgs, filterComplex: filters.join(';') }
}
