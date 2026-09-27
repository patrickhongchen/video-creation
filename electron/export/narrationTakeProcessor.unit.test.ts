import { beforeEach, describe, expect, it, vi } from 'vitest'

const loudnessMocks = vi.hoisted(() => ({ measure: vi.fn(), run: vi.fn() }))
vi.mock('./narrationLoudness', () => ({
  measureNarrationLoudness: loudnessMocks.measure,
  runAudioFfmpeg: loudnessMocks.run,
}))

import { processNarrationTake } from './narrationTakeProcessor'

const baseOptions = {
  inputPath: '/tmp/raw-take.wav',
  outputPath: '/tmp/processed-take.wav',
  durationMs: 1_000,
  mode: 'off' as const,
}

function measurement(inputIntegratedLufs: number, inputTruePeakDb: number) {
  return { inputIntegratedLufs, inputTruePeakDb, inputLoudnessRange: 2, inputThreshold: -30, targetOffset: 0 }
}

describe('processNarrationTake gain management', () => {
  beforeEach(() => {
    loudnessMocks.measure.mockReset()
    loudnessMocks.run.mockReset().mockResolvedValue('')
  })

  it('limits unusually quiet recordings to +9 dB', async () => {
    loudnessMocks.measure.mockResolvedValue(measurement(-40, -20))
    const result = await processNarrationTake(baseOptions)
    expect(result.gainDb).toBe(9)
    expect(result.warning).toMatch(/unusually quiet/i)
    expect(loudnessMocks.run.mock.calls[0][0].join(',')).toContain('volume=9.00dB')
  })

  it('converges a normal recording toward -18 LUFS', async () => {
    loudnessMocks.measure.mockResolvedValue(measurement(-21, -10))
    const result = await processNarrationTake(baseOptions)
    expect(result).toEqual({ gainDb: 3 })
    expect(loudnessMocks.run.mock.calls[0][0].join(',')).toContain('volume=3.00dB')
  })

  it('limits gain against the configured safe peak', async () => {
    loudnessMocks.measure.mockResolvedValue(measurement(-20, -2))
    const result = await processNarrationTake(baseOptions)
    expect(result.gainDb).toBe(-1)
    expect(result.warning).toMatch(/clipping/i)
  })

  it('shares Standard cleanup and latency compensation with preview callers', async () => {
    loudnessMocks.measure.mockResolvedValue(measurement(-18, -6))
    await processNarrationTake({ ...baseOptions, mode: 'standard' })
    const measureOptions = loudnessMocks.measure.mock.calls[0][0]
    expect(measureOptions.filters.join(',')).toContain('afftdn=nr=6:nf=-50')
    expect(measureOptions.filters.join(',')).toContain('atrim=start=0.025:duration=1.000000')
  })

  it('refuses to overwrite the raw source', async () => {
    await expect(processNarrationTake({ ...baseOptions, outputPath: baseOptions.inputPath })).rejects.toThrow(/separately/)
    expect(loudnessMocks.run).not.toHaveBeenCalled()
  })
})
