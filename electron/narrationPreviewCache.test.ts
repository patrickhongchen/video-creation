import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DesktopNarrationPreviewRequest } from '../src/desktop/desktopTypes'
import { NarrationPreviewCache, previewCacheKey } from './narrationPreviewCache'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function directory() {
  const value = await mkdtemp(path.join(os.tmpdir(), 'preview-cache-test-'))
  directories.push(value)
  return value
}

function request(bytes = [1, 2, 3]): DesktopNarrationPreviewRequest {
  return { takeId: 'take-1', mimeType: 'audio/webm', durationMs: 1000, bytes: Uint8Array.from(bytes).buffer }
}

describe('enhanced narration preview cache', () => {
  it('caches a derivative without changing the raw take and invalidates on audio or processing version', async () => {
    const root = await directory()
    let calls = 0
    const processor = async ({ inputPath, outputPath }: { inputPath: string; outputPath: string }) => {
      calls += 1
      expect(await readFile(inputPath)).toEqual(Buffer.from(calls === 2 ? [1, 2, 4] : [1, 2, 3]))
      await writeFile(outputPath, Buffer.from([4, 5, 6]))
      return { gainDb: 2, warning: 'Quiet recording.' }
    }
    const raw = request()
    const original = raw.bytes.slice(0)
    const firstCache = new NarrationPreviewCache(root, 'v1', processor)
    const [first, concurrent] = await Promise.all([firstCache.prepare(raw), firstCache.prepare(raw)])
    expect(new Uint8Array(first.bytes)).toEqual(Uint8Array.from([4, 5, 6]))
    expect(new Uint8Array(concurrent.bytes)).toEqual(new Uint8Array(first.bytes))
    expect(first.warning).toBe('Quiet recording.')
    expect(new Uint8Array(raw.bytes)).toEqual(new Uint8Array(original))
    expect((await firstCache.prepare(raw)).warning).toBe('Quiet recording.')
    expect(calls).toBe(1)
    await firstCache.prepare(request([1, 2, 4]))
    expect(calls).toBe(2)
    const secondCache = new NarrationPreviewCache(root, 'v2', processor)
    await secondCache.prepare(raw)
    expect(calls).toBe(3)
    expect(previewCacheKey(raw, 'v1')).not.toBe(previewCacheKey(raw, 'v2'))
  })

  it('does not cache failed processing and keeps the raw input available', async () => {
    const root = await directory()
    let attempts = 0
    const raw = request()
    const cache = new NarrationPreviewCache(root, 'v1', async () => {
      attempts += 1
      throw new Error('Decoder failed')
    })
    await expect(cache.prepare(raw)).rejects.toThrow('Decoder failed')
    await expect(cache.prepare(raw)).rejects.toThrow('Decoder failed')
    expect(attempts).toBe(2)
    expect(new Uint8Array(raw.bytes)).toEqual(Uint8Array.from([1, 2, 3]))
  })

  it('uses separate source and derivative paths for WAV recordings', async () => {
    const root = await directory()
    const cache = new NarrationPreviewCache(root, 'v1', async ({ inputPath, outputPath }) => {
      expect(inputPath).not.toBe(outputPath)
      expect(await readFile(inputPath)).toEqual(Buffer.from([1, 2, 3]))
      await writeFile(outputPath, Buffer.from([4, 5, 6]))
      return { gainDb: 0 }
    })
    await expect(cache.prepare({ ...request(), mimeType: 'audio/wav' })).resolves.toMatchObject({ warning: undefined })
  })
})
