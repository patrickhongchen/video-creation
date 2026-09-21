import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPresentationLibrary, savePresentationLibrary } from './presentationStorage'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
  clear() { this.values.clear() }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  get length() { return this.values.size }
}

const legacyLibrary = {
  activePresentationId: 'legacy-local',
  presentations: [{
    schemaVersion: 1,
    id: 'legacy-local',
    title: 'Legacy local project',
    tagline: 'Stored under the old library key.',
    aspectRatio: '9:16',
    accent: '#ff554f',
    scenes: [{
      id: 'legacy-title',
      type: 'title',
      title: 'Opening',
      duration: 4,
      headline: 'Still here',
      transition: { type: 'fade', duration: 0.5 },
    }],
  }],
}

describe('presentation library schema upgrade', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
  })

  it('loads the previous v1 library as canonical v2 slides', () => {
    storage.setItem('video-essay-studio:library:v1', JSON.stringify(legacyLibrary))

    const library = loadPresentationLibrary()

    expect(library.activePresentationId).toBe('legacy-local')
    expect(library.presentations[0]).toMatchObject({ schemaVersion: 2, id: 'legacy-local' })
    expect(library.presentations[0].slides[0].id).toBe('legacy-title')
  })

  it('writes the upgraded library under the v2 key', () => {
    storage.setItem('video-essay-studio:library:v1', JSON.stringify(legacyLibrary))
    const library = loadPresentationLibrary()

    savePresentationLibrary(library)

    const saved = JSON.parse(storage.getItem('video-essay-studio:library:v2') ?? 'null')
    expect(saved.presentations[0].schemaVersion).toBe(2)
    expect(saved.presentations[0].slides).toHaveLength(1)
    expect(saved.presentations[0]).not.toHaveProperty('scenes')
  })
})
