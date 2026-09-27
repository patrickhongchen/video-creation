import { describe, expect, it } from 'vitest'
import type { NarrationTake } from './narrationTypes'
import { selectTakePlaybackSource } from './takePreviewSelection'

const raw = new Blob(['original'])
const enhanced = new Blob(['enhanced'])
const take = {
  id: 'take-1', createdAt: '2026-09-26T00:00:00Z', durationMs: 1000,
  blob: raw,
} as NarrationTake

describe('take playback source', () => {
  it('uses enhanced audio by default with Standard and original audio for comparison or Off', () => {
    expect(selectTakePlaybackSource(take, 'standard', 'enhanced', enhanced).blob).toBe(enhanced)
    expect(selectTakePlaybackSource(take, 'standard', 'original', enhanced).blob).toBe(raw)
    expect(selectTakePlaybackSource(take, 'off', 'enhanced', enhanced).blob).toBe(raw)
  })

  it('falls back to raw audio while processing or after failure', () => {
    expect(selectTakePlaybackSource(take, 'standard', 'enhanced').blob).toBe(raw)
  })
})
