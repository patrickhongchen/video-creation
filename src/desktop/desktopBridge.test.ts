import { describe, expect, it } from 'vitest'
import { samplePresentation } from '../samplePresentation'
import { buildFinalPlaybackPlan } from '../finalPlayback/buildFinalPlaybackPlan'
import { resolvePlaybackVisual } from '../finalPlayback/resolvePlaybackVisual'
import type { NarrationTake } from '../narration/narrationTypes'
import { buildDesktopExportJob, desktopSegmentsFromFinalPlan } from './desktopBridge'

describe('buildDesktopExportJob', () => {
  it('keeps a selected take pointer track through the final plan and export frame', async () => {
    const slide = samplePresentation.slides[0]
    const section = { id: 'section-pointer', title: 'Pointer section', slideIds: [slide.id] }
    const presentation = { ...samplePresentation, slides: [slide], narration: { sections: [section] } }
    const take: NarrationTake = {
      id: 'take-pointer', presentationId: presentation.id, sectionId: section.id,
      createdAt: '2026-01-01T00:00:00.000Z', durationMs: 1000,
      mimeType: 'audio/webm', cues: [{ type: 'slide', sceneId: slide.id, timeMs: 0 }],
      pointerTrack: [{ timeMs: 100, sceneId: slide.id, x: 0.4, y: 0.6, visible: true }],
      selected: true, blob: new Blob([Uint8Array.from([1])], { type: 'audio/webm' }),
    }
    const plan = buildFinalPlaybackPlan(presentation, { [section.id]: [take] })
    expect(plan.isReady).toBe(true)
    const job = await buildDesktopExportJob({
      jobId: 'job-pointer', presentation, editorViewportWidth: 1440,
      finalHoldMs: plan.finalHoldMs, totalDurationMs: plan.totalDurationMs,
      suggestedBaseName: 'pointer', segments: desktopSegmentsFromFinalPlan(plan),
    })
    expect(job.segments[0].type === 'narration' && job.segments[0].pointerTrack).toEqual(take.pointerTrack)
    expect(resolvePlaybackVisual(job, 200).pointerState).toEqual({ x: 0.4, y: 0.6, opacity: 100 / 180 })
  })

  it('carries narration pointer samples into the desktop renderer job', async () => {
    const pointerTrack = [
      { timeMs: 100, sceneId: samplePresentation.slides[0].id, x: 0.25, y: 0.75, visible: true },
      { timeMs: 400, sceneId: samplePresentation.slides[0].id, x: 0.25, y: 0.75, visible: false },
    ]
    const job = await buildDesktopExportJob({
      jobId: 'job-a',
      presentation: samplePresentation,
      editorViewportWidth: 1440,
      finalHoldMs: 500,
      totalDurationMs: 1000,
      suggestedBaseName: 'pointer-export',
      segments: [{
        type: 'narration',
        sectionId: 'section-a',
        title: 'Section A',
        sceneIds: [samplePresentation.slides[0].id],
        durationMs: 1000,
        cues: [{ sceneId: samplePresentation.slides[0].id, timeMs: 0 }],
        pointerTrack,
        takeId: 'take-a',
        mimeType: 'audio/webm',
        blob: new Blob([Uint8Array.from([1, 2, 3])]),
      }],
    })

    expect(job.segments[0]).toMatchObject({
      type: 'narration',
      pointerTrack,
      audio: { takeId: 'take-a', mimeType: 'audio/webm' },
    })
    expect(job.segments[0].type === 'narration' && [...new Uint8Array(job.segments[0].audio.bytes)]).toEqual([1, 2, 3])
  })
})
