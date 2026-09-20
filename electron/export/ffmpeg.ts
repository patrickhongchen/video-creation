import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { app } from 'electron'

export function resolveFfmpegPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg')
  const require = createRequire(__filename)
  const ffmpegStaticPath = require('ffmpeg-static') as string | null
  if (!ffmpegStaticPath) throw new Error('The bundled FFmpeg binary could not be resolved.')
  return ffmpegStaticPath.replace('app.asar', 'app.asar.unpacked')
}

export function spawnFfmpeg(args: string[]): ChildProcessWithoutNullStreams {
  return spawn(resolveFfmpegPath(), args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

export async function waitForSpawn(child: ChildProcessWithoutNullStreams) {
  if (child.pid !== undefined) return
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
}

export async function waitForExit(child: ChildProcessWithoutNullStreams, stderr: { value: string }) {
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  if (result.code !== 0) {
    const detail = stderr.value.trim().split('\n').slice(-12).join('\n')
    throw new Error(`FFmpeg stopped before the video was complete${detail ? `:\n${detail}` : '.'}`)
  }
}

export async function probeDurationMs(outputPath: string, signal?: AbortSignal) {
  const child = spawnFfmpeg(['-hide_banner', '-i', outputPath])
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => { stderr += chunk })
  const cancel = () => child.kill('SIGKILL')
  signal?.addEventListener('abort', cancel, { once: true })
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', () => resolve())
  }).finally(() => signal?.removeEventListener('abort', cancel))
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) throw new Error('FFmpeg could not verify the exported video duration.')
  const [, hours, minutes, seconds] = match
  return (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000
}
