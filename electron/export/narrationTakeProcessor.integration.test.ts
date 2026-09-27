import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))

import { runAudioFfmpeg } from './narrationLoudness'
import { processNarrationTake } from './narrationTakeProcessor'

const directories: string[] = []

function pcmData(wav: Buffer) {
  const marker = wav.indexOf(Buffer.from('data'))
  if (marker < 0) throw new Error('WAV data chunk was not found.')
  const byteLength = wav.readUInt32LE(marker + 4)
  return wav.subarray(marker + 8, marker + 8 + byteLength)
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('processNarrationTake with bundled FFmpeg', () => {
  it('keeps raw bytes untouched and produces latency-compensated exact-duration PCM', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'take-processing-'))
    directories.push(directory)
    const inputPath = path.join(directory, 'raw.wav')
    const outputPath = path.join(directory, 'enhanced.wav')
    await runAudioFfmpeg([
      '-hide_banner', '-loglevel', 'warning', '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=0.8',
      '-c:a', 'pcm_s16le', inputPath,
    ])
    const original = await readFile(inputPath)

    await processNarrationTake({ inputPath, outputPath, durationMs: 1_000, mode: 'standard' })

    expect(await readFile(inputPath)).toEqual(original)
    const data = pcmData(await readFile(outputPath))
    expect(data.length).toBe(48_000 * 2 * 2)
    let firstSignalFrame = -1
    for (let frame = 0; frame < 48_000; frame += 1) {
      if (Math.abs(data.readInt16LE(frame * 4)) > 32) {
        firstSignalFrame = frame
        break
      }
    }
    expect(firstSignalFrame).toBeGreaterThanOrEqual(0)
    expect(firstSignalFrame).toBeLessThan(960) // speech begins within 20 ms after compensation
  }, 20_000)
})
