import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))

import { NARRATION_PROCESSING_VERSION } from './export/narrationAudioProcessing'
import { probeDurationMs } from './export/ffmpeg'
import { runAudioFfmpeg } from './export/narrationLoudness'
import { FinalPreviewAudioCache } from './finalPreviewAudioCache'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('final preview AAC with bundled FFmpeg', () => {
  it('returns a seekable AAC/M4A program near the exact planned duration', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'final-preview-aac-'))
    directories.push(root)
    const sourcePath = path.join(root, 'source.wav')
    await runAudioFfmpeg([
      '-hide_banner', '-loglevel', 'warning', '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
      '-c:a', 'pcm_s16le', sourcePath,
    ])
    const sourceBytes = await import('node:fs/promises').then(({ readFile }) => readFile(sourcePath))
    const cache = new FinalPreviewAudioCache(path.join(root, 'cache'), NARRATION_PROCESSING_VERSION)
    const result = await cache.prepare({
      voiceEnhance: 'standard',
      segments: [
        { type: 'narration', takeId: 'tone', mimeType: 'audio/wav', durationMs: 1_000, bytes: Uint8Array.from(sourceBytes).buffer },
        { type: 'silent-scene', durationMs: 250 },
      ],
      finalHoldMs: 250,
      totalDurationMs: 1_500,
    })
    const previewPath = path.join(root, 'preview.m4a')
    await writeFile(previewPath, Buffer.from(result.bytes))

    expect(result.mimeType).toBe('audio/mp4')
    expect(result.durationMs).toBe(1_500)
    expect(await probeDurationMs(previewPath)).toBeGreaterThanOrEqual(1_490)
    expect(await probeDurationMs(previewPath)).toBeLessThanOrEqual(1_550)
    await expect(runAudioFfmpeg([
      '-hide_banner', '-loglevel', 'warning', '-ss', '0.75', '-i', previewPath,
      '-t', '0.1', '-f', 'null', '-',
    ])).resolves.toBeTypeOf('string')
  }, 20_000)
})
