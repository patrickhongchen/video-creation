import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopFinalPreviewAudioRequest } from '../src/desktop/desktopTypes'
import {
  FinalPreviewAudioCache,
  finalPreviewAudioCacheKey,
  finalPreviewAudioRequestFromExportJob,
  validateFinalPreviewAudioRequest,
} from './finalPreviewAudioCache'
import type { AudioTimeline } from './export/audioTimeline'
import type { DesktopExportJob } from './export/types'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function directory() {
  const value = await mkdtemp(path.join(os.tmpdir(), 'final-preview-cache-test-'))
  directories.push(value)
  return value
}

function request(bytes = [1, 2, 3], mode: 'off' | 'standard' = 'standard'): DesktopFinalPreviewAudioRequest {
  return {
    voiceEnhance: mode,
    segments: [
      {
        type: 'narration', takeId: 'take-1', mimeType: 'audio/wav', durationMs: 1_000,
        bytes: Uint8Array.from(bytes).buffer,
      },
      { type: 'silent-scene', durationMs: 500 },
    ],
    finalHoldMs: 250,
    totalDurationMs: 1_750,
  }
}

describe('final preview audio cache', () => {
  it('shares one mastered WAV between preview and export while AAC encoding is active', async () => {
    const root = await directory()
    let builds = 0
    let releaseEncoding!: () => void
    const encodingStarted = new Promise<void>((resolve) => {
      releaseEncoding = resolve
    })
    let encodingMayFinish!: () => void
    const encodingGate = new Promise<void>((resolve) => {
      encodingMayFinish = resolve
    })
    const buildTimeline = vi.fn(async (job: DesktopExportJob, workDirectory: string): Promise<AudioTimeline> => {
      builds += 1
      const narration = job.segments[0]
      expect(narration.type === 'narration' && Buffer.from(narration.audio.bytes as ArrayBuffer)).toEqual(Buffer.from([1, 2, 3]))
      const audioPath = path.join(workDirectory, 'mastered.wav')
      await writeFile(audioPath, Buffer.from('mastered'))
      return { audioPath, rawInputPaths: [], takeResults: [{ gainDb: 3, warning: 'Quiet recording.' }], normalized: true }
    })
    const encode = vi.fn(async (inputPath: string, outputPath: string) => {
      expect(await readFile(inputPath)).toEqual(Buffer.from('mastered'))
      releaseEncoding()
      await encodingGate
      await writeFile(outputPath, Buffer.from('seekable-aac'))
    })
    const cache = new FinalPreviewAudioCache(root, 'v1', buildTimeline, encode)

    const preview = cache.prepare(request())
    await encodingStarted
    const mastered = await cache.prepareMastered(request())
    expect(await readFile(mastered.audioPath)).toEqual(Buffer.from('mastered'))
    expect(mastered.warnings).toEqual(['Quiet recording.'])
    expect(builds).toBe(1)
    encodingMayFinish()
    const result = await preview
    expect(new Uint8Array(result.bytes)).toEqual(Uint8Array.from(Buffer.from('seekable-aac')))
    expect(result).toMatchObject({ mimeType: 'audio/mp4', durationMs: 1_750, warnings: ['Quiet recording.'] })

    await cache.prepare(request())
    await cache.prepareMastered(request())
    expect(builds).toBe(1)
    expect(encode).toHaveBeenCalledTimes(1)
    expect((await readdir(root)).some((entry) => entry.endsWith('.wav'))).toBe(true)
  })

  it('keys derivatives by source bytes, timing, mode, and processing version', () => {
    const initial = request()
    const key = finalPreviewAudioCacheKey(initial, 'v1')
    expect(finalPreviewAudioCacheKey(request([1, 2, 4]), 'v1')).not.toBe(key)
    expect(finalPreviewAudioCacheKey(request([1, 2, 3], 'off'), 'v1')).not.toBe(key)
    expect(finalPreviewAudioCacheKey({ ...initial, finalHoldMs: 251, totalDurationMs: 1_751 }, 'v1')).not.toBe(key)
    expect(finalPreviewAudioCacheKey(initial, 'v2')).not.toBe(key)
  })

  it('strictly rejects malformed and visually expanded IPC payloads', () => {
    expect(() => validateFinalPreviewAudioRequest({ ...request(), extra: true })).toThrow(/Invalid final preview/)
    expect(() => validateFinalPreviewAudioRequest({ ...request(), totalDurationMs: 1_752 })).toThrow(/does not match/)
    expect(() => validateFinalPreviewAudioRequest({
      ...request(),
      segments: [{ type: 'silent-scene', durationMs: 1_500, sceneId: 'visual-field' }],
    })).toThrow(/invalid silent/)
    expect(() => validateFinalPreviewAudioRequest({
      ...request(),
      segments: [{
        type: 'narration', takeId: 'take', mimeType: 'text/plain', durationMs: 1_500,
        bytes: new ArrayBuffer(1),
      }],
    })).toThrow(/invalid narration/)
  })

  it('derives the identical minimal request from an export job', () => {
    const source = request()
    const job = {
      jobId: 'job',
      presentation: { schemaVersion: 2, id: 'p', title: 'P', slides: [], voiceEnhance: source.voiceEnhance },
      segments: [
        {
          type: 'narration' as const, sectionId: 's', title: 'S', sceneIds: [], cues: [], durationMs: 1_000,
          audio: { takeId: 'take-1', mimeType: 'audio/wav', bytes: source.segments[0].type === 'narration' ? source.segments[0].bytes : new ArrayBuffer(0) },
        },
        { type: 'silent-scene' as const, sceneId: 'slide', durationMs: 500 },
      ],
      finalHoldMs: 250,
      totalDurationMs: 1_750,
      editorViewportWidth: 1280,
      suggestedBaseName: 'p',
    } satisfies DesktopExportJob
    expect(finalPreviewAudioRequestFromExportJob(job)).toEqual(source)
    expect(finalPreviewAudioCacheKey(finalPreviewAudioRequestFromExportJob(job), 'v1')).toBe(finalPreviewAudioCacheKey(source, 'v1'))
  })

  it('lets export cancellation return promptly without racing shared cache cleanup', async () => {
    const root = await directory()
    let releaseBuild!: () => void
    const buildGate = new Promise<void>((resolve) => { releaseBuild = resolve })
    let markBuildStarted!: () => void
    const buildStarted = new Promise<void>((resolve) => { markBuildStarted = resolve })
    const cache = new FinalPreviewAudioCache(root, 'v1', async (_job, workDirectory) => {
      markBuildStarted()
      await buildGate
      const audioPath = path.join(workDirectory, 'mastered.wav')
      await writeFile(audioPath, Buffer.from('mastered'))
      return { audioPath, rawInputPaths: [], takeResults: [], normalized: true }
    }, async () => undefined)
    const controller = new AbortController()
    const cancelled = cache.prepareMastered(request(), controller.signal)
    await buildStarted
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })

    releaseBuild()
    await expect(cache.prepareMastered(request())).resolves.toMatchObject({ warnings: [] })
    expect((await readdir(root)).some((entry) => entry.endsWith('.work'))).toBe(false)
  })

  it('does not schedule mastering for an already cancelled export', async () => {
    const root = await directory()
    const buildTimeline = vi.fn()
    const cache = new FinalPreviewAudioCache(root, 'v1', buildTimeline, vi.fn())
    const controller = new AbortController()
    controller.abort()
    await expect(cache.prepareMastered(request(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(buildTimeline).not.toHaveBeenCalled()
  })
})
