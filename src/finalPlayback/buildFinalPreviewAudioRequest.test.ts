import { describe, expect, it } from 'vitest'
import type { FinalPlaybackPlan } from './finalPlaybackTypes'
import { buildFinalPreviewAudioRequest } from './buildFinalPreviewAudioRequest'

describe('final preview audio request', () => {
  it('passes untouched take bytes and the exact export timeline without visual data', async () => {
    const blob = new Blob([Uint8Array.from([1, 2, 3])], { type: 'audio/webm' })
    const plan = {
      segments: [
        { type: 'narration', durationMs: 1000, take: { id: 'take-1', mimeType: 'audio/webm', blob } },
        { type: 'silent-scene', durationMs: 500 },
      ],
      finalHoldMs: 500,
      totalDurationMs: 2000,
    } as FinalPlaybackPlan

    const request = await buildFinalPreviewAudioRequest(plan, 'standard')
    expect(request).toMatchObject({ voiceEnhance: 'standard', finalHoldMs: 500, totalDurationMs: 2000 })
    expect(request.segments[0]).toMatchObject({ type: 'narration', takeId: 'take-1', durationMs: 1000 })
    expect(request.segments[1]).toEqual({ type: 'silent-scene', durationMs: 500 })
    expect(new Uint8Array((request.segments[0] as Extract<typeof request.segments[number], { type: 'narration' }>).bytes))
      .toEqual(Uint8Array.from([1, 2, 3]))
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3]))
  })
})
