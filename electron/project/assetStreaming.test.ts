import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fileAssetResponse, parseSingleByteRange } from './assetStreaming'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('asset byte ranges', () => {
  it('parses bounded, open-ended, and suffix byte ranges', () => {
    expect(parseSingleByteRange(null, 10)).toBeNull()
    expect(parseSingleByteRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 })
    expect(parseSingleByteRange('bytes=7-', 10)).toEqual({ start: 7, end: 9 })
    expect(parseSingleByteRange('bytes=-4', 10)).toEqual({ start: 6, end: 9 })
    expect(parseSingleByteRange('bytes=20-30', 10)).toBe('invalid')
    expect(parseSingleByteRange('bytes=0-1,4-5', 10)).toBe('invalid')
  })

  it('streams only the requested file range with media headers', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'asset-range-test-'))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, 'clip.mp4')
    await writeFile(filePath, Buffer.from('0123456789'))
    const response = await fileAssetResponse(
      new Request('https://asset.test/clip.mp4', { headers: { Range: 'bytes=3-6' } }),
      filePath,
      'video/mp4',
    )
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 3-6/10')
    expect(response.headers.get('content-length')).toBe('4')
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('3456')
  })

  it('serves an empty externally replaced asset without constructing an invalid stream range', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'empty-asset-test-'))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, 'clip.mp4')
    await writeFile(filePath, Buffer.alloc(0))
    const response = await fileAssetResponse(new Request('https://asset.test/clip.mp4'), filePath, 'video/mp4')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe('0')
    expect((await response.arrayBuffer()).byteLength).toBe(0)
  })
})
