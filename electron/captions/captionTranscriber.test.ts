import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopNarrationTakeData } from '../../src/desktop/desktopTypes'
import { createBlankPresentation } from '../../src/presentationFactories'
import { PortableNarrationStore } from '../project/portableNarrationStore'
import { ProjectStore } from '../project/projectStore'
import { CaptionTranscriber, parseWhisperCaptions } from './captionTranscriber'

const directories: string[] = []
async function directory() {
  const value = await mkdtemp(path.join(tmpdir(), 'caption-test-'))
  directories.push(value)
  return value
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((value) => rm(value, { recursive: true, force: true })))
})

const whisperJson = JSON.stringify({ transcription: [
  { offsets: { from: 1200, to: 2000 }, text: ' Second sentence. ' },
  { timestamps: { from: '00:00:00,100', to: '00:00:01,100' }, text: ' First sentence. ' },
  { offsets: { from: 0, to: 500 }, text: '   ' },
] })

describe('Whisper caption parsing', () => {
  it('converts timestamp strings to milliseconds, sorts segments, and keeps generated and editable text', () => {
    const segments = parseWhisperCaptions(whisperJson, 2200)
    expect(segments.map(({ startMs, endMs, text, generatedText }) => ({ startMs, endMs, text, generatedText })))
      .toEqual([
        { startMs: 100, endMs: 1100, text: 'First sentence.', generatedText: 'First sentence.' },
        { startMs: 1200, endMs: 2000, text: 'Second sentence.', generatedText: 'Second sentence.' },
      ])
    expect(segments[0].id).toBeTruthy()
  })

  it('rejects malformed JSON and segments with no usable timing', () => {
    expect(() => parseWhisperCaptions('{', 1000)).toThrow(/malformed transcription JSON/)
    expect(() => parseWhisperCaptions('{}', 1000)).toThrow(/no segment array/)
    expect(() => parseWhisperCaptions(JSON.stringify({ transcription: [
      { offsets: { from: -1, to: 100 }, text: 'negative' },
      { offsets: { from: 500, to: 500 }, text: 'zero' },
      { offsets: { from: 0, to: 9000 }, text: 'too long' },
    ] }), 1000)).toThrow(/no usable caption segments/)
  })

  it('clamps a small overrun to the take duration', () => {
    expect(parseWhisperCaptions(JSON.stringify({ transcription: [
      { offsets: { from: 500, to: 1200 }, text: 'End' },
    ] }), 1000)[0]).toMatchObject({ startMs: 500, endMs: 1000 })
  })
})

async function fixture() {
  const root = await directory()
  const executable = path.join(root, 'whisper-cli')
  const model = path.join(root, 'ggml-medium.en.bin')
  const ffmpeg = path.join(root, 'ffmpeg')
  await Promise.all([executable, model, ffmpeg].map((file) => writeFile(file, 'test')))
  const take: DesktopNarrationTakeData = {
    id: 'take', presentationId: 'presentation', sectionId: 'section', createdAt: new Date().toISOString(),
    durationMs: 2200, mimeType: 'audio/webm', cues: [], selected: true, bytes: Uint8Array.from([1, 2, 3]).buffer,
  }
  const saveCaptions = vi.fn(async () => {})
  const calls: string[][] = []
  let workingDirectory = ''
  const runProcess = vi.fn(async (binary: string, args: string[]) => {
    calls.push([binary, ...args])
    if (binary === executable) await writeFile(`${args[args.indexOf('-of') + 1]}.json`, whisperJson)
    return { code: 0, signal: null, stdout: '', stderr: '' }
  })
  const transcriber = new CaptionTranscriber({
    resolveExecutable: () => executable,
    resolveModel: () => model,
    resolveFfmpeg: () => ffmpeg,
    getTake: async () => take,
    saveCaptions,
    runProcess,
    makeTemporaryDirectory: async () => { workingDirectory = await directory(); return workingDirectory },
  })
  return { root, executable, model, ffmpeg, take, saveCaptions, runProcess, calls, transcriber,
    get workingDirectory() { return workingDirectory } }
}

