import type { VoiceEnhanceMode } from '../../src/model'

/** Bump this whenever a change should invalidate enhanced preview derivatives. */
export const NARRATION_PROCESSING_VERSION = '2'

// The bundled FFmpeg's afftdn delays speech by 25 ms. Standard processing
// extends the tail before filtering and removes this delay after filtering.
export const STANDARD_DENOISE_LATENCY_SECONDS = 0.025
export const STANDARD_END_PADDING_SECONDS = 0.050

/** Conservative cleanup shared by take preview and export processing. */
export const VOICE_CLEANUP_FILTERS = [
  'highpass=f=80',
  'afftdn=nr=6:nf=-50',
  'acompressor=threshold=0.1:ratio=3:attack=20:release=250:detection=rms',
] as const

export const TAKE_LEVEL_TARGET = {
  integratedLufs: -18,
  maxGainDb: 9,
  truePeakDb: -3,
  loudnessRange: 11,
} as const

export const FINAL_MASTER_TARGET = {
  integratedLufs: -14,
  truePeakDb: -1.5,
  loudnessRange: 7,
} as const

export function durationSeconds(durationMs: number) {
  return (durationMs / 1000).toFixed(6)
}

/** Produces an exact-duration, 48 kHz stereo take before level adjustment. */
export function takePreparationFilters(mode: VoiceEnhanceMode, durationMs: number): string[] {
  const duration = durationSeconds(durationMs)
  const format = [
    'aresample=48000:first_pts=0',
    'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo',
  ]
  if (mode === 'standard') {
    return [
      ...format,
      `apad=pad_dur=${STANDARD_END_PADDING_SECONDS.toFixed(3)}`,
      ...VOICE_CLEANUP_FILTERS,
      `atrim=start=${STANDARD_DENOISE_LATENCY_SECONDS.toFixed(3)}:duration=${duration}`,
      'asetpts=PTS-STARTPTS',
      `apad=pad_dur=${duration}`,
      `atrim=duration=${duration}`,
    ]
  }
  return [
    ...format,
    `atrim=duration=${duration}`,
    `apad=pad_dur=${duration}`,
    `atrim=duration=${duration}`,
    'asetpts=PTS-STARTPTS',
  ]
}

export function exactDurationFilters(durationMs: number): string[] {
  const duration = durationSeconds(durationMs)
  return [
    `atrim=duration=${duration}`,
    `apad=pad_dur=${duration}`,
    `atrim=duration=${duration}`,
    'asetpts=PTS-STARTPTS',
  ]
}
