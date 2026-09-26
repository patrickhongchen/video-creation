import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { demoPresentation } from '../../src/demoPresentation'
import { createAudioTimeline } from './audioTimeline'
import type { DesktopExportJob } from './types'

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
  it('keeps the raw Off path with the original take bytes, trim, pad, and silence', async () => {
    await withTimeline(timelineJob('off'), async (timeline) => {
      expect(timeline.inputArgs).toHaveLength(2)
      expect(await readFile(timeline.inputArgs[1])).toEqual(Buffer.from([1, 2, 3]))
      expect(timeline.filterComplex).toContain('atrim=duration=1.000000,apad=pad_dur=1.000000,atrim=duration=1.000000')
      expect(timeline.filterComplex).toContain('anullsrc=r=48000:cl=stereo:d=0.500000')
      expect(timeline.filterComplex).toContain('anullsrc=r=48000:cl=stereo:d=0.250000')
      expect(timeline.filterComplex).toContain('concat=n=3:v=0:a=1[aout]')
      expect(timeline.filterComplex).not.toContain('loudnorm=')
    })
  })

  it('applies Standard once after section and silence concatenation, preserving total duration', async () => {
    await withTimeline(timelineJob('standard'), (timeline) => {
      expect(timeline.filterComplex).toContain('concat=n=3:v=0:a=1,apad=pad_dur=0.050,highpass=f=80,afftdn=nr=6:nf=-50,acompressor=threshold=0.1:ratio=3:attack=20:release=250:detection=rms,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_rates=48000:channel_layouts=stereo,atrim=start=0.025:duration=1.750000,asetpts=PTS-STARTPTS,apad=pad_dur=1.750000,atrim=duration=1.750000[aout]')
    })
  })

  it('leaves a wholly silent program on the original silence path', async () => {
    await withTimeline(timelineJob('standard', false), (timeline) => {
      expect(timeline.inputArgs).toEqual([])
      expect(timeline.filterComplex).toContain('concat=n=2:v=0:a=1[aout]')
      expect(timeline.filterComplex).not.toContain('highpass=')
    })
  })
})
