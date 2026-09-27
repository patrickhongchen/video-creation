import { link, mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DesktopNarrationTakeWrite } from '../../src/desktop/desktopTypes'
import type { NarrationCaptionTrack } from '../../src/narration/narrationTypes'
import { createBlankPresentation } from '../../src/presentationFactories'
import { PortableNarrationStore, validateNarrationAudioPath } from './portableNarrationStore'
import { ProjectStore } from './projectStore'

const temporaryDirectories: string[] = []
const projectStores: ProjectStore[] = []

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'portable-narration-test-'))
  temporaryDirectories.push(directory)
  return directory
}

async function fixture() {
  const root = path.join(await temporaryDirectory(), 'project')
  const projects = new ProjectStore({ watchFactory: () => ({ close() {} }) })
  projectStores.push(projects)
  const presentation = createBlankPresentation('Narration test')
  const project = await projects.createAt(root, presentation)
  return {
    root,
    projects,
    projectId: project.projectId,
    presentationId: presentation.id,
    store: new PortableNarrationStore(projects),
  }
}

function take(
  presentationId: string,
  id = 'take-one',
  sectionId = 'section-one',
  selected = true,
): DesktopNarrationTakeWrite {
  return {
    id,
    presentationId,
    sectionId,
    createdAt: '2026-09-27T12:00:00.000Z',
    durationMs: 1_500,
    mimeType: 'audio/webm;codecs=opus',
    cues: [
      { type: 'slide', sceneId: 'slide-one', timeMs: 0 },
      { type: 'reveal', sceneId: 'slide-one', order: 1, timeMs: 800 },
    ],
    pointerTrack: [
      { sceneId: 'slide-one', timeMs: 400, x: 0.25, y: 0.75, visible: true },
      { sceneId: 'slide-one', timeMs: 900, x: 0.25, y: 0.75, visible: false },
    ],
    selected,
    invalidated: false,
    bytes: Uint8Array.from([0, 1, 2, 254, 255]).buffer,
  }
}

function captions(): NarrationCaptionTrack {
  return {
    version: 1,
    provider: 'whisper.cpp',
    model: 'medium.en',
    generatedAt: '2026-09-27T12:05:00.000Z',
    segments: [
      { id: 'caption-two', startMs: 700, endMs: 1_400, generatedText: 'Disney plus grew.', text: 'Disney+ grew.' },
      { id: 'caption-one', startMs: 0, endMs: 650, generatedText: 'First sentence.', text: 'First sentence.' },
    ],
  }
}

