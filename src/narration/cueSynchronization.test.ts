import { describe, expect, it, vi } from 'vitest'
import { synchronizeSceneCues } from './cueSynchronization'

describe('synchronizeSceneCues', () => {
  it('advances slide callbacks without treating reveal cues as slide changes', () => {
    const onSceneCue = vi.fn()
    const cues = [
      { type: 'slide' as const, sceneId: 'one', timeMs: 0 },
      { type: 'reveal' as const, sceneId: 'one', order: 1, timeMs: 500 },
      { type: 'slide' as const, sceneId: 'two', timeMs: 1000 },
    ]

    const nextCueIndex = synchronizeSceneCues({
      cues,
      timeMs: 600,
      nextCueIndex: 0,
      onSceneCue,
      forceCurrentCue: true,
    })

    expect(onSceneCue).toHaveBeenCalledOnce()
    expect(onSceneCue).toHaveBeenCalledWith('one')
    expect(nextCueIndex).toBe(2)
  })

  it('preserves legacy untyped slide cue callbacks', () => {
    const onSceneCue = vi.fn()
    const nextCueIndex = synchronizeSceneCues({
      cues: [{ sceneId: 'one', timeMs: 0 }, { sceneId: 'two', timeMs: 500 }],
      timeMs: 500,
      nextCueIndex: 1,
      onSceneCue,
    })

    expect(onSceneCue).toHaveBeenCalledWith('two')
    expect(nextCueIndex).toBe(2)
  })
})
