import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { NarrationCaptionSegment, NarrationCaptionTrack } from '../../src/narration/narrationTypes'
import type { DesktopNarrationTakeData } from '../../src/desktop/desktopTypes'

type ProcessResult = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }
type RunProcess = (executable: string, args: string[]) => Promise<ProcessResult>

interface CaptionTranscriberOptions {
  resolveExecutable: () => string
  resolveModel: () => string | Promise<string>
  resolveFfmpeg: () => string
  getTake: (projectId: string, presentationId: string, takeId: string) => Promise<DesktopNarrationTakeData | undefined>
  saveCaptions: (projectId: string, presentationId: string, takeId: string, track: NarrationCaptionTrack) => Promise<void>
  runProcess?: RunProcess
  makeTemporaryDirectory?: () => Promise<string>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function timestampMs(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value)
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) return null
  return ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4])
}

/** whisper.cpp JSON offsets are milliseconds; timestamps are a compatible fallback. */
export function parseWhisperCaptions(json: string, durationMs: number): NarrationCaptionSegment[] {
  let document: unknown
  try { document = JSON.parse(json) } catch { throw new Error('Whisper returned malformed transcription JSON.') }
  if (!isObject(document) || !Array.isArray(document.transcription)) {
    throw new Error('Whisper transcription JSON has no segment array.')
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Narration take duration is invalid.')
  const toleranceMs = Math.max(2_000, Math.min(5_000, durationMs * 0.05))
  const segments: NarrationCaptionSegment[] = []
  for (const item of document.transcription) {
    if (!isObject(item) || typeof item.text !== 'string') continue
    const text = item.text.trim()
    if (!text) continue
    const offsets = isObject(item.offsets) ? item.offsets : null
    const timestamps = isObject(item.timestamps) ? item.timestamps : null
    const startMs = typeof offsets?.from === 'number' ? offsets.from : timestampMs(timestamps?.from)
    const rawEndMs = typeof offsets?.to === 'number' ? offsets.to : timestampMs(timestamps?.to)
    if (startMs === null || rawEndMs === null || !Number.isFinite(startMs) || !Number.isFinite(rawEndMs)
      || startMs < 0 || rawEndMs <= startMs || startMs >= durationMs || rawEndMs > durationMs + toleranceMs) continue
    const endMs = Math.min(rawEndMs, durationMs)
    if (endMs <= startMs) continue
    segments.push({ id: randomUUID(), startMs, endMs, generatedText: text, text })
  }
  segments.sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
  if (segments.length === 0) throw new Error('Whisper returned no usable caption segments.')
  return segments
}

export async function runCaptionProcess(executable: string, args: string[]): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    const append = (current: string, chunk: Buffer) => (current + chunk.toString('utf8')).slice(-16_384)
    child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk) })
    child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk) })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

function processFailure(label: string, result: ProcessResult): Error {
  const detail = result.stderr.trim() || result.stdout.trim()
  return new Error(`${label} failed (exit ${result.code ?? result.signal ?? 'unknown'})${detail ? `: ${detail.slice(-1_200)}` : '.'}`)
}

async function assertFile(filePath: string, label: string) {
  try {
    await access(filePath)
    if (!(await stat(filePath)).isFile()) throw new Error('not a file')
  } catch {
    throw new Error(`${label} is missing: ${filePath}`)
  }
}

export class CaptionTranscriber {
  private active = false
  private readonly runProcess: RunProcess
  private readonly makeTemporaryDirectory: () => Promise<string>

  constructor(private readonly options: CaptionTranscriberOptions) {
    this.runProcess = options.runProcess ?? runCaptionProcess
    this.makeTemporaryDirectory = options.makeTemporaryDirectory ?? (() => mkdtemp(path.join(tmpdir(), 'ai-presentation-captions-')))
  }

  async transcribe(projectId: string, presentationId: string, takeId: string): Promise<NarrationCaptionTrack> {
    if (this.active) throw new Error('Another take is already generating captions. Wait for it to finish.')
    this.active = true
    let workDirectory: string | undefined
    try {
      const take = await this.options.getTake(projectId, presentationId, takeId)
      if (!take) throw new Error('The narration take no longer exists.')
      if (take.storageError || !take.bytes || take.bytes.byteLength === 0) {
        throw new Error(take.storageError ?? 'The narration take audio is missing or unreadable.')
      }
      const executable = this.options.resolveExecutable()
      const model = await this.options.resolveModel()
      const ffmpeg = this.options.resolveFfmpeg()
      await assertFile(executable, 'Whisper executable')
      await assertFile(model, 'Whisper medium.en model')
      await assertFile(ffmpeg, 'FFmpeg executable')
      workDirectory = await this.makeTemporaryDirectory()
      const inputPath = path.join(workDirectory, 'input.audio')
      const wavPath = path.join(workDirectory, 'input.wav')
      const outputBase = path.join(workDirectory, 'transcription')
      await writeFile(inputPath, new Uint8Array(take.bytes))
      let result: ProcessResult
      try {
        result = await this.runProcess(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
          '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath])
      } catch (error) {
        throw new Error(`FFmpeg conversion failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (result.code !== 0) throw processFailure('FFmpeg conversion', result)
      try {
        result = await this.runProcess(executable, ['-m', model, '-f', wavPath, '-l', 'en', '-ng', '-oj', '-of', outputBase])
      } catch (error) {
        throw new Error(`Whisper execution failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (result.code !== 0) throw processFailure('Whisper transcription', result)
      let json: string
      try { json = await readFile(`${outputBase}.json`, 'utf8') } catch { throw new Error('Whisper did not create transcription JSON.') }
      const track: NarrationCaptionTrack = {
        version: 1,
        provider: 'whisper.cpp',
        model: 'medium.en',
        generatedAt: new Date().toISOString(),
        segments: parseWhisperCaptions(json, take.durationMs),
      }
      await this.options.saveCaptions(projectId, presentationId, takeId, track)
      return track
    } finally {
      try {
        if (workDirectory) await rm(workDirectory, { recursive: true, force: true })
      } finally {
        this.active = false
      }
    }
  }
}
