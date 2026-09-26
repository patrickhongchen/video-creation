import { describe, expect, it } from 'vitest'
import { demoPresentation } from '../../src/demoPresentation'
import { validateExportJob } from './validation'

function silentJob() {
  const slide = demoPresentation.slides[0]
  return {
    jobId: 'job-v2',
    presentation: demoPresentation,
    segments: [{ type: 'silent-scene' as const, sceneId: slide.id, durationMs: 3_000 }],
    finalHoldMs: 500,
    totalDurationMs: 3_500,
    suggestedBaseName: 'demo',
    editorViewportWidth: 1280,
  }
}

describe('desktop export schema v2 boundary', () => {
  it('accepts a canonical slide presentation and slide-referencing playback plan', () => {
    expect(() => validateExportJob(silentJob())).not.toThrow()
  })

  it('rejects legacy schema and unknown slide references', () => {
    const legacy: unknown = {
      ...silentJob(),
      presentation: { ...demoPresentation, schemaVersion: 1 },
    }
    expect(() => validateExportJob(legacy)).toThrow(/invalid or unsupported/)

    const unknownSlide = silentJob()
    unknownSlide.segments[0].sceneId = 'missing-slide'
    expect(() => validateExportJob(unknownSlide)).toThrow(/unknown slide/)
  })

  it('accepts typed reveal cues and rejects invalid reveal orders', () => {
    const slideId = demoPresentation.slides[0].id
    const job = {
      ...silentJob(),
      segments: [{
        type: 'narration', sectionId: 'section', title: 'Section', sceneIds: [slideId],
        durationMs: 3_000,
        cues: [
          { type: 'slide', sceneId: slideId, timeMs: 0 },
          { type: 'reveal', sceneId: slideId, order: 2, timeMs: 1_000 },
        ],
        audio: { takeId: 'take', mimeType: 'audio/webm', bytes: new ArrayBuffer(1) },
      }],
    }
    expect(() => validateExportJob(job)).not.toThrow()
    job.segments[0].cues[1].order = 0
    expect(() => validateExportJob(job)).toThrow(/invalid narration cues/)
  })
})
