import path from 'node:path'
import { rm } from 'node:fs/promises'
import type { VoiceEnhanceMode } from '../../src/model'
import { TAKE_LEVEL_TARGET, takePreparationFilters } from './narrationAudioProcessing'
import { measureNarrationLoudness, runAudioFfmpeg } from './narrationLoudness'

export interface ProcessNarrationTakeOptions {
  inputPath: string
  outputPath: string
  durationMs: number
  mode: VoiceEnhanceMode
  signal?: AbortSignal
}

export interface ProcessNarrationTakeResult {
  gainDb: number
  warning?: string
}

function roundGain(value: number) {
  return Math.round(value * 100) / 100
}

export async function processNarrationTake(options: ProcessNarrationTakeOptions): Promise<ProcessNarrationTakeResult> {
  if (path.resolve(options.inputPath) === path.resolve(options.outputPath)) {
    throw new Error('Processed narration must be written separately from the raw recording.')
  }
  if (!Number.isFinite(options.durationMs) || options.durationMs <= 0) {
    throw new Error('Narration take duration must be greater than zero.')
  }

  const preparation = takePreparationFilters(options.mode, options.durationMs)
  const measurement = await measureNarrationLoudness({
    inputPath: options.inputPath,
    filters: preparation,
    integratedLufs: TAKE_LEVEL_TARGET.integratedLufs,
    truePeakDb: TAKE_LEVEL_TARGET.truePeakDb,
    loudnessRange: TAKE_LEVEL_TARGET.loudnessRange,
    signal: options.signal,
  })

  let gainDb = 0
  let warning: string | undefined
  if (measurement) {
    const targetGain = TAKE_LEVEL_TARGET.integratedLufs - measurement.inputIntegratedLufs
    const peakSafeGain = TAKE_LEVEL_TARGET.truePeakDb - measurement.inputTruePeakDb
    gainDb = roundGain(Math.min(targetGain, TAKE_LEVEL_TARGET.maxGainDb, peakSafeGain))
    if (peakSafeGain < targetGain - 0.05 && peakSafeGain < TAKE_LEVEL_TARGET.maxGainDb - 0.05) {
      warning = 'Level correction was limited to keep the recording from clipping.'
    } else if (targetGain > TAKE_LEVEL_TARGET.maxGainDb + 0.05) {
      warning = 'This recording is unusually quiet. Level correction was limited to avoid amplifying background noise.'
    }
  } else {
    warning = 'No measurable speech level was found. The recording was kept at its original level.'
  }

  try {
    await runAudioFfmpeg([
      '-hide_banner', '-loglevel', 'warning', '-y', '-i', options.inputPath,
      '-vn', '-af', [...preparation, `volume=${gainDb.toFixed(2)}dB`].join(','),
      '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', options.outputPath,
    ], options.signal)
  } catch (error) {
    await rm(options.outputPath, { force: true }).catch(() => undefined)
    throw error
  }
  return { gainDb, ...(warning ? { warning } : {}) }
}
