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
})
