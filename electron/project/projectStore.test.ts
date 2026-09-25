import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Presentation } from '../../src/model'
import { createBlankPresentation } from '../../src/presentationFactories'
import { ProjectStore, validateAssetRelativePath } from './projectStore'

const temporaryDirectories: string[] = []
const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'video-project-test-'))
  temporaryDirectories.push(directory)
  return directory
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

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('ProjectStore', () => {
  it('creates the plain folder format and migrates data URLs to canonical relative assets', async () => {
    const parent = await temporaryDirectory()
    const root = path.join(parent, 'portable-project')
    const store = new ProjectStore()
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
    await new ProjectStore().createAt(root, createBlankPresentation())
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
    const store = new ProjectStore()
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

    await expect(new ProjectStore().openAt(root)).rejects.toThrow(/extension does not match image\/svg\+xml/)
  })

  it('reports referenced missing assets and remains portable after moving the folder', async () => {
    const parent = await temporaryDirectory()
    const originalRoot = path.join(parent, 'original')
    const movedRoot = path.join(parent, 'moved')
    const firstStore = new ProjectStore()
    await firstStore.createAt(originalRoot, presentationWithDataAsset())
    await rename(originalRoot, movedRoot)

    const moved = await new ProjectStore().openAt(movedRoot)
    expect(moved.missingAssets).toEqual([])
    expect(moved.presentation.imageAssets?.[0].source).toContain(moved.projectId)

    await unlink(path.join(movedRoot, 'assets', 'hero-art.svg'))
    const missingStore = new ProjectStore()
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
    const store = new ProjectStore()
    const project = await store.createAt(root, presentationWithDataAsset())
    const assetPath = path.join(root, 'assets', 'hero-art.svg')
    await unlink(assetPath)
    await symlink(outside, assetPath)

    const reopened = await new ProjectStore().openAt(root)
    expect(reopened.missingAssets[0]?.message).toContain('Slide 1 ("Blank slide") references missing asset')
    await expect(store.resolveProtocolAsset(project.projectId, 'assets/hero-art.svg')).rejects.toThrow(/escapes/)
  })

  it('detects external edits and only overwrites them when explicitly requested', async () => {
    const parent = await temporaryDirectory()
    const root = path.join(parent, 'conflict')
    const store = new ProjectStore()
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
    const store = new ProjectStore()
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
    const store = new ProjectStore()
    const project = await store.createAt(path.join(parent, 'project'), createBlankPresentation())
    const headerOnlyPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])

    await expect(store.importBytes(project.projectId, headerOnlyPng, 'image/png')).rejects.toThrow(/valid image\/png/)
  })

  it('rejects copied image URLs that target local or private networks', async () => {
    const parent = await temporaryDirectory()
    const store = new ProjectStore()
    const project = await store.createAt(path.join(parent, 'project'), createBlankPresentation())

    await expect(store.importRemote(project.projectId, 'https://127.0.0.1/image.png')).rejects.toThrow(/private network/)
    await expect(store.importRemote(project.projectId, 'http://example.com/image.png')).rejects.toThrow(/public HTTPS/)
  })

  it('requires the active Project identity for every stateful operation', async () => {
    const parent = await temporaryDirectory()
    const store = new ProjectStore()
    await store.createAt(path.join(parent, 'project'), createBlankPresentation())

    await expect(store.reload('stale-project-id')).rejects.toThrow(/currently active Project/)
    await expect(store.importBytes('stale-project-id', pngBytes, 'image/png')).rejects.toThrow(/currently active Project/)
    expect(() => store.revealPath('stale-project-id')).toThrow(/currently active Project/)
  })
})
