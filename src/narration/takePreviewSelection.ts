import type { VoiceEnhanceMode } from '../model'
import type { NarrationTake } from './narrationTypes'

export function takePreviewKey(take: NarrationTake) {
  return `${take.id}:${take.createdAt}:${take.blob.size}:${take.durationMs}`
}

export function selectTakePlaybackSource(
  take: NarrationTake,
  voiceEnhance: VoiceEnhanceMode,
  comparisonMode: 'enhanced' | 'original',
  enhancedBlob?: Blob,
) {
  const key = takePreviewKey(take)
  if (voiceEnhance === 'standard' && comparisonMode === 'enhanced' && enhancedBlob) {
    return { blob: enhancedBlob, key: `enhanced:${key}` }
  }
  return { blob: take.blob, key: `original:${key}` }
}
