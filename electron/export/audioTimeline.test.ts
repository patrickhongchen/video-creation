import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { demoPresentation } from '../../src/demoPresentation'
import { createAudioTimeline } from './audioTimeline'
import type { DesktopExportJob } from './types'

const audioMocks = vi.hoisted(() => ({ processTake: vi.fn(), runFfmpeg: vi.fn(), master: vi.fn() }))

vi.mock('./narrationTakeProcessor', () => ({ processNarrationTake: audioMocks.processTake }))
vi.mock('./narrationLoudness', () => ({
  runAudioFfmpeg: audioMocks.runFfmpeg,
  masterNarrationProgram: audioMocks.master,
}))

function timelineJob(mode: 'off' | 'standard', narration = true): DesktopExportJob {
  const sceneId = demoPresentation.slides[0].id
  return {
    jobId: 'audio-timeline-test',
    presentation: {
      schemaVersion: 2,
      id: demoPresentation.id,
      title: demoPresentation.title,
      slides: demoPresentation.slides.map((slide) => ({ id: slide.id })),
      voiceEnhance: mode,
    },
    segments: [
      ...(narration ? [{
        type: 'narration' as const,
        sectionId: 'opening',
        title: 'Opening',
        sceneIds: [sceneId],
        durationMs: 1_000,
        cues: [{ type: 'slide' as const, sceneId, timeMs: 0 }],
        audio: { takeId: 'take', mimeType: 'audio/wav', bytes: Uint8Array.from([1, 2, 3]) },
      }] : []),
      { type: 'silent-scene' as const, sceneId, durationMs: 500 },
    ],
    finalHoldMs: 250,
    totalDurationMs: narration ? 1_750 : 750,
    suggestedBaseName: 'test',
    editorViewportWidth: 1280,
  }
}

async function withTimeline(job: DesktopExportJob, check: (timeline: Awaited<ReturnType<typeof createAudioTimeline>>) => Promise<void> | void) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'narration-timeline-'))
  try {
    await check(await createAudioTimeline(job, directory))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('narration export timeline', () => {
  beforeEach(() => {
    audioMocks.processTake.mockReset().mockResolvedValue({ gainDb: 4 })
    audioMocks.runFfmpeg.mockReset().mockResolvedValue('')
    audioMocks.master.mockReset().mockResolvedValue({ normalized: true })
  })

  it('preserves raw bytes while leveling Off takes and assembling exact gaps', async () => {
    await withTimeline(timelineJob('off'), async (timeline) => {
      expect(await readFile(timeline.rawInputPaths[0])).toEqual(Buffer.from([1, 2, 3]))
      expect(audioMocks.processTake).toHaveBeenCalledWith(expect.objectContaining({ mode: 'off', durationMs: 1_000 }))
      const assembleArgs = audioMocks.runFfmpeg.mock.calls[0][0] as string[]
      const filter = assembleArgs[assembleArgs.indexOf('-filter_complex') + 1]
      expect(filter).toContain('atrim=duration=1.000000,apad=pad_dur=1.000000,atrim=duration=1.000000')
      expect(filter).toContain('anullsrc=r=48000:cl=stereo:d=0.500000')
      expect(filter).toContain('anullsrc=r=48000:cl=stereo:d=0.250000')
      expect(filter).toContain('concat=n=3:v=0:a=1[aout]')
      expect(audioMocks.master).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 1_750, whollySilent: false }))
      expect(timeline.normalized).toBe(true)
    })
  })

  it('uses the shared Standard take processor before whole-program mastering', async () => {
    await withTimeline(timelineJob('standard'), () => {
      expect(audioMocks.processTake).toHaveBeenCalledWith(expect.objectContaining({ mode: 'standard' }))
      expect(audioMocks.processTake.mock.invocationCallOrder[0]).toBeLessThan(audioMocks.master.mock.invocationCallOrder[0])
    })
  })

  it('skips loudness normalization for a known wholly silent program', async () => {
    audioMocks.master.mockResolvedValue({ normalized: false })
    await withTimeline(timelineJob('standard', false), (timeline) => {
      expect(audioMocks.processTake).not.toHaveBeenCalled()
      expect(audioMocks.master).toHaveBeenCalledWith(expect.objectContaining({ whollySilent: true }))
      expect(timeline.normalized).toBe(false)
    })
  })
})
