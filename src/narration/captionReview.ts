import type { NarrationCaptionSegment, NarrationCaptionTrack } from './narrationTypes'

export function isCaptionEdited(segment: NarrationCaptionSegment): boolean {
  return segment.text.trim() !== segment.generatedText.trim()
}

export function countCaptionEdits(track: NarrationCaptionTrack): number {
  return track.segments.filter(isCaptionEdited).length
}

export function updateCaptionText(track: NarrationCaptionTrack, id: string, text: string): NarrationCaptionTrack {
  return {
    ...track,
    segments: track.segments.map((segment) => segment.id === id ? { ...segment, text } : segment),
  }
}

export function resetCaptionText(track: NarrationCaptionTrack, id: string): NarrationCaptionTrack {
  return {
    ...track,
    segments: track.segments.map((segment) => segment.id === id
      ? { ...segment, text: segment.generatedText }
      : segment),
  }
}

export function resetAllCaptionTexts(track: NarrationCaptionTrack): NarrationCaptionTrack {
  return {
    ...track,
    segments: track.segments.map((segment) => ({ ...segment, text: segment.generatedText })),
  }
}

export function captionTextsChanged(original: NarrationCaptionTrack, draft: NarrationCaptionTrack): boolean {
  return original.segments.some((segment, index) => segment.text.trim() !== draft.segments[index]?.text.trim())
}

/** Build a text-only update. The storage boundary repeats these checks for untrusted IPC input. */
export function prepareCaptionUpdate(original: NarrationCaptionTrack, draft: NarrationCaptionTrack): NarrationCaptionTrack {
  if (original.version !== 1 || draft.version !== original.version
    || draft.provider !== original.provider || draft.model !== original.model
    || draft.generatedAt !== original.generatedAt || draft.segments.length !== original.segments.length) {
    throw new Error('Caption track metadata cannot be changed.')
  }
  const segments = draft.segments.map((segment, index) => {
    const previous = original.segments[index]
    if (segment.id !== previous.id || segment.startMs !== previous.startMs
      || segment.endMs !== previous.endMs || segment.generatedText !== previous.generatedText
      || segment.startMs < 0 || segment.endMs <= segment.startMs
      || (index > 0 && segment.startMs < draft.segments[index - 1].startMs)) {
      throw new Error('Caption timing and original transcription cannot be changed.')
    }
    if (typeof segment.text !== 'string' || !segment.text.trim()) {
      throw new Error('Caption text cannot be empty.')
    }
    return { ...previous, text: segment.text.trim() }
  })
  return { ...original, segments }
}
