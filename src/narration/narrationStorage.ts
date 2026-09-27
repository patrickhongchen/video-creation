import { getDesktopBridge } from '../desktop/desktopBridge'
import type { DesktopNarrationTakeData, DesktopNarrationTakeWrite } from '../desktop/desktopTypes'
import {
  deleteNarrationTake as deleteLocalTake,
  deleteNarrationTakesForPresentation as deleteLocalPresentation,
  deleteNarrationTakesForSection as deleteLocalSection,
  getNarrationTake as getLocalTake,
  invalidateSectionTakes as invalidateLocalSection,
  listNarrationTakes as listLocalTakes,
  listNarrationTakesForPresentation as listLocalPresentation,
  selectNarrationTake as selectLocalTake,
  storeNarrationTake as storeLocalTake,
} from './narrationDb'
import type { NarrationTake } from './narrationTypes'

const migrationChecks = new Map<string, Promise<void>>()

async function toPortableWrite(take: NarrationTake): Promise<DesktopNarrationTakeWrite> {
  const { blob, storageError: _storageError, ...metadata } = take
  return { ...metadata, bytes: await blob.arrayBuffer() }
}

function fromPortable(data: DesktopNarrationTakeData): NarrationTake {
  const { bytes, ...metadata } = data
  return {
    ...metadata,
    blob: new Blob(bytes === null ? [] : [bytes], { type: data.mimeType }),
  }
}

/** The desktop Project ID selects the trusted filesystem root; browser mode remains IndexedDB. */
export function createNarrationStorage(projectId: string | null) {
  const desktop = projectId ? getDesktopBridge() : null
  if (projectId && !desktop) throw new Error('Desktop Project narration storage is unavailable.')
  if (!projectId || !desktop) {
    return {
      prepare: async (_presentationId: string) => {},
      list: listLocalTakes,
      get: async (_presentationId: string, takeId: string) => getLocalTake(takeId),
      store: storeLocalTake,
      delete: async (_presentationId: string, takeId: string) => deleteLocalTake(takeId),
      select: selectLocalTake,
      invalidate: invalidateLocalSection,
      deleteSection: deleteLocalSection,
      deletePresentation: deleteLocalPresentation,
    }
  }

  const activeProjectId = projectId
  const activeDesktop = desktop
  async function prepare(presentationId: string) {
    const key = JSON.stringify([activeProjectId, presentationId])
    let pending = migrationChecks.get(key)
    if (!pending) {
      pending = (async () => {
        const status = await activeDesktop.narrationStatus(activeProjectId, presentationId)
        if (status.exists) return
        const legacy = await listLocalPresentation(presentationId)
        if (legacy.length === 0) return
        await activeDesktop.narrationMigrate(activeProjectId, presentationId, await Promise.all(legacy.map(toPortableWrite)))
      })()
      migrationChecks.set(key, pending)
      void pending.catch(() => { if (migrationChecks.get(key) === pending) migrationChecks.delete(key) })
    }
    await pending
  }

  return {
    prepare,
    list: async (presentationId: string, sectionId: string) => {
      await prepare(presentationId)
      return (await activeDesktop.narrationList(activeProjectId, presentationId, sectionId)).map(fromPortable)
    },
    get: async (presentationId: string, takeId: string) => {
      await prepare(presentationId)
      const data = await activeDesktop.narrationGet(activeProjectId, presentationId, takeId)
      return data ? fromPortable(data) : undefined
    },
    store: async (take: NarrationTake) => {
      await prepare(take.presentationId)
      await activeDesktop.narrationStore(activeProjectId, await toPortableWrite(take))
      return take
    },
    delete: async (presentationId: string, takeId: string) => {
      await prepare(presentationId)
      await activeDesktop.narrationDelete(activeProjectId, presentationId, takeId)
    },
    select: async (presentationId: string, sectionId: string, takeId: string | null) => {
      await prepare(presentationId)
      await activeDesktop.narrationSelect(activeProjectId, presentationId, sectionId, takeId)
    },
    invalidate: async (presentationId: string, sectionId: string) => {
      await prepare(presentationId)
      await activeDesktop.narrationInvalidate(activeProjectId, presentationId, sectionId)
    },
    deleteSection: async (presentationId: string, sectionId: string) => {
      await prepare(presentationId)
      await activeDesktop.narrationDeleteSection(activeProjectId, presentationId, sectionId)
    },
    deletePresentation: async (presentationId: string) => {
      await prepare(presentationId)
      await activeDesktop.narrationDeletePresentation(activeProjectId, presentationId)
    },
  }
}
