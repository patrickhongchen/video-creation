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
  it('accepts existing jobs without a setting and rejects invalid enhancement values', () => {
    const { voiceEnhance: _previouslyAbsent, ...presentation } = demoPresentation
    expect(() => validateExportJob({ ...silentJob(), presentation })).not.toThrow()
    expect(() => validateExportJob({ ...silentJob(), presentation: { ...demoPresentation, voiceEnhance: 'boosted' } })).toThrow(/Voice Enhance/)
  })
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

  it('accepts pointerless jobs and validates optional narration pointer samples', () => {
    const slideId = demoPresentation.slides[0].id
    const job = {
      ...silentJob(),
      segments: [{
        type: 'narration', sectionId: 'section', title: 'Section', sceneIds: [slideId],
        durationMs: 3_000,
        cues: [{ type: 'slide', sceneId: slideId, timeMs: 0 }],
        pointerTrack: [{ timeMs: 100, sceneId: slideId, x: 0.2, y: 0.8, visible: true }],
        audio: { takeId: 'take', mimeType: 'audio/webm', bytes: new ArrayBuffer(1) },
      }],
    }
    expect(() => validateExportJob(job)).not.toThrow()
    job.segments[0].pointerTrack = [{ timeMs: 3_050, sceneId: slideId, x: 0.2, y: 0.8, visible: true }]
    expect(() => validateExportJob(job)).not.toThrow()

    for (const sample of [
      { timeMs: 3_101, sceneId: slideId, x: 0.2, y: 0.8, visible: true },
      { timeMs: 100, sceneId: 'missing-slide', x: 0.2, y: 0.8, visible: true },
      { timeMs: 100, sceneId: slideId, x: -0.1, y: 0.8, visible: true },
      { timeMs: 100, sceneId: slideId, x: 0.2, y: 1.1, visible: true },
      { timeMs: 100, sceneId: slideId, x: 0.2, y: 0.8, visible: 'yes' },
    ]) {
      ;(job.segments[0] as { pointerTrack?: unknown[] }).pointerTrack = [sample]
      expect(() => validateExportJob(job)).toThrow(/invalid pointer samples/)
    }

    delete (job.segments[0] as { pointerTrack?: unknown }).pointerTrack
    expect(() => validateExportJob(job)).not.toThrow()
  })
})
