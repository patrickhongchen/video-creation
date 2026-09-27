import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))

import { FINAL_MASTER_TARGET } from './narrationAudioProcessing'
import { masterNarrationProgram, measureNarrationLoudness, runAudioFfmpeg } from './narrationLoudness'

const directories: string[] = []

function pcmByteLength(wav: Buffer) {
  const marker = wav.indexOf(Buffer.from('data'))
  if (marker < 0) throw new Error('WAV data chunk was not found.')
  return wav.readUInt32LE(marker + 4)
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('whole-program loudness mastering with bundled FFmpeg', () => {
  it('measures, applies the final target, and preserves exact duration', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'program-mastering-'))
    directories.push(directory)
    const inputPath = path.join(directory, 'assembled.wav')
    const outputPath = path.join(directory, 'mastered.wav')
    await runAudioFfmpeg([
      '-hide_banner', '-loglevel', 'warning', '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=3',
      '-af', 'volume=0.05', '-c:a', 'pcm_s16le', inputPath,
    ])

    const result = await masterNarrationProgram({ inputPath, outputPath, durationMs: 3_000 })
    const outputMeasurement = await measureNarrationLoudness({
      inputPath: outputPath,
      integratedLufs: FINAL_MASTER_TARGET.integratedLufs,
      truePeakDb: FINAL_MASTER_TARGET.truePeakDb,
      loudnessRange: FINAL_MASTER_TARGET.loudnessRange,
    })

    expect(result.normalized).toBe(true)
    expect(outputMeasurement?.inputIntegratedLufs).toBeCloseTo(-14, 0)
    expect(pcmByteLength(await readFile(outputPath))).toBe(3 * 48_000 * 2 * 2)
  }, 20_000)
})
