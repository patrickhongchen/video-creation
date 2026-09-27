import type { VoiceEnhanceMode } from '../model'
import type { DesktopFinalPreviewAudioRequest } from '../desktop/desktopTypes'
import type { FinalPlaybackPlan } from './finalPlaybackTypes'

/** Send only raw take audio and timing; visual assets stay in the renderer. */
export async function buildFinalPreviewAudioRequest(
  plan: FinalPlaybackPlan,
  voiceEnhance: VoiceEnhanceMode,
): Promise<DesktopFinalPreviewAudioRequest> {
  const segments = await Promise.all(plan.segments.map(async (segment) => segment.type === 'silent-scene'
    ? { type: 'silent-scene' as const, durationMs: segment.durationMs }
    : {
        type: 'narration' as const,
        takeId: segment.take.id,
        mimeType: segment.take.mimeType,
        durationMs: segment.durationMs,
        bytes: await segment.take.blob.arrayBuffer(),
      }))
  return {
    voiceEnhance,
    segments,
    finalHoldMs: plan.finalHoldMs,
    totalDurationMs: plan.totalDurationMs,
  }
}