describe('CaptionTranscriber', () => {
  it('converts a take, runs local Whisper, saves captions, and cleans temporary files', async () => {
    const value = await fixture()
    const track = await value.transcriber.transcribe('project', 'presentation', 'take')
    expect(track).toMatchObject({ version: 1, provider: 'whisper.cpp', model: 'medium.en' })
    expect(track.segments).toHaveLength(2)
    expect(value.calls).toHaveLength(2)
    expect(value.calls[0]).toContain('pcm_s16le')
    expect(value.calls[0]).toContain('16000')
    expect(value.calls[1]).toContain('-oj')
    expect(value.saveCaptions).toHaveBeenCalledWith('project', 'presentation', 'take', track)
    await expect(stat(value.workingDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports missing executable and model', async () => {
    const value = await fixture()
    await rm(value.executable)
    await expect(value.transcriber.transcribe('project', 'presentation', 'take')).rejects.toThrow(/Whisper executable is missing/)
    await writeFile(value.executable, 'test')
    await rm(value.model)
    await expect(value.transcriber.transcribe('project', 'presentation', 'take')).rejects.toThrow(/Whisper medium.en model is missing/)
  })

  it('reports FFmpeg and Whisper failures and removes temporary files', async () => {
    const value = await fixture()
    value.runProcess.mockImplementationOnce(async () => ({ code: 1, signal: null, stdout: '', stderr: 'bad audio' }))
    await expect(value.transcriber.transcribe('project', 'presentation', 'take')).rejects.toThrow(/FFmpeg conversion failed.*bad audio/)
    await expect(stat(value.workingDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    value.runProcess.mockImplementationOnce(async () => ({ code: 0, signal: null, stdout: '', stderr: '' }))
      .mockImplementationOnce(async () => ({ code: 2, signal: null, stdout: '', stderr: 'model failed' }))
    await expect(value.transcriber.transcribe('project', 'presentation', 'take')).rejects.toThrow(/Whisper transcription failed.*model failed/)
    await expect(stat(value.workingDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports missing JSON and unavailable take audio', async () => {
    const value = await fixture()
    value.runProcess.mockImplementationOnce(async () => ({ code: 0, signal: null, stdout: '', stderr: '' }))
      .mockImplementationOnce(async () => ({ code: 0, signal: null, stdout: '', stderr: '' }))
    await expect(value.transcriber.transcribe('project', 'presentation', 'take')).rejects.toThrow(/did not create transcription JSON/)
    value.take.bytes = null
    await expect(value.transcriber.transcribe('project', 'presentation', 'take')).rejects.toThrow(/missing or unreadable/)
    expect(value.saveCaptions).not.toHaveBeenCalled()
  })

  it('transcribes a portable take and reloads its saved caption track', async () => {
    const value = await fixture()
    const projects = new ProjectStore({ watchFactory: () => ({ close() {} }) })
    try {
      const presentation = createBlankPresentation('Caption integration')
      const project = await projects.createAt(path.join(value.root, 'project'), presentation)
      const narration = new PortableNarrationStore(projects)
      await narration.store(project.projectId, {
        ...value.take,
        presentationId: presentation.id,
        bytes: Uint8Array.from([1, 2, 3]).buffer,
      })
      const transcriber = new CaptionTranscriber({
        resolveExecutable: () => value.executable,
        resolveModel: () => value.model,
        resolveFfmpeg: () => value.ffmpeg,
        getTake: (projectId, presentationId, takeId) => narration.get(projectId, presentationId, takeId),
        saveCaptions: (projectId, presentationId, takeId, track) => narration.setCaptions(projectId, presentationId, takeId, track),
        runProcess: value.runProcess,
      })
      const track = await transcriber.transcribe(project.projectId, presentation.id, 'take')
      const reloaded = await new PortableNarrationStore(projects).get(project.projectId, presentation.id, 'take')
      expect(reloaded?.captions).toEqual(track)
      expect(reloaded?.selected).toBe(true)
      expect(reloaded?.bytes).toEqual(Uint8Array.from([1, 2, 3]).buffer)
    } finally {
      projects.close()
    }
  })
})