afterEach(async () => {
  for (const store of projectStores.splice(0)) store.close()
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('PortableNarrationStore', () => {
  it('creates a versioned manifest and round-trips audio, cues, pointers, flags, and selection', async () => {
    const value = await fixture()
    expect(await value.store.status(value.projectId, value.presentationId)).toEqual({ exists: false })

    await value.store.store(value.projectId, take(value.presentationId))

    expect(await value.store.status(value.projectId, value.presentationId)).toEqual({ exists: true })
    const manifest = JSON.parse(await readFile(path.join(value.root, 'narration', 'manifest.json'), 'utf8'))
    expect(manifest).toMatchObject({
      version: 1,
      presentationId: value.presentationId,
      takes: [{
        id: 'take-one',
        sectionId: 'section-one',
        mimeType: 'audio/webm;codecs=opus',
        selected: true,
        invalidated: false,
        audioPath: expect.stringMatching(/^takes\/take-.+\.webm$/),
      }],
    })
    expect(manifest.takes[0]).not.toHaveProperty('presentationId')
    expect(manifest.takes[0]).not.toHaveProperty('bytes')
    expect(manifest.takes[0]).not.toHaveProperty('storageError')

    const listed = await value.store.list(value.projectId, value.presentationId, 'section-one')
    expect(listed).toHaveLength(1)
    expect([...new Uint8Array(listed[0].bytes!)]).toEqual([0, 1, 2, 254, 255])
    expect(listed[0].cues).toEqual(take(value.presentationId).cues)
    expect(listed[0].pointerTrack).toEqual(take(value.presentationId).pointerTrack)
    expect(listed[0]).toMatchObject({ selected: true, invalidated: false })
    expect(await value.store.get(value.projectId, value.presentationId, 'take-one')).toEqual(listed[0])
  })

  it('loads the same recording after moving and reopening the Project folder', async () => {
    const value = await fixture()
    await value.store.store(value.projectId, take(value.presentationId))
    await value.store.setCaptions(value.projectId, value.presentationId, 'take-one', captions())
    const destination = path.join(await temporaryDirectory(), 'moved-project')
    await rename(value.root, destination)

    const reopenedProjects = new ProjectStore({ watchFactory: () => ({ close() {} }) })
    projectStores.push(reopenedProjects)
    const reopened = await reopenedProjects.openAt(destination)
    const listed = await new PortableNarrationStore(reopenedProjects)
      .list(reopened.projectId, value.presentationId, 'section-one')
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      id: 'take-one', selected: true, cues: take(value.presentationId).cues,
      pointerTrack: take(value.presentationId).pointerTrack,
      captions: {
        ...captions(),
        segments: [captions().segments[1], captions().segments[0]],
      },
    })
    expect([...new Uint8Array(listed[0].bytes!)]).toEqual([0, 1, 2, 254, 255])
  })

  it('updates and removes captions without changing take metadata or audio', async () => {
    const value = await fixture()
    await value.store.store(value.projectId, take(value.presentationId))
    const manifestPath = path.join(value.root, 'narration', 'manifest.json')
    const before = JSON.parse(await readFile(manifestPath, 'utf8'))
    const audioBefore = await readFile(path.join(value.root, 'narration', before.takes[0].audioPath))

    await value.store.setCaptions(value.projectId, value.presentationId, 'take-one', captions())

    const withCaptions = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(withCaptions.takes[0]).toEqual({
      ...before.takes[0],
      captions: {
        ...captions(),
        segments: [captions().segments[1], captions().segments[0]],
      },
    })
    expect([...await readFile(path.join(value.root, 'narration', withCaptions.takes[0].audioPath))])
      .toEqual([...audioBefore])
    expect((await value.store.get(value.projectId, value.presentationId, 'take-one'))?.captions)
      .toEqual(withCaptions.takes[0].captions)

    await value.store.setCaptions(value.projectId, value.presentationId, 'take-one', null)
    const withoutCaptions = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(withoutCaptions.takes[0]).toEqual(before.takes[0])
    expect(await readFile(path.join(value.root, 'narration', withoutCaptions.takes[0].audioPath)))
      .toEqual(audioBefore)
  })

  it('rejects captions for missing takes and invalid caption metadata', async () => {
    const value = await fixture()
    await value.store.store(value.projectId, take(value.presentationId))
    await expect(value.store.setCaptions(value.projectId, value.presentationId, 'missing-take', captions()))
      .rejects.toThrow(/no longer exists/)

    const invalidTracks = [
      { ...captions(), provider: 'remote-service' },
      { ...captions(), generatedAt: 'not-a-date' },
      { ...captions(), segments: [{ ...captions().segments[0], endMs: 0 }] },
      { ...captions(), segments: [{ ...captions().segments[0], text: '   ' }] },
      { ...captions(), segments: [captions().segments[0], { ...captions().segments[0] }] },
      { ...captions(), segments: [{ ...captions().segments[0], endMs: 3_000 }] },
    ]
    for (const track of invalidTracks) {
      await expect(value.store.setCaptions(
        value.projectId,
        value.presentationId,
        'take-one',
        track as NarrationCaptionTrack,
      )).rejects.toThrow(/caption/i)
    }
    expect((await value.store.get(value.projectId, value.presentationId, 'take-one'))?.captions).toBeUndefined()
  })

  it('removes persisted caption metadata when its take is deleted', async () => {
    const value = await fixture()
    await value.store.store(value.projectId, take(value.presentationId))
    await value.store.setCaptions(value.projectId, value.presentationId, 'take-one', captions())
    const manifestPath = path.join(value.root, 'narration', 'manifest.json')
    const before = JSON.parse(await readFile(manifestPath, 'utf8'))
    const audioPath = path.join(value.root, 'narration', before.takes[0].audioPath)

    await value.store.delete(value.projectId, value.presentationId, 'take-one')

    expect(JSON.parse(await readFile(manifestPath, 'utf8')).takes).toEqual([])
    await expect(readFile(audioPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('serializes concurrent mutations, enforces one selection, and persists invalidation', async () => {
    const value = await fixture()
    await Promise.all([
      value.store.store(value.projectId, take(value.presentationId, 'take-one', 'section-one', true)),
      value.store.store(value.projectId, take(value.presentationId, 'take-two', 'section-one', true)),
    ])

    let listed = await value.store.list(value.projectId, value.presentationId, 'section-one')
    expect(listed.map(({ id }) => id).sort()).toEqual(['take-one', 'take-two'])
    expect(listed.filter(({ selected }) => selected).map(({ id }) => id)).toEqual(['take-two'])

    await Promise.all([
      value.store.setCaptions(value.projectId, value.presentationId, 'take-one', captions()),
      value.store.select(value.projectId, value.presentationId, 'section-one', 'take-one'),
    ])
    await value.store.invalidate(value.projectId, value.presentationId, 'section-one')
    listed = await value.store.list(value.projectId, value.presentationId, 'section-one')
    expect(listed.find(({ id }) => id === 'take-one')).toMatchObject({
      selected: true,
      invalidated: true,
      captions: { segments: expect.any(Array) },
    })
    expect(listed.find(({ id }) => id === 'take-two')).toMatchObject({ selected: false, invalidated: true })

    await value.store.delete(value.projectId, value.presentationId, 'take-one')
    expect((await value.store.list(value.projectId, value.presentationId, 'section-one')).map(({ id }) => id)).toEqual(['take-two'])
    await value.store.deleteSection(value.projectId, value.presentationId, 'section-one')
    expect(await value.store.list(value.projectId, value.presentationId, 'section-one')).toEqual([])
    expect(await value.store.status(value.projectId, value.presentationId)).toEqual({ exists: true })
  })

  it('deletes all managed presentation takes while preserving an authoritative empty manifest', async () => {
    const value = await fixture()
    await value.store.store(value.projectId, take(value.presentationId))
    await value.store.deletePresentation(value.projectId, value.presentationId)

    const manifest = JSON.parse(await readFile(path.join(value.root, 'narration', 'manifest.json'), 'utf8'))
    expect(manifest.takes).toEqual([])
    expect(await readdir(path.join(value.root, 'narration', 'takes'))).toEqual([])
    expect(await value.store.status(value.projectId, value.presentationId)).toEqual({ exists: true })
  })

  it('rejects traversal, malformed manifests, duplicate IDs, and presentation mismatches', async () => {
    expect(() => validateNarrationAudioPath('../outside.webm')).toThrow(/safe relative path/)
    expect(() => validateNarrationAudioPath('takes/../../outside.webm')).toThrow(/safe relative path/)
    expect(() => validateNarrationAudioPath('/tmp/outside.webm')).toThrow(/safe relative path/)
    expect(() => validateNarrationAudioPath('takes\\outside.webm')).toThrow(/safe relative path/)

    const value = await fixture()
    const narrationRoot = path.join(value.root, 'narration')
    await mkdir(narrationRoot)
    await writeFile(path.join(narrationRoot, 'manifest.json'), '{ bad json')
    await expect(value.store.list(value.projectId, value.presentationId, 'section-one')).rejects.toThrow(/Could not parse/)

    const duplicate = {
      version: 1,
      presentationId: value.presentationId,
      takes: [
        { ...take(value.presentationId), audioPath: 'takes/one.webm', bytes: undefined },
        { ...take(value.presentationId), audioPath: 'takes/two.webm', bytes: undefined },
      ],
    }
    await writeFile(path.join(narrationRoot, 'manifest.json'), JSON.stringify(duplicate))
    await expect(value.store.list(value.projectId, value.presentationId, 'section-one')).rejects.toThrow(/duplicate take id/)

    const missingAudioPath = { ...duplicate, takes: [{ ...duplicate.takes[0], audioPath: undefined }] }
    await writeFile(path.join(narrationRoot, 'manifest.json'), JSON.stringify(missingAudioPath))
    await expect(value.store.list(value.projectId, value.presentationId, 'section-one')).rejects.toThrow(/safe relative path/)

    const duplicateAudioPath = {
      ...duplicate,
      takes: [
        { ...duplicate.takes[0], id: 'take-one' },
        { ...duplicate.takes[0], id: 'take-two' },
      ],
    }
    await writeFile(path.join(narrationRoot, 'manifest.json'), JSON.stringify(duplicateAudioPath))
    await expect(value.store.list(value.projectId, value.presentationId, 'section-one')).rejects.toThrow(/duplicate audio path/)

    await writeFile(path.join(narrationRoot, 'manifest.json'), JSON.stringify({ ...duplicate, presentationId: 'other-presentation', takes: [] }))
    await expect(value.store.status(value.projectId, value.presentationId)).rejects.toThrow(/different presentation/)
  })

  it('accepts version 1 manifests created before caption tracks existed', async () => {
    const value = await fixture()
    await value.store.store(value.projectId, take(value.presentationId))
    const loaded = await value.store.get(value.projectId, value.presentationId, 'take-one')
    expect(loaded).toBeDefined()
    expect(loaded).not.toHaveProperty('captions')
  })

  it('returns missing or replaced audio as an unusable take without preventing manifest reads', async () => {
    const value = await fixture()
    await value.store.store(value.projectId, take(value.presentationId))
    const manifest = JSON.parse(await readFile(path.join(value.root, 'narration', 'manifest.json'), 'utf8'))
    const audioFile = path.join(value.root, 'narration', manifest.takes[0].audioPath)
    await unlink(audioFile)

    let listed = await value.store.list(value.projectId, value.presentationId, 'section-one')
    expect(listed[0]).toMatchObject({ bytes: null, storageError: 'The recorded audio file is missing.' })

    const outside = path.join(await temporaryDirectory(), 'outside.webm')
    await writeFile(outside, Uint8Array.from([9]))
    await symlink(outside, audioFile)
    listed = await value.store.list(value.projectId, value.presentationId, 'section-one')
    expect(listed[0].bytes).toBeNull()
    expect(listed[0].storageError).toMatch(/not a regular file/)
  })

  it('treats an empty audio file as unusable and refuses to select unavailable audio', async () => {
    const value = await fixture()
    await value.store.store(value.projectId, take(value.presentationId))
    const manifest = JSON.parse(await readFile(path.join(value.root, 'narration', 'manifest.json'), 'utf8'))
    const audioFile = path.join(value.root, 'narration', manifest.takes[0].audioPath)
    await unlink(audioFile)
    await writeFile(audioFile, new Uint8Array())

    const listed = await value.store.list(value.projectId, value.presentationId, 'section-one')
    expect(listed[0]).toMatchObject({ bytes: null, storageError: expect.stringMatching(/empty/) })
    await expect(value.store.select(value.projectId, value.presentationId, 'section-one', 'take-one'))
      .rejects.toThrow(/empty/)
  })

  it('rejects hard-linked audio during hydration and selection', async () => {
    const value = await fixture()
    await value.store.store(value.projectId, take(value.presentationId))
    const manifest = JSON.parse(await readFile(path.join(value.root, 'narration', 'manifest.json'), 'utf8'))
    const audioFile = path.join(value.root, 'narration', manifest.takes[0].audioPath)
    const outside = path.join(await temporaryDirectory(), 'outside.webm')
    await unlink(audioFile)
    await writeFile(outside, Uint8Array.from([4, 5, 6]))
    await link(outside, audioFile)

    const listed = await value.store.list(value.projectId, value.presentationId, 'section-one')
    expect(listed[0]).toMatchObject({ bytes: null, storageError: expect.stringMatching(/hard links/) })
    await expect(value.store.select(value.projectId, value.presentationId, 'section-one', 'take-one'))
      .rejects.toThrow(/hard links/)
    expect([...new Uint8Array(await readFile(outside))]).toEqual([4, 5, 6])
  })

  it('rejects a narration directory symlink even when its target exists', async () => {
    const value = await fixture()
    const outside = await temporaryDirectory()
    await symlink(outside, path.join(value.root, 'narration'))
    await expect(value.store.store(value.projectId, take(value.presentationId))).rejects.toThrow(/regular directory/)
    expect(await readdir(outside)).toEqual([])
  })

  it('never follows a crafted takes symlink while deleting manifest entries', async () => {
    const value = await fixture()
    const narrationRoot = path.join(value.root, 'narration')
    const outside = await temporaryDirectory()
    await mkdir(narrationRoot)
    await writeFile(path.join(outside, 'outside.webm'), Uint8Array.from([1, 2, 3]))
    await symlink(outside, path.join(narrationRoot, 'takes'))
    const source = take(value.presentationId)
    await writeFile(path.join(narrationRoot, 'manifest.json'), JSON.stringify({
      version: 1,
      presentationId: value.presentationId,
      takes: [{
        id: source.id,
        sectionId: source.sectionId,
        createdAt: source.createdAt,
        durationMs: source.durationMs,
        mimeType: source.mimeType,
        audioPath: 'takes/outside.webm',
        cues: source.cues,
        pointerTrack: source.pointerTrack,
        selected: source.selected,
      }],
    }))

    await expect(value.store.delete(value.projectId, value.presentationId, source.id)).rejects.toThrow(/regular directory/)
    expect([...new Uint8Array(await readFile(path.join(outside, 'outside.webm')))]).toEqual([1, 2, 3])
  })

  it('migrates once with a single manifest commit and never merges into portable data', async () => {
    const value = await fixture()
    const first = take(value.presentationId, 'legacy-one')
    const second = { ...take(value.presentationId, 'legacy-two', 'section-one', false), bytes: Uint8Array.from([7, 8, 9]).buffer }
    await value.store.migrate(value.projectId, value.presentationId, [first, second])

    expect((await value.store.list(value.projectId, value.presentationId, 'section-one')).map(({ id }) => id).sort())
      .toEqual(['legacy-one', 'legacy-two'])
    await value.store.migrate(value.projectId, value.presentationId, [take(value.presentationId, 'late-legacy')])
    expect((await value.store.list(value.projectId, value.presentationId, 'section-one')).map(({ id }) => id).sort())
      .toEqual(['legacy-one', 'legacy-two'])
    expect((await readdir(path.join(value.root, 'narration'))).filter((name) => name.includes('.tmp'))).toEqual([])
  })

  it('retries an interrupted migration identified by its durable marker', async () => {
    const value = await fixture()
    const legacy = [
      take(value.presentationId, 'legacy-one'),
      take(value.presentationId, 'legacy-two', 'section-two'),
    ]
    let writes = 0
    const failing = new PortableNarrationStore(value.projects, {
      writeAudio: async (filePath, bytes) => {
        writes += 1
        if (writes === 2) throw new Error('simulated audio write failure')
        await writeFile(filePath, bytes, { flag: 'wx', mode: 0o600 })
      },
    })
    await expect(failing.migrate(value.projectId, value.presentationId, legacy))
      .rejects.toThrow(/simulated audio write failure/)

    const narrationRoot = path.join(value.root, 'narration')
    expect(JSON.parse(await readFile(path.join(narrationRoot, '.migration.json'), 'utf8')))
      .toEqual({ version: 1, presentationId: value.presentationId })
    expect(await readdir(path.join(narrationRoot, 'takes'))).toHaveLength(1)
    expect(await value.store.status(value.projectId, value.presentationId)).toEqual({ exists: false })

    await value.store.migrate(value.projectId, value.presentationId, legacy)
    expect((await value.store.list(value.projectId, value.presentationId, 'section-one')).map(({ id }) => id))
      .toEqual(['legacy-one'])
    expect((await value.store.list(value.projectId, value.presentationId, 'section-two')).map(({ id }) => id))
      .toEqual(['legacy-two'])
    expect(await readdir(path.join(narrationRoot, 'takes'))).toHaveLength(3)
    await expect(readFile(path.join(narrationRoot, '.migration.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('validates an entire migration before writing audio and treats orphan data as portable', async () => {
    const value = await fixture()
    const invalid = { ...take(value.presentationId, 'bad'), sectionId: '../outside' }
    await expect(value.store.migrate(value.projectId, value.presentationId, [take(value.presentationId), invalid]))
      .rejects.toThrow(/safe non-empty identifier/)
    const narrationRoot = path.join(value.root, 'narration')
    expect(await readdir(narrationRoot)).toEqual([])

    await mkdir(path.join(narrationRoot, 'takes'))
    await writeFile(path.join(narrationRoot, 'takes', 'orphan.webm'), Uint8Array.from([1]))
    expect(await value.store.status(value.projectId, value.presentationId)).toEqual({ exists: true })
    await value.store.migrate(value.projectId, value.presentationId, [take(value.presentationId, 'legacy')])
    expect(await value.store.list(value.projectId, value.presentationId, 'section-one')).toEqual([])
    await expect(readFile(path.join(narrationRoot, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('ignores empty managed directories and Finder metadata when deciding whether to migrate', async () => {
    const value = await fixture()
    const narrationRoot = path.join(value.root, 'narration')
    await mkdir(path.join(narrationRoot, 'takes'), { recursive: true })
    await writeFile(path.join(narrationRoot, '.DS_Store'), new Uint8Array())
    await writeFile(path.join(narrationRoot, 'takes', '.DS_Store'), new Uint8Array())
    expect(await value.store.status(value.projectId, value.presentationId)).toEqual({ exists: false })
    await value.store.migrate(value.projectId, value.presentationId, [take(value.presentationId, 'legacy')])
    expect(await value.store.get(value.projectId, value.presentationId, 'legacy')).toBeDefined()
  })

  it('enforces the active Project identity for every filesystem operation', async () => {
    const value = await fixture()
    await expect(value.store.status('not-the-active-project', value.presentationId))
      .rejects.toThrow(/currently active Project/)
    await expect(value.store.store('not-the-active-project', take(value.presentationId)))
      .rejects.toThrow(/currently active Project/)
    expect(await readdir(value.root)).not.toContain('narration')
  })
})
