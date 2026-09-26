import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Presentation } from '../../src/model'
import type { DesktopProjectExternalChange } from '../../src/desktop/desktopTypes'
import { createBlankPresentation } from '../../src/presentationFactories'
import { ProjectStore, validateAssetRelativePath } from './projectStore'

const temporaryDirectories: string[] = []
const openStores: ProjectStore[] = []
const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'video-project-test-'))
  temporaryDirectories.push(directory)
  return directory
}

class ControlledWatchers {
  private readonly registrations: Array<{
    directory: string
    listener: (eventType: string, filename: string | Buffer | null) => void
    closed: boolean
  }> = []

  readonly factory = (
    directory: string,
    listener: (eventType: string, filename: string | Buffer | null) => void,
  ) => {
    const registration = { directory, listener, closed: false }
    this.registrations.push(registration)
    return { close: () => { registration.closed = true } }
  }

  emit(directory: string, filename: string | null) {
    for (const registration of this.registrations) {
      if (!registration.closed && registration.directory === directory) {
        registration.listener('rename', filename)
      }
    }
  }

  isWatching(directory: string) {
    return this.registrations.some((registration) => !registration.closed && registration.directory === directory)
  }
}

function watcherStore(watchers: ControlledWatchers, maximumReadAttempts = 2) {
  const store = new ProjectStore({
    watchFactory: watchers.factory,
    debounceMs: 1,
    stabilizationMs: 1,
    retryDelayMs: 4,
    maximumReadAttempts,
  })
  openStores.push(store)
  return store
}

