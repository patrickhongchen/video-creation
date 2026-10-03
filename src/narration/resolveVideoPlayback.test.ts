import { describe, expect, it } from 'vitest'
import { resolveVideoPlaybackAtTime } from './resolveVideoPlayback'
import type { SceneCue } from './narrationTypes'

describe('video timing against narration', () => {
  const cues: SceneCue[] = [
    { type: 'slide', sceneId: 'one', timeMs: 0 },
    { type: 'slide', sceneId: 'video', timeMs: 1000 },
    { type: 'video', sceneId: 'video', timeMs: 3000, action: 'pause', positionMs: 2000 },
    { type: 'video', sceneId: 'video', timeMs: 7000, action: 'resume', positionMs: 2000 },
    { type: 'slide', sceneId: 'one', timeMs: 10000 },
    { type: 'slide', sceneId: 'video', timeMs: 12000 },
  ]

  it('starts footage when its slide is entered', () => {
    expect(resolveVideoPlaybackAtTime(cues, 2500, 'video')).toEqual({ timeMs: 1500, playing: true })
  })
  it('holds footage while narration and pointer time continue', () => {
    expect(resolveVideoPlaybackAtTime(cues, 6500, 'video')).toEqual({ timeMs: 2000, playing: false })
    expect(resolveVideoPlaybackAtTime(cues, 8000, 'video')).toEqual({ timeMs: 3000, playing: true })
  })
  it('restarts on a return visit and supports seeking backwards', () => {
    expect(resolveVideoPlaybackAtTime(cues, 12500, 'video')).toEqual({ timeMs: 500, playing: true })
    expect(resolveVideoPlaybackAtTime(cues, 4000, 'video')).toEqual({ timeMs: 2000, playing: false })
  })
  it('keeps legacy takes playable with no clip controls', () => {
    expect(resolveVideoPlaybackAtTime([{ sceneId: 'video', timeMs: 800 }], 1300, 'video'))
      .toEqual({ timeMs: 500, playing: true })
  })
})
