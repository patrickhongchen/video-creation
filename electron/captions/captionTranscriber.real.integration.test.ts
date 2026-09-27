import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBlankPresentation } from '../../src/presentationFactories'
import { PortableNarrationStore } from '../project/portableNarrationStore'
import { ProjectStore } from '../project/projectStore'
import { CaptionTranscriber } from './captionTranscriber'

function command(executable: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: 'ignore' })
    child.once('error', reject)
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${executable} exited ${code}`)))
  })
}

// Opt in on a development Mac. CI never downloads or loads the large model.
describe.skipIf(process.env.RUN_REAL_WHISPER !== '1')('real local Whisper narration', () => {
  it('transcribes and persists a portable spoken take using the installed development paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'real-whisper-caption-'))
    const projects = new ProjectStore({ watchFactory: () => ({ close() {} }) })
    try {
      const spokenPath = process.env.REAL_WHISPER_AUDIO ?? '/Users/patrickchen/GitHub/whisper.cpp/samples/jfk.mp3'
      const webmPath = path.join(root, 'spoken.webm')
      await command(path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg'), [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', spokenPath, '-c:a', 'libopus', webmPath,
      ])
      const presentation = createBlankPresentation('Local captions')
      const project = await projects.createAt(path.join(root, 'project'), presentation)
      const store = new PortableNarrationStore(projects)
      const audio = await readFile(webmPath)
      await store.store(project.projectId, {
        id: 'spoken-take', presentationId: presentation.id, sectionId: 'section',
        createdAt: new Date().toISOString(), durationMs: 15_000, mimeType: 'audio/webm',
        cues: [], selected: true, bytes: Uint8Array.from(audio).buffer,
      })
      const transcriber = new CaptionTranscriber({
        resolveExecutable: () => '/Users/patrickchen/GitHub/whisper.cpp/build/bin/whisper-cli',
        resolveModel: () => '/Users/patrickchen/GitHub/whisper.cpp/models/ggml-medium.en.bin',
        resolveFfmpeg: () => path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg'),
        getTake: (projectId, presentationId, takeId) => store.get(projectId, presentationId, takeId),
        saveCaptions: (projectId, presentationId, takeId, track) => store.setCaptions(projectId, presentationId, takeId, track),
      })
      const track = await transcriber.transcribe(project.projectId, presentation.id, 'spoken-take')
      const reloaded = await new PortableNarrationStore(projects).get(project.projectId, presentation.id, 'spoken-take')
      expect(track.segments.length).toBeGreaterThan(0)
      if (!process.env.REAL_WHISPER_AUDIO) {
        expect(track.segments.map((segment) => segment.text).join(' ')).toMatch(/country|ask/i)
      }
      expect(reloaded?.captions).toEqual(track)
      const audioPath = path.join(root, 'project', 'narration', 'takes')
      const [audioFile] = await readdir(audioPath)
      const audioBefore = await stat(path.join(audioPath, audioFile))
      const corrected = {
        ...track,
        segments: track.segments.map((segment, index) => index === 0
          ? { ...segment, text: `${segment.text} corrected` }
          : segment),
      }
      await store.setCaptions(project.projectId, presentation.id, 'spoken-take', corrected, true)
      const afterEdit = await new PortableNarrationStore(projects).get(project.projectId, presentation.id, 'spoken-take')
      expect(afterEdit?.captions?.segments[0].text).toBe(`${track.segments[0].text} corrected`)
      expect(afterEdit?.captions?.segments[0].generatedText).toBe(track.segments[0].generatedText)
      expect(await stat(path.join(audioPath, audioFile))).toMatchObject({
        ino: audioBefore.ino, mtimeMs: audioBefore.mtimeMs, size: audioBefore.size,
      })
    } finally {
      projects.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 300_000)
})
