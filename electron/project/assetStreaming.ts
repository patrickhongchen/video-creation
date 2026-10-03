import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

export interface ByteRange {
  start: number
  end: number
}

export async function hashFile(filePath: string) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) digest.update(chunk as Buffer)
  return digest.digest('hex')
}

export async function readFileHeader(filePath: string, byteLength = 64) {
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(byteLength)
    const result = await handle.read(buffer, 0, byteLength, 0)
    return buffer.subarray(0, result.bytesRead)
  } finally {
    await handle.close()
  }
}

export function parseSingleByteRange(value: string | null, size: number): ByteRange | null | 'invalid' {
  if (value === null) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) return 'invalid'
  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return 'invalid'
    return { start: Math.max(0, size - suffixLength), end: size - 1 }
  }
  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)
    || start < 0 || start >= size || requestedEnd < start) return 'invalid'
  return { start, end: Math.min(requestedEnd, size - 1) }
}

function responseHeaders(mimeType: string, contentLength: number) {
  return {
    'Content-Type': mimeType,
    'Content-Length': String(contentLength),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  }
}

export function bufferAssetResponse(request: Request, bytes: Buffer, mimeType: string) {
  const range = parseSingleByteRange(request.headers.get('range'), bytes.byteLength)
  if (range === 'invalid') return new Response(null, {
    status: 416,
    headers: { 'Content-Range': `bytes */${bytes.byteLength}`, 'Accept-Ranges': 'bytes' },
  })
  if (!range) return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), {
    status: 200,
    headers: responseHeaders(mimeType, bytes.byteLength),
  })
  const part = bytes.subarray(range.start, range.end + 1)
  return new Response(request.method === 'HEAD' ? null : new Uint8Array(part), {
    status: 206,
    headers: {
      ...responseHeaders(mimeType, part.byteLength),
      'Content-Range': `bytes ${range.start}-${range.end}/${bytes.byteLength}`,
    },
  })
}

export async function fileAssetResponse(request: Request, filePath: string, mimeType: string) {
  const info = await stat(filePath)
  if (!info.isFile()) throw new Error('Asset path does not identify a regular file.')
  const range = parseSingleByteRange(request.headers.get('range'), info.size)
  if (range === 'invalid') return new Response(null, {
    status: 416,
    headers: { 'Content-Range': `bytes */${info.size}`, 'Accept-Ranges': 'bytes' },
  })
  if (!range && info.size === 0) return new Response(null, {
    status: 200,
    headers: responseHeaders(mimeType, 0),
  })
  const selected = range ?? { start: 0, end: info.size - 1 }
  const contentLength = selected.end - selected.start + 1
  const body = request.method === 'HEAD'
    ? null
    : Readable.toWeb(createReadStream(filePath, selected)) as ReadableStream<Uint8Array>
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...responseHeaders(mimeType, contentLength),
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${info.size}` } : {}),
    },
  })
}
