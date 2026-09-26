import { describe, expect, it } from 'vitest'
import { samplePresentation } from '../samplePresentation'
import type { DesktopExportJob } from '../desktop/desktopTypes'
import { resolvePlaybackVisual } from './resolvePlaybackVisual'

const [firstSlide, secondSlide, thirdSlide] = samplePresentation.slides

const job: Pick<DesktopExportJob, 'presentation' | 'segments'> = {
  presentation: samplePresentation,
  segments: [
    {
      type: 'narration',
      sectionId: 'section-a',
      title: 'Section A',
      sceneIds: [firstSlide.id, secondSlide.id],
      durationMs: 3000,
      cues: [
        { sceneId: firstSlide.id, timeMs: 500 },
        { sceneId: secondSlide.id, timeMs: 1200 },
        { sceneId: firstSlide.id, timeMs: 1800 },
      ],
      audio: { takeId: 'take-a', mimeType: 'audio/webm', bytes: new ArrayBuffer(1) },
    },
    { type: 'silent-scene', sceneId: thirdSlide.id, durationMs: 1000 },
  ],
}

describe('resolvePlaybackVisual', () => {
  it('uses the segment start until the first cue, then resets elapsed time for each cue', () => {
    expect(resolvePlaybackVisual(job, 300)).toMatchObject({ slideIndex: 0, slideElapsedMs: 300 })
    expect(resolvePlaybackVisual(job, 900)).toMatchObject({ slideIndex: 0, slideElapsedMs: 400 })
    expect(resolvePlaybackVisual(job, 1500)).toMatchObject({ slideIndex: 1, slideElapsedMs: 300 })
  })

  it('resets elapsed time when a scene returns and when a new segment begins', () => {
    expect(resolvePlaybackVisual(job, 2000)).toMatchObject({ slideIndex: 0, slideElapsedMs: 200 })
    expect(resolvePlaybackVisual(job, 3000)).toMatchObject({ slideIndex: 2, slideElapsedMs: 0 })
    expect(resolvePlaybackVisual(job, 3500)).toMatchObject({ slideIndex: 2, slideElapsedMs: 500 })
  })
})
