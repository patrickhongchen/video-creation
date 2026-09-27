import { describe, expect, it } from 'vitest'
import { finalLoudnormFilter, parseLoudnormMeasurement } from './narrationLoudness'

describe('narration loudness', () => {
  it('parses loudnorm JSON measurements from FFmpeg diagnostics', () => {
    const measurement = parseLoudnormMeasurement(`noise\n{
      "input_i": "-20.12", "input_tp": "-4.50", "input_lra": "2.30",
      "input_thresh": "-30.50", "target_offset": "0.42"
    }\nmore noise`)
    expect(measurement).toEqual({
      inputIntegratedLufs: -20.12,
      inputTruePeakDb: -4.5,
      inputLoudnessRange: 2.3,
      inputThreshold: -30.5,
      targetOffset: 0.42,
    })
  })

  it('recognizes digital silence and builds measured final -14 LUFS normalization', () => {
    expect(parseLoudnormMeasurement(`{
      "input_i": "-inf", "input_tp": "-inf", "input_lra": "0.00",
      "input_thresh": "-70.00", "target_offset": "0.00"
    }`)).toBeNull()
    const filter = finalLoudnormFilter({
      inputIntegratedLufs: -19,
      inputTruePeakDb: -5,
      inputLoudnessRange: 3,
      inputThreshold: -29,
      targetOffset: 0.2,
    })
    expect(filter).toContain('loudnorm=I=-14:TP=-1.5:LRA=7')
    expect(filter).toContain('measured_I=-19:measured_TP=-5:measured_LRA=3:measured_thresh=-29:offset=0.2')
  })
})
