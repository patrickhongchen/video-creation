import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NarrationTake } from './narrationTypes'

const local = vi.hoisted(() => ({
  list: vi.fn(), listPresentation: vi.fn(), get: vi.fn(), store: vi.fn(), delete: vi.fn(),
  select: vi.fn(), invalidate: vi.fn(), deleteSection: vi.fn(), deletePresentation: vi.fn(),
}))
const bridge = vi.hoisted(() => ({
  current: null as null | Record<string, ReturnType<typeof vi.fn>>,
}))

vi.mock('./narrationDb', () => ({
  listNarrationTakes: local.list,
  listNarrationTakesForPresentation: local.listPresentation,
  getNarrationTake: local.get,
  storeNarrationTake: local.store,
  deleteNarrationTake: local.delete,
  selectNarrationTake: local.select,
  invalidateSectionTakes: local.invalidate,
  deleteNarrationTakesForSection: local.deleteSection,
  deleteNarrationTakesForPresentation: local.deletePresentation,
}))
vi.mock('../desktop/desktopBridge', () => ({ getDesktopBridge: () => bridge.current }))

import { createNarrationStorage } from './narrationStorage'

const legacyTake: NarrationTake = {
  id: 'take-legacy', presentationId: 'presentation-migrate', sectionId: 'section-one',
  createdAt: '2026-01-01T00:00:00.000Z', durationMs: 1000, mimeType: 'audio/webm',
  cues: [{ type: 'slide', sceneId: 'slide-one', timeMs: 0 }],
  pointerTrack: [{ timeMs: 100, sceneId: 'slide-one', x: 0.4, y: 0.5, visible: true }],
  selected: true, invalidated: false, blob: new Blob([Uint8Array.from([1, 2, 3])], { type: 'audio/webm' }),
}

function desktopMock(exists: boolean) {
  return {
    narrationStatus: vi.fn().mockResolvedValue({ exists }),
    narrationMigrate: vi.fn().mockResolvedValue(undefined),
    narrationList: vi.fn().mockResolvedValue([]),
    narrationGet: vi.fn().mockResolvedValue(undefined),
    narrationStore: vi.fn().mockResolvedValue(undefined),
    narrationDelete: vi.fn().mockResolvedValue(undefined),
    narrationSelect: vi.fn().mockResolvedValue(undefined),
    narrationInvalidate: vi.fn().mockResolvedValue(undefined),
    narrationDeleteSection: vi.fn().mockResolvedValue(undefined),
    narrationDeletePresentation: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  bridge.current = null
  local.listPresentation.mockResolvedValue([])
  local.list.mockResolvedValue([])
})

describe('narration storage selection and migration', () => {
  it('keeps browser/local narration on IndexedDB', async () => {
    const storage = createNarrationStorage(null)
    await storage.store(legacyTake)
    await storage.list(legacyTake.presentationId, legacyTake.sectionId)
    await storage.select(legacyTake.presentationId, legacyTake.sectionId, legacyTake.id)
    expect(local.store).toHaveBeenCalledWith(legacyTake)
    expect(local.list).toHaveBeenCalledWith(legacyTake.presentationId, legacyTake.sectionId)
    expect(local.select).toHaveBeenCalledWith(legacyTake.presentationId, legacyTake.sectionId, legacyTake.id)
  })

  it('migrates once with original media and metadata before portable reads', async () => {
    const desktop = desktopMock(false)
    bridge.current = desktop
    local.listPresentation.mockResolvedValue([legacyTake])
    const storage = createNarrationStorage('project-migrate')
    await storage.list(legacyTake.presentationId, legacyTake.sectionId)
    await storage.list(legacyTake.presentationId, legacyTake.sectionId)
    expect(desktop.narrationMigrate).toHaveBeenCalledTimes(1)
    const migrated = desktop.narrationMigrate.mock.calls[0][2][0]
    expect(migrated).toMatchObject({
      id: legacyTake.id, sectionId: legacyTake.sectionId, createdAt: legacyTake.createdAt,
      cues: legacyTake.cues, pointerTrack: legacyTake.pointerTrack,
      selected: true, invalidated: false, mimeType: legacyTake.mimeType,
    })
    expect([...new Uint8Array(migrated.bytes)]).toEqual([1, 2, 3])
    expect(local.delete).not.toHaveBeenCalled()
    expect(local.deletePresentation).not.toHaveBeenCalled()
  })

  it('treats existing portable narration as authoritative', async () => {
    const desktop = desktopMock(true)
    bridge.current = desktop
    local.listPresentation.mockResolvedValue([legacyTake])
    const storage = createNarrationStorage('project-existing')
    await storage.list(legacyTake.presentationId, legacyTake.sectionId)
    expect(local.listPresentation).not.toHaveBeenCalled()
    expect(desktop.narrationMigrate).not.toHaveBeenCalled()
  })

  it('does not read or mutate portable takes when migration fails, and can retry', async () => {
    const desktop = desktopMock(false)
    bridge.current = desktop
    local.listPresentation.mockResolvedValue([legacyTake])
    desktop.narrationMigrate.mockRejectedValueOnce(new Error('disk full'))
    const storage = createNarrationStorage('project-retry')
    await expect(storage.list(legacyTake.presentationId, legacyTake.sectionId)).rejects.toThrow('disk full')
    expect(desktop.narrationList).not.toHaveBeenCalled()
    await storage.list(legacyTake.presentationId, legacyTake.sectionId)
    expect(desktop.narrationMigrate).toHaveBeenCalledTimes(2)
    expect(local.deletePresentation).not.toHaveBeenCalled()
  })

  it('hydrates portable bytes into a Blob and marks missing media unusable', async () => {
    const desktop = desktopMock(true)
    bridge.current = desktop
    const { blob: _blob, ...metadata } = legacyTake
    desktop.narrationList.mockResolvedValue([
      { ...metadata, bytes: Uint8Array.from([7, 8]).buffer },
      { ...metadata, id: 'take-missing', bytes: null, storageError: 'The audio file is missing.' },
    ])
    const takes = await createNarrationStorage('project-read').list(legacyTake.presentationId, legacyTake.sectionId)
    expect([...new Uint8Array(await takes[0].blob.arrayBuffer())]).toEqual([7, 8])
    expect(takes[0].blob.type).toBe('audio/webm')
    expect(takes[1].blob.size).toBe(0)
    expect(takes[1].storageError).toMatch(/missing/)
  })
})
