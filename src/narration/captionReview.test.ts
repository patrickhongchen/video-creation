import { describe, expect, it } from 'vitest'
import type { NarrationCaptionTrack } from './narrationTypes'
import {
  captionTextsChanged,
  countCaptionEdits,
  isCaptionEdited,
  prepareCaptionUpdate,
  resetAllCaptionTexts,
  resetCaptionText,
  updateCaptionText,
} from './captionReview'

const original: NarrationCaptionTrack = {
  version: 1, provider: 'whisper.cpp', model: 'medium.en', generatedAt: '2026-09-27T00:00:00Z',
  segments: [
    { id: 'one', startMs: 0, endMs: 1000, generatedText: 'Disney plus grew.', text: 'Disney plus grew.' },
    { id: 'two', startMs: 1000, endMs: 2000, generatedText: 'Revenue rose.', text: 'Revenue rose.' },
  ],
}

describe('caption review edits', () => {
  it('counts edited segments and changes only their text', () => {
    const draft = updateCaptionText(original, 'one', 'Disney+ grew.')
    expect(captionTextsChanged(original, draft)).toBe(true)
    expect(isCaptionEdited(draft.segments[0])).toBe(true)
    expect(countCaptionEdits(draft)).toBe(1)
    expect(original.segments[0].text).toBe('Disney plus grew.')
    expect(prepareCaptionUpdate(original, draft)).toEqual({
      ...original,
      segments: [{ ...original.segments[0], text: 'Disney+ grew.' }, original.segments[1]],
    })
  })

  it('resets one or all edits to the generated text', () => {
    const draft = updateCaptionText(updateCaptionText(original, 'one', 'Disney+ grew.'), 'two', 'Revenue climbed.')
    expect(countCaptionEdits(resetCaptionText(draft, 'one'))).toBe(1)
    expect(resetCaptionText(draft, 'one').segments[1].text).toBe('Revenue climbed.')
    expect(resetAllCaptionTexts(draft).segments).toEqual(original.segments)
  })

  it('rejects empty text and changes to original metadata, identities, or timing', () => {
    const segment = original.segments[0]
    for (const altered of [
      { ...original, segments: [{ ...segment, text: '  ' }, original.segments[1]] },
      { ...original, segments: [{ ...segment, generatedText: 'changed' }, original.segments[1]] },
      { ...original, segments: [{ ...segment, startMs: 1 }, original.segments[1]] },
      { ...original, segments: [{ ...segment, id: 'changed' }, original.segments[1]] },
      { ...original, generatedAt: '2026-09-28T00:00:00Z' },
    ]) {
      expect(() => prepareCaptionUpdate(original, altered)).toThrow()
    }
  })

  it('trims only leading and trailing whitespace on save', () => {
    const draft = updateCaptionText(original, 'one', '  Disney+  grew.  ')
    expect(prepareCaptionUpdate(original, draft).segments[0].text).toBe('Disney+  grew.')
    expect(captionTextsChanged(original, updateCaptionText(original, 'one', '  Disney plus grew.  '))).toBe(false)
  })
})
