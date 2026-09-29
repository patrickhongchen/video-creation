import { describe, expect, it } from 'vitest'
import { resolveCaptionAtTime } from './resolveNarrationCaption'
import type { NarrationCaptionTrack } from './narrationTypes'

const track: NarrationCaptionTrack = {
  version: 1, provider: 'whisper.cpp', model: 'medium.en', generatedAt: '2026-09-27T00:00:00.000Z',
  segments: [
    { id: 'one', startMs: 100, endMs: 400, generatedText: 'Disney plus.', text: 'Disney+.' },
    { id: 'two', startMs: 600, endMs: 900, generatedText: 'Next.', text: 'Next.' },
  ],
}

describe('resolveCaptionAtTime', () => {
  it('uses inclusive starts and exclusive ends with gaps', () => {
    expect(resolveCaptionAtTime(track, 99)).toBeNull()
    expect(resolveCaptionAtTime(track, 100)?.text).toBe('Disney+.')
    expect(resolveCaptionAtTime(track, 250)?.text).toBe('Disney+.')
    expect(resolveCaptionAtTime(track, 400)).toBeNull()
    expect(resolveCaptionAtTime(track, 599)).toBeNull()
    expect(resolveCaptionAtTime(track, 600)?.id).toBe('two')
    expect(resolveCaptionAtTime(track, 900)).toBeNull()
  })

  it('returns corrected text without falling back to generated text', () => {
    expect(resolveCaptionAtTime(track, 150)).toMatchObject({ text: 'Disney+.', generatedText: 'Disney plus.' })
    expect(resolveCaptionAtTime(undefined, 150)).toBeNull()
    expect(resolveCaptionAtTime(track, Number.NaN)).toBeNull()
  })
})
