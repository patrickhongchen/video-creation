import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBlankPresentation } from '../src/presentationFactories'
import { ProjectStore } from '../electron/project/projectStore'
import { runValidator, validateProject } from './validateProject'

const roots: string[] = []
async function projectFile() {
  const root = await mkdtemp(path.join(tmpdir(), 'presentation-validator-'))
  roots.push(root)
  await mkdir(path.join(root, 'assets'))
  return { root, file: path.join(root, 'presentation.json') }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Project validator', () => {
  it('accepts folder and file paths', async () => {
    const { root, file } = await projectFile()
    await writeFile(file, JSON.stringify(createBlankPresentation()))
    expect(await validateProject(root)).toMatchObject({ valid: true, errors: [], warnings: [] })
    expect(await validateProject(file)).toMatchObject({ valid: true, errors: [], warnings: [] })
  })

  it('reports invalid JSON and schema failures', async () => {
    const { root, file } = await projectFile()
    await writeFile(file, '{broken')
    expect((await validateProject(root)).errors[0].message).toContain('Could not parse')
    const presentation = createBlankPresentation()
    presentation.slides = []
    await writeFile(file, JSON.stringify(presentation))
    expect((await validateProject(root)).errors[0].path).toBe('presentation.slides')
  })

  it('reports a missing asset and incompatible shared identity', async () => {
    const { root, file } = await projectFile()
    const presentation = createBlankPresentation()
    presentation.imageAssets = [{ id: 'missing', name: 'Missing', mimeType: 'image/svg+xml', path: 'assets/missing.svg' }]
    presentation.slides[0].elements.push({ id: 'image', type: 'image', name: 'Image', assetId: 'missing', fit: 'contain', frame: { x: 100, y: 200, width: 700, height: 700 } })
    await writeFile(file, JSON.stringify(presentation))
    expect((await validateProject(root)).errors.map(({ code }) => code)).toContain('missing-asset')
    presentation.slides[0].elements[0].sharedElementId = 'same'
    presentation.slides.push({ ...structuredClone(presentation.slides[0]), id: 'second', elements: [{ id: 'text', type: 'text', name: 'Text', text: 'Hi', sharedElementId: 'same', frame: { x: 100, y: 200, width: 700, height: 200 } }] })
    await writeFile(file, JSON.stringify(presentation))
    expect((await validateProject(root)).errors[0].message).toContain('incompatible')
  })

  it('keeps quality warnings nonfatal', async () => {
    const { root, file } = await projectFile()
    const presentation = createBlankPresentation()
    presentation.slides[0].elements.push({ id: 'small', type: 'text', name: 'Small', text: 'Small', fontSize: 18, frame: { x: 100, y: 200, width: 400, height: 100 } })
    await writeFile(file, JSON.stringify(presentation))
    expect(await validateProject(root)).toMatchObject({ valid: true, errors: [], warnings: [{ code: 'text-small' }] })
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      expect(await runValidator([root, '--json'])).toBe(0)
      expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({ valid: true, warnings: [{ code: 'text-small' }] })
      expect(await runValidator([root, '--strict'])).toBe(1)
    } finally {
      output.mockRestore()
    }
  })

  it('round-trips a seven-slide external edit through validation, reload, and save', async () => {
    const { root, file } = await projectFile()
    const store = new ProjectStore()
    const initial = await store.createAt(root, createBlankPresentation('Banana ripening'))
    const authored = structuredClone(initial.presentation)
    authored.slides = Array.from({ length: 7 }, (_, index) => ({
      id: `banana-beat-${index + 1}`,
      title: `Beat ${index + 1}`,
      duration: 4,
      notes: `Explain ripening step ${index + 1}; advance after the visual lands.`,
      transition: { type: 'fade' as const, duration: 0.5 },
      elements: [{
        id: `headline-${index + 1}`, type: 'text' as const, name: 'Headline',
        text: `Banana beat ${index + 1}`, role: 'headline' as const, fontSize: 72,
        frame: { x: index % 2 ? 150 : 90, y: 350 + index * 80, width: 830, height: 180 },
      }],
    }))
    authored.narration = { sections: [{ id: 'ripening-story', title: 'The story', slideIds: authored.slides.map((slide) => slide.id) }] }
    await writeFile(file, JSON.stringify(authored, null, 2))
    expect((await validateProject(root)).valid).toBe(true)
    const reloaded = await store.reload(initial.projectId)
    expect(reloaded.presentation.slides).toHaveLength(7)
    expect(reloaded.presentation.narration?.sections[0].id).toBe('ripening-story')
    reloaded.presentation.slides[2].elements[0].frame.x = 240 // A quick manual placement correction.
    await store.save(initial.projectId, reloaded.presentation)
    const saved = JSON.parse(await readFile(file, 'utf8'))
    expect(saved.slides[2].elements[0].frame.x).toBe(240)
    expect(saved.slides[2].id).toBe('banana-beat-3')
    expect(saved.narration.sections[0].id).toBe('ripening-story')
  })
})
