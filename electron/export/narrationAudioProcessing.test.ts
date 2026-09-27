import { describe, expect, it } from 'vitest'
import {
  FINAL_MASTER_TARGET,
  NARRATION_PROCESSING_VERSION,
  STANDARD_DENOISE_LATENCY_SECONDS,
  TAKE_LEVEL_TARGET,
  VOICE_CLEANUP_FILTERS,
  takePreparationFilters,
} from './narrationAudioProcessing'

describe('narration audio processing definitions', () => {
  it('keeps cleanup, take leveling, and final mastering as separate stages', () => {
    expect(NARRATION_PROCESSING_VERSION).toBeTruthy()
    expect(VOICE_CLEANUP_FILTERS.join(',')).toContain('afftdn=nr=6:nf=-50')
    expect(VOICE_CLEANUP_FILTERS.join(',')).not.toContain('loudnorm')
    expect(TAKE_LEVEL_TARGET).toMatchObject({ integratedLufs: -18, maxGainDb: 9 })
    expect(FINAL_MASTER_TARGET).toEqual({ integratedLufs: -14, truePeakDb: -1.5, loudnessRange: 7 })
  })

  it('compensates Standard denoise latency and keeps Off free of cleanup', () => {
    const standard = takePreparationFilters('standard', 1_250).join(',')
    expect(standard).toContain('afftdn=')
    expect(standard).toContain(`atrim=start=${STANDARD_DENOISE_LATENCY_SECONDS.toFixed(3)}:duration=1.250000`)
    expect(standard).toContain('atrim=duration=1.250000')

    const off = takePreparationFilters('off', 1_250).join(',')
    expect(off).not.toContain('highpass=')
    expect(off).not.toContain('afftdn=')
    expect(off).toContain('atrim=duration=1.250000')
  })
})
