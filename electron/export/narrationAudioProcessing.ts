import type { VoiceEnhanceMode } from '../../src/model'

// The bundled FFmpeg's afftdn delays speech by 25 ms. Extend the input before
// filtering, then trim that latency from the output to keep cues aligned.
export const STANDARD_DENOISE_LATENCY_SECONDS = 0.025
export const STANDARD_END_PADDING_SECONDS = 0.050

/** Applied once to the assembled narration timeline, so sections share one loudness target. */
export const STANDARD_VOICE_ENHANCE_FILTERS = [
  'highpass=f=80',
  'afftdn=nr=6:nf=-50',
  'acompressor=threshold=0.1:ratio=3:attack=20:release=250:detection=rms',
  'loudnorm=I=-16:TP=-1.5:LRA=11',
  'aformat=sample_rates=48000:channel_layouts=stereo',
] as const

export function narrationProcessingSuffix(mode: VoiceEnhanceMode, hasNarration: boolean, durationSeconds: string): string {
  if (mode !== 'standard' || !hasNarration) return ''
  const filters = [
    `apad=pad_dur=${STANDARD_END_PADDING_SECONDS.toFixed(3)}`,
    ...STANDARD_VOICE_ENHANCE_FILTERS,
    `atrim=start=${STANDARD_DENOISE_LATENCY_SECONDS.toFixed(3)}:duration=${durationSeconds}`,
    'asetpts=PTS-STARTPTS',
    `apad=pad_dur=${durationSeconds}`,
    `atrim=duration=${durationSeconds}`,
  ]
  return `,${filters.join(',')}`
}