async function waitFor(predicate: () => boolean, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for watcher event.')
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

function presentationWithDataAsset(): Presentation {
  const presentation = createBlankPresentation('Portable Project')
  presentation.imageAssets = [{
    id: 'hero-art',
    name: 'Hero Art',
    mimeType: 'image/svg+xml',
    source: `data:image/svg+xml,${encodeURIComponent(svgBytes.toString('utf8'))}`,
  }]
  presentation.slides[0].elements.push({
    id: 'hero-image',
    type: 'image',
    name: 'Hero',
    assetId: 'hero-art',
    fit: 'contain',
    frame: { x: 100, y: 200, width: 880, height: 600 },
  })
  return presentation
}

function projectStore() {
  const store = new ProjectStore({ watchFactory: () => ({ close() {} }) })
  openStores.push(store)
  return store
}

afterEach(async () => {
  for (const store of openStores.splice(0)) store.close()
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('ProjectStore', () => {
  it('creates the plain folder format and migrates data URLs to canonical relative assets', async () => {
    const parent = await temporaryDirectory()
    const root = path.join(parent, 'portable-project')
    const store = projectStore()
    const project = await store.createAt(root, presentationWithDataAsset())

    expect((await readdir(root)).sort()).toEqual(['AGENTS.md', 'assets', 'presentation.json'])
    const instructions = await readFile(path.join(root, 'AGENTS.md'), 'utf8')
    expect(instructions).toContain('one main communication idea per Slide')
    expect(instructions).toContain('npm run validate-project')
    expect(await readdir(path.join(root, 'assets'))).toEqual(['hero-art.svg'])
    expect(project.presentation.imageAssets?.[0]).toMatchObject({
      id: 'hero-art',
      path: 'assets/hero-art.svg',
      source: expect.stringMatching(/^ves-asset:\/\/project\//),
    })

    const source = await readFile(path.join(root, 'presentation.json'), 'utf8')
    expect(source.endsWith('\n')).toBe(true)
    expect(source).toContain('\n  "schemaVersion": 2,')
    expect(source).toContain('"path": "assets/hero-art.svg"')
    expect(source).not.toContain('data:image')
    expect(source).not.toContain('ves-asset:')
  })

  it('does not replace existing Project instructions when creating a Project', async () => {
    const root = path.join(await temporaryDirectory(), 'with-instructions')
    await mkdir(root)
    await writeFile(path.join(root, 'AGENTS.md'), '# My custom instructions\n')
    await projectStore().createAt(root, createBlankPresentation())
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe('# My custom instructions\n')
  })

  it('rejects traversal and malformed Project JSON without replacing the active Project', async () => {
    expect(() => validateAssetRelativePath('../secret.png')).toThrow(/safe project-relative/)
    expect(() => validateAssetRelativePath('assets/../../secret.png')).toThrow(/safe project-relative/)
    expect(() => validateAssetRelativePath('/tmp/secret.png')).toThrow(/safe project-relative/)
    expect(() => validateAssetRelativePath('assets\\secret.png')).toThrow(/safe project-relative/)

    const parent = await temporaryDirectory()
    const validRoot = path.join(parent, 'valid')
    const invalidRoot = path.join(parent, 'invalid')
    const store = projectStore()
    const active = await store.createAt(validRoot, createBlankPresentation())
    await mkdir(invalidRoot)
    await writeFile(path.join(invalidRoot, 'presentation.json'), '{ not json')

    await expect(store.openAt(invalidRoot)).rejects.toThrow(/Could not parse presentation\.json/)
    expect(store.activeProjectId).toBe(active.projectId)
  })

  it('rejects Project asset extensions that do not match their declared MIME type', async () => {
    const parent = await temporaryDirectory()
    const root = path.join(parent, 'invalid-mime')
    const presentation = presentationWithDataAsset()
    presentation.imageAssets![0] = {
      ...presentation.imageAssets![0],
      path: 'assets/hero.png',
      source: undefined,
    }
    await mkdir(root)
    await writeFile(path.join(root, 'presentation.json'), JSON.stringify(presentation))

    await expect(projectStore().openAt(root)).rejects.toThrow(/extension does not match image\/svg\+xml/)
  })

  it('reports referenced missing assets and remains portable after moving the folder', async () => {
    const parent = await temporaryDirectory()
    const originalRoot = path.join(parent, 'original')
    const movedRoot = path.join(parent, 'moved')
    const firstStore = projectStore()
    await firstStore.createAt(originalRoot, presentationWithDataAsset())
    await rename(originalRoot, movedRoot)

    const moved = await projectStore().openAt(movedRoot)
    expect(moved.missingAssets).toEqual([])
    expect(moved.presentation.imageAssets?.[0].source).toContain(moved.projectId)

    await unlink(path.join(movedRoot, 'assets', 'hero-art.svg'))
    const missingStore = projectStore()
    const missing = await missingStore.openAt(movedRoot)
    expect(missing.missingAssets).toEqual([expect.objectContaining({
      assetId: 'hero-art',
      path: 'assets/hero-art.svg',
      slideIds: [missing.presentation.slides[0].id],
    })])
    expect(missing.presentation.imageAssets?.[0].source).toBeUndefined()
    await expect(missingStore.assertRequiredAssetsAvailable(missing.presentation)).rejects.toThrow(/references missing asset/)
  })

  it('treats asset symlinks that escape the Project root as unavailable', async () => {
    const parent = await temporaryDirectory()
    const root = path.join(parent, 'project')
    const outside = path.join(parent, 'outside.svg')
    await writeFile(outside, svgBytes)
    const store = projectStore()
    const project = await store.createAt(root, presentationWithDataAsset())
    const assetPath = path.join(root, 'assets', 'hero-art.svg')
    await unlink(assetPath)
    await symlink(outside, assetPath)

    const reopened = await projectStore().openAt(root)
    expect(reopened.missingAssets[0]?.message).toContain('Slide 1 ("Blank slide") references missing asset')
    await expect(store.resolveProtocolAsset(project.projectId, 'assets/hero-art.svg')).rejects.toThrow(/escapes/)
  })

  it('detects external edits and only overwrites them when explicitly requested', async () => {
    const parent = await temporaryDirectory()
    const root = path.join(parent, 'conflict')
    const store = projectStore()
    const project = await store.createAt(root, createBlankPresentation('Original'))
    const edited = { ...project.presentation, title: 'My edit' }
    await writeFile(path.join(root, 'presentation.json'), `${JSON.stringify({ ...project.presentation, title: 'External edit' }, null, 2)}\n`)

    const conflict = await store.save(project.projectId, edited)
    expect(conflict).toMatchObject({ status: 'conflict', diskHash: expect.any(String) })
    expect(JSON.parse(await readFile(path.join(root, 'presentation.json'), 'utf8')).title).toBe('External edit')

    const saved = await store.save(project.projectId, edited, true)
    expect(saved.status).toBe('saved')
    expect(JSON.parse(await readFile(path.join(root, 'presentation.json'), 'utf8')).title).toBe('My edit')
    expect((await readdir(root)).some((name) => name.includes('.tmp-'))).toBe(false)
  })

  it('imports picker/drop files and clipboard bytes with readable duplicate-safe names', async () => {
    const parent = await temporaryDirectory()
    const sourceDirectory = path.join(parent, 'source')
    const root = path.join(parent, 'project')
    await mkdir(sourceDirectory)
    const sourcePath = path.join(sourceDirectory, 'Team Photo.svg')
    await writeFile(sourcePath, svgBytes)
    const store = projectStore()
    const project = await store.createAt(root, createBlankPresentation())

    const first = await store.importFile(project.projectId, sourcePath)
    const second = await store.importFile(project.projectId, sourcePath)
    const pasted = await store.importBytes(project.projectId, pngBytes, 'image/png', 'pasted-image')

    expect(first.path).toBe('assets/team-photo.svg')
    expect(second.path).toBe('assets/team-photo-2.svg')
    expect(pasted.path).toBe('assets/pasted-image.png')
    expect(first.source).toMatch(/^ves-asset:\/\/project\//)
    expect((await readdir(path.join(root, 'assets'))).sort()).toEqual([
      'pasted-image.png',
      'team-photo-2.svg',
      'team-photo.svg',
    ])
  })

  it('rejects image payloads that only contain a recognized signature', async () => {
    const parent = await temporaryDirectory()
    const store = projectStore()
    const project = await store.createAt(path.join(parent, 'project'), createBlankPresentation())
    const headerOnlyPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])

    await expect(store.importBytes(project.projectId, headerOnlyPng, 'image/png')).rejects.toThrow(/valid image\/png/)
  })

  it('rejects copied image URLs that target local or private networks', async () => {
    const parent = await temporaryDirectory()
    const store = projectStore()
    const project = await store.createAt(path.join(parent, 'project'), createBlankPresentation())

    await expect(store.importRemote(project.projectId, 'https://127.0.0.1/image.png')).rejects.toThrow(/private network/)
    await expect(store.importRemote(project.projectId, 'http://example.com/image.png')).rejects.toThrow(/public HTTPS/)
  })

  it('requires the active Project identity for every stateful operation', async () => {
    const parent = await temporaryDirectory()
    const store = projectStore()
    await store.createAt(path.join(parent, 'project'), createBlankPresentation())

    await expect(store.reload('stale-project-id')).rejects.toThrow(/currently active Project/)
    await expect(store.importBytes('stale-project-id', pngBytes, 'image/png')).rejects.toThrow(/currently active Project/)
    expect(() => store.revealPath('stale-project-id')).toThrow(/currently active Project/)
  })

  it('coalesces atomic presentation replacements, ignores its own save, and replaces stale watchers', async () => {
    const parent = await temporaryDirectory()
    const firstRoot = path.join(parent, 'first')
    const secondRoot = path.join(parent, 'second')
    const watchers = new ControlledWatchers()
    const store = watcherStore(watchers)
    const changes: DesktopProjectExternalChange[] = []
    store.onExternalChange((change) => changes.push(change))
    const first = await store.createAt(firstRoot, createBlankPresentation('First'))

    const externallyEdited = { ...first.presentation, title: 'External edit' }
    const temporaryPath = path.join(firstRoot, '.presentation.next')
    await writeFile(temporaryPath, `${JSON.stringify(externallyEdited, null, 2)}\n`)
    await rename(temporaryPath, path.join(firstRoot, 'presentation.json'))
    watchers.emit(first.rootPath, '.presentation.next')
    watchers.emit(first.rootPath, 'presentation.json')
    watchers.emit(first.rootPath, 'presentation.json')

    await waitFor(() => changes.some(({ kind }) => kind === 'presentation'))
    expect(changes.filter(({ kind }) => kind === 'presentation')).toHaveLength(1)

    await store.reload(first.projectId)
    changes.length = 0
    const saved = await store.save(first.projectId, { ...externallyEdited, title: 'Saved in app' })
    expect(saved.status).toBe('saved')
    watchers.emit(first.rootPath, 'presentation.json')
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(changes).toEqual([])

    const second = await store.createAt(secondRoot, createBlankPresentation('Second'))
    expect(watchers.isWatching(first.rootPath)).toBe(false)
    expect(watchers.isWatching(second.rootPath)).toBe(true)
    store.close()
    expect(watchers.isWatching(second.rootPath)).toBe(false)
  })

  it('detects an external save completed while reload replaces its watcher', async () => {
    const root = path.join(await temporaryDirectory(), 'reload-watch-gap')
    const watchers = new ControlledWatchers()
    let rootRegistrations = 0
    let latestSource = ''
    const store = new ProjectStore({
      debounceMs: 1,
      stabilizationMs: 1,
      maximumReadAttempts: 2,
      watchFactory: (directory, listener) => {
        if (path.basename(directory) === 'reload-watch-gap' && ++rootRegistrations === 2) {
          writeFileSync(path.join(root, 'presentation.json'), latestSource)
        }
        return watchers.factory(directory, listener)
      },
    })
    openStores.push(store)
    const project = await store.createAt(root, createBlankPresentation('Original'))
    const firstSource = `${JSON.stringify({ ...project.presentation, title: 'First external save' })}\n`
    latestSource = `${JSON.stringify({ ...project.presentation, title: 'Latest external save' })}\n`
    await writeFile(path.join(root, 'presentation.json'), firstSource)
    const changes: DesktopProjectExternalChange[] = []
    store.onExternalChange((change) => changes.push(change))

    const reloaded = await store.reload(project.projectId)
    expect(reloaded.presentation.title).toBe('First external save')
    await waitFor(() => changes.some((change) => change.kind === 'presentation'), 2_000)
    expect((await store.reload(project.projectId)).presentation.title).toBe('Latest external save')
  })

  it('polls and restores watchers after watcher installation fails', async () => {
    const root = path.join(await temporaryDirectory(), 'watch-recovery')
    const watchers = new ControlledWatchers()
    let rootWatcherAvailable = false
    const store = new ProjectStore({
      debounceMs: 1,
      stabilizationMs: 1,
      maximumReadAttempts: 2,
      watchFactory: (directory, listener) => {
        if (path.basename(directory) === 'watch-recovery' && !rootWatcherAvailable) throw new Error('watch unavailable')
        return watchers.factory(directory, listener)
      },
    })
    openStores.push(store)
    const project = await store.createAt(root, createBlankPresentation('Original'))
    const changes: DesktopProjectExternalChange[] = []
    store.onExternalChange((change) => changes.push(change))
    await writeFile(path.join(root, 'presentation.json'), `${JSON.stringify({ ...project.presentation, title: 'Polled edit' })}\n`)
    await waitFor(() => changes.some((change) => change.kind === 'presentation'), 2_000)
    rootWatcherAvailable = true
    await waitFor(() => watchers.isWatching(project.rootPath), 2_000)
    await store.reload(project.projectId)
    changes.length = 0
    await writeFile(path.join(root, 'presentation.json'), `${JSON.stringify({ ...project.presentation, title: 'Watched edit' })}\n`)
    watchers.emit(project.rootPath, 'presentation.json')
    await waitFor(() => changes.some((change) => change.kind === 'presentation'))
  })

  it('deduplicates invalid states and reports recovery to the accepted presentation', async () => {
    const root = path.join(await temporaryDirectory(), 'invalid-writes')
    const watchers = new ControlledWatchers()
    const store = watcherStore(watchers, 1)
    const project = await store.createAt(root, createBlankPresentation('Stable'))
    const acceptedSource = await readFile(path.join(root, 'presentation.json'), 'utf8')
    const changes: DesktopProjectExternalChange[] = []
    store.onExternalChange((change) => changes.push(change))

    await writeFile(path.join(root, 'presentation.json'), '{ "schemaVersion":')
    watchers.emit(project.rootPath, 'presentation.json')
    await waitFor(() => changes.some(({ kind }) => kind === 'invalid'))
    watchers.emit(project.rootPath, 'presentation.json')
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(changes.filter(({ kind }) => kind === 'invalid')).toHaveLength(1)

    await writeFile(path.join(root, 'presentation.json'), acceptedSource)
    watchers.emit(project.rootPath, 'presentation.json')
    await waitFor(() => changes.some(({ kind }) => kind === 'recovered'))
    expect(changes.some(({ kind }) => kind === 'presentation')).toBe(false)
    expect(store.activeProjectId).toBe(project.projectId)
  })

  it('re-emits a pending valid version after an invalid intermediate write', async () => {
    const root = path.join(await temporaryDirectory(), 'interrupted-write')
    const watchers = new ControlledWatchers()
    const store = watcherStore(watchers, 2)
    const project = await store.createAt(root, createBlankPresentation('Stable'))
    const file = path.join(root, 'presentation.json')
    const valid = `${JSON.stringify({ ...project.presentation, title: 'External version' }, null, 2)}\n`
    const changes: DesktopProjectExternalChange[] = []
    store.onExternalChange((change) => changes.push(change))

    await writeFile(file, valid)
    watchers.emit(project.rootPath, 'presentation.json')
    await waitFor(() => changes.filter(({ kind }) => kind === 'presentation').length === 1)
    await writeFile(file, '{')
    watchers.emit(project.rootPath, 'presentation.json')
    await waitFor(() => changes.some(({ kind }) => kind === 'invalid'))
    await writeFile(file, valid)
    watchers.emit(project.rootPath, 'presentation.json')
    await waitFor(() => changes.filter(({ kind }) => kind === 'presentation').length === 2)
  })

  it('refreshes externally replaced assets with content revisions and suppresses own imports', async () => {
    const root = path.join(await temporaryDirectory(), 'asset-watch')
    const watchers = new ControlledWatchers()
    const store = watcherStore(watchers)
    const project = await store.createAt(root, presentationWithDataAsset())
    const originalSource = project.presentation.imageAssets?.[0].source
    const changes: DesktopProjectExternalChange[] = []
    store.onExternalChange((change) => changes.push(change))

    const replacement = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><circle cx="6" cy="6" r="5"/></svg>')
    await writeFile(path.join(root, 'assets', 'hero-art.svg'), replacement)
    watchers.emit(project.assetsPath, 'hero-art.svg')
    await waitFor(() => changes.some(({ kind }) => kind === 'asset'))
    const assetChange = changes.find((change) => change.kind === 'asset')
    expect(assetChange).toMatchObject({ kind: 'asset', relativePaths: ['assets/hero-art.svg'] })

    const refreshed = await store.refreshAssets(project.projectId, project.presentation)
    expect(refreshed.presentation.imageAssets?.[0].source).not.toBe(originalSource)
    expect(refreshed.presentation.imageAssets?.[0].source).toMatch(/\?v=[a-f0-9]{64}$/)

    changes.length = 0
    await store.importBytes(project.projectId, pngBytes, 'image/png', 'internal')
    watchers.emit(project.assetsPath, 'internal.png')
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(changes).toEqual([])
  })

  it('holds the asset bytes captured when a video export starts', async () => {
    const root = path.join(await temporaryDirectory(), 'export-snapshot')
    const store = projectStore()
    const project = await store.createAt(root, presentationWithDataAsset())
    const frozen = await store.captureExportAssets('export-job', project.presentation)
    const source = frozen.imageAssets?.[0].source
    expect(source).toMatch(/^ves-asset:\/\/export\/export-job\/hero-art\?v=/)
    const replacement = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle r="5"/></svg>')
    await writeFile(path.join(root, 'assets', 'hero-art.svg'), replacement)
    expect(store.resolveExportAsset('export-job', 'hero-art').bytes).toEqual(svgBytes)
    store.releaseExportAssets('export-job')
    expect(() => store.resolveExportAsset('export-job', 'hero-art')).toThrow(/unavailable/)
  })

  it('waits briefly for a newly referenced asset before emitting a presentation change', async () => {
    const root = path.join(await temporaryDirectory(), 'multi-file-edit')
    const watchers = new ControlledWatchers()
    const store = watcherStore(watchers, 4)
    const project = await store.createAt(root, createBlankPresentation('Before'))
    const changed: Presentation = {
      ...project.presentation,
      title: 'After',
      imageAssets: [{ id: 'later', name: 'Later', mimeType: 'image/png', path: 'assets/later.png' }],
      slides: project.presentation.slides.map((slide, index) => index === 0 ? {
        ...slide,
        elements: [{
          id: 'later-image',
          type: 'image',
          name: 'Later',
          assetId: 'later',
          fit: 'contain',
          frame: { x: 100, y: 100, width: 400, height: 400 },
        }],
      } : slide),
    }
    const changes: DesktopProjectExternalChange[] = []
    store.onExternalChange((change) => changes.push(change))

    await writeFile(path.join(root, 'presentation.json'), `${JSON.stringify(changed, null, 2)}\n`)
    watchers.emit(project.rootPath, 'presentation.json')
    setTimeout(() => {
      void writeFile(path.join(root, 'assets', 'later.png'), pngBytes)
        .then(() => watchers.emit(project.assetsPath, 'later.png'))
    }, 5)

    await waitFor(() => changes.some(({ kind }) => kind === 'presentation'))
    expect(changes.some(({ kind }) => kind === 'invalid' || kind === 'unavailable')).toBe(false)
    const reloaded = await store.reload(project.projectId)
    expect(reloaded.missingAssets).toEqual([])
  })

  it('does not recreate an active Project root that became unavailable', async () => {
    const parent = await temporaryDirectory()
    const root = path.join(parent, 'project')
    const moved = path.join(parent, 'moved')
    const store = projectStore()
    const project = await store.createAt(root, createBlankPresentation('Before'))
    await rename(root, moved)

    await expect(store.save(project.projectId, { ...project.presentation, title: 'After' }))
      .rejects.toThrow(/Project folder is unavailable/)
    await expect(readFile(path.join(root, 'presentation.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not activate a reload when local edits begin while the disk read is in flight', async () => {
    const root = path.join(await temporaryDirectory(), 'reload-race')
    const store = projectStore()
    const project = await store.createAt(root, createBlankPresentation('Accepted'))
    await writeFile(
      path.join(root, 'presentation.json'),
      `${JSON.stringify({ ...project.presentation, title: 'External' }, null, 2)}\n`,
    )

    const reload = store.reload(project.projectId)
    store.setDirty(project.projectId, true)
    await expect(reload).rejects.toThrow(/changed locally while it was being reloaded/)
    expect(store.activeProjectId).toBe(project.projectId)
    expect(store.activeIsDirty).toBe(true)
  })

  it('does not adopt a replacement directory at the active Project path', async () => {
    const parent = await temporaryDirectory()
    const root = path.join(parent, 'identity')
    const moved = path.join(parent, 'original')
    const store = projectStore()
    const project = await store.createAt(root, createBlankPresentation('Original'))
    const source = await readFile(path.join(root, 'presentation.json'), 'utf8')
    await rename(root, moved)
    await mkdir(root)
    await writeFile(path.join(root, 'presentation.json'), source.replace('Original', 'Replacement'))

    await expect(store.reload(project.projectId)).rejects.toThrow(/Project folder is unavailable/)
    expect(store.activeProjectId).toBe(project.projectId)
  })

  it('does not follow asset directory symlinks when installing recursive watchers', async () => {
    const parent = await temporaryDirectory()
    const root = path.join(parent, 'symlink-watch')
    const outside = path.join(parent, 'outside')
    await mkdir(path.join(root, 'assets', 'nested'), { recursive: true })
    await mkdir(outside)
    await symlink(outside, path.join(root, 'assets', 'linked-outside'))
    await writeFile(path.join(root, 'presentation.json'), `${JSON.stringify(createBlankPresentation(), null, 2)}\n`)
    const watchers = new ControlledWatchers()
    const store = watcherStore(watchers)
    const project = await store.openAt(root)

    expect(watchers.isWatching(project.rootPath)).toBe(true)
    expect(watchers.isWatching(project.assetsPath)).toBe(true)
    expect(watchers.isWatching(path.join(project.assetsPath, 'nested'))).toBe(true)
    expect(watchers.isWatching(outside)).toBe(false)
    expect(watchers.isWatching(path.join(project.assetsPath, 'linked-outside'))).toBe(false)
  })
})
