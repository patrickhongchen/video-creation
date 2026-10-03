import { describe, expect, it } from 'vitest'
import { clampVideoTimeSeconds } from './videoFrameReadiness'

describe('video frame readiness', () => {
  it('converts requested milliseconds and clamps playback to the clip duration', () => {
    expect(clampVideoTimeSeconds(1250, 8)).toBe(1.25)
    expect(clampVideoTimeSeconds(12_000, 8)).toBe(7.999)
    expect(clampVideoTimeSeconds(8000, 8)).toBe(7.999)
    expect(clampVideoTimeSeconds(-500, 8)).toBe(0)
  })

  it('keeps an unclamped request when metadata has no finite duration yet', () => {
    expect(clampVideoTimeSeconds(2500, Number.NaN)).toBe(2.5)
  })
})
