import { rm } from 'node:fs/promises'
import { FINAL_MASTER_TARGET, exactDurationFilters } from './narrationAudioProcessing'
import { spawnFfmpeg, waitForSpawn } from './ffmpeg'

export interface LoudnessMeasurement {
  inputIntegratedLufs: number
  inputTruePeakDb: number
  inputLoudnessRange: number
  inputThreshold: number
  targetOffset: number
}

interface MeasureOptions {
  inputPath: string
  filters?: readonly string[]
  integratedLufs: number
  truePeakDb: number
  loudnessRange: number
  signal?: AbortSignal
}

function abortError() {
  const error = new Error('Audio processing was cancelled.')
  error.name = 'AbortError'
  return error
}

export async function runAudioFfmpeg(args: string[], signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw abortError()
  const child = spawnFfmpeg(args)
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-128_000) })
  const cancel = () => child.kill('SIGKILL')
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    await waitForSpawn(child)
    const result = await new Promise<{ code: number | null; exitSignal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, exitSignal) => resolve({ code, exitSignal }))
    })
    if (signal?.aborted) throw abortError()
    if (result.code !== 0) {
      const detail = stderr.trim().split('\n').slice(-12).join('\n')
      throw new Error(`FFmpeg audio processing failed${detail ? `:\n${detail}` : '.'}`)
    }
    return stderr
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}

function numberField(value: unknown): number {
  return typeof value === 'number' ? value : Number(value)
}

/** Parse the last loudnorm JSON object so unrelated FFmpeg diagnostics are harmless. */
export function parseLoudnormMeasurement(stderr: string): LoudnessMeasurement | null {
  const objects = stderr.match(/\{[\s\S]*?\}/g) ?? []
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(objects[index]) as Record<string, unknown>
      if (!('input_i' in parsed) || !('input_tp' in parsed)) continue
      const measurement = {
        inputIntegratedLufs: numberField(parsed.input_i),
        inputTruePeakDb: numberField(parsed.input_tp),
        inputLoudnessRange: numberField(parsed.input_lra),
        inputThreshold: numberField(parsed.input_thresh),
        targetOffset: numberField(parsed.target_offset),
      }
      return Object.values(measurement).every(Number.isFinite) ? measurement : null
    } catch {
      // Continue backward in case braces from another diagnostic were matched.
    }
  }
  throw new Error('FFmpeg did not return a loudness measurement.')
}

export async function measureNarrationLoudness(options: MeasureOptions): Promise<LoudnessMeasurement | null> {
  const loudnorm = `loudnorm=I=${options.integratedLufs}:TP=${options.truePeakDb}:LRA=${options.loudnessRange}:print_format=json`
  const stderr = await runAudioFfmpeg([
    '-hide_banner', '-nostats', '-i', options.inputPath, '-vn',
    '-af', [...(options.filters ?? []), loudnorm].join(','),
    '-f', 'null', '-',
  ], options.signal)
  return parseLoudnormMeasurement(stderr)
}

export function finalLoudnormFilter(measurement: LoudnessMeasurement): string {
  return [
    `loudnorm=I=${FINAL_MASTER_TARGET.integratedLufs}`,
    `TP=${FINAL_MASTER_TARGET.truePeakDb}`,
    `LRA=${FINAL_MASTER_TARGET.loudnessRange}`,
    `measured_I=${measurement.inputIntegratedLufs}`,
    `measured_TP=${measurement.inputTruePeakDb}`,
    `measured_LRA=${measurement.inputLoudnessRange}`,
    `measured_thresh=${measurement.inputThreshold}`,
    `offset=${measurement.targetOffset}`,
    'linear=true',
    'print_format=summary',
  ].join(':')
}

interface MasterOptions {
  inputPath: string
  outputPath: string
  durationMs: number
  signal?: AbortSignal
  /** Avoid even the analysis pass when the timeline is known to contain no takes. */
  whollySilent?: boolean
}

export async function masterNarrationProgram(options: MasterOptions): Promise<{ normalized: boolean }> {
  const measurement = options.whollySilent ? null : await measureNarrationLoudness({
    inputPath: options.inputPath,
    integratedLufs: FINAL_MASTER_TARGET.integratedLufs,
    truePeakDb: FINAL_MASTER_TARGET.truePeakDb,
    loudnessRange: FINAL_MASTER_TARGET.loudnessRange,
    signal: options.signal,
  })
  const filters = [
    ...(measurement ? [finalLoudnormFilter(measurement)] : []),
    'aresample=48000',
    'aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo',
    ...exactDurationFilters(options.durationMs),
  ]
  try {
    await runAudioFfmpeg([
      '-hide_banner', '-loglevel', 'warning', '-y', '-i', options.inputPath,
      '-vn', '-af', filters.join(','),
      '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', options.outputPath,
    ], options.signal)
  } catch (error) {
    await rm(options.outputPath, { force: true }).catch(() => undefined)
    throw error
  }
  return { normalized: measurement !== null }
}
