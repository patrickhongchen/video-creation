import type { NarrationTake } from './narrationTypes'

const DATABASE_NAME = 'video-essay-studio-narration'
const DATABASE_VERSION = 1
const TAKE_STORE = 'takes'
const PRESENTATION_INDEX = 'presentationId'
const SECTION_INDEX = 'sectionKey'

type StoredNarrationTake = NarrationTake & { sectionKey: string }

function sectionKey(presentationId: string, sectionId: string) {
  return JSON.stringify([presentationId, sectionId])
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
}

function openNarrationDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('This browser does not support local narration storage.'))
      return
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      const store = database.objectStoreNames.contains(TAKE_STORE)
        ? request.transaction!.objectStore(TAKE_STORE)
        : database.createObjectStore(TAKE_STORE, { keyPath: 'id' })
      if (!store.indexNames.contains(PRESENTATION_INDEX)) store.createIndex(PRESENTATION_INDEX, 'presentationId', { unique: false })
      if (!store.indexNames.contains(SECTION_INDEX)) store.createIndex(SECTION_INDEX, 'sectionKey', { unique: false })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Narration storage could not be opened.'))
    request.onblocked = () => reject(new Error('Narration storage is blocked by another open version of this app.'))
  })
}

async function withDatabase<T>(operation: (database: IDBDatabase) => Promise<T>) {
  const database = await openNarrationDatabase()
  try {
    return await operation(database)
  } finally {
    database.close()
  }
}

function fromStored(take: StoredNarrationTake): NarrationTake {
  const { sectionKey: _sectionKey, ...narrationTake } = take
  return narrationTake
}

export async function listNarrationTakes(presentationId: string, sectionId: string) {
  return withDatabase(async (database) => {
    const transaction = database.transaction(TAKE_STORE, 'readonly')
    const store = transaction.objectStore(TAKE_STORE)
    const records = await requestResult(store.index(SECTION_INDEX).getAll(IDBKeyRange.only(sectionKey(presentationId, sectionId)))) as StoredNarrationTake[]
    await transactionDone(transaction)
    return records
      .map(fromStored)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  })
}

export async function getNarrationTake(id: string) {
  return withDatabase(async (database) => {
    const transaction = database.transaction(TAKE_STORE, 'readonly')
    const record = await requestResult(transaction.objectStore(TAKE_STORE).get(id)) as StoredNarrationTake | undefined
    await transactionDone(transaction)
    return record ? fromStored(record) : undefined
  })
}

export async function storeNarrationTake(take: NarrationTake) {
  return withDatabase(async (database) => {
    const transaction = database.transaction(TAKE_STORE, 'readwrite')
    const store = transaction.objectStore(TAKE_STORE)

    if (take.selected) {
      const records = await requestResult(store.index(SECTION_INDEX).getAll(IDBKeyRange.only(sectionKey(take.presentationId, take.sectionId)))) as StoredNarrationTake[]
      for (const record of records) {
        if (record.id !== take.id && record.selected) store.put({ ...record, selected: false })
      }
    }

    store.put({ ...take, sectionKey: sectionKey(take.presentationId, take.sectionId) } satisfies StoredNarrationTake)
    await transactionDone(transaction)
    return take
  })
}

export async function deleteNarrationTake(id: string) {
  return withDatabase(async (database) => {
    const transaction = database.transaction(TAKE_STORE, 'readwrite')
    transaction.objectStore(TAKE_STORE).delete(id)
    await transactionDone(transaction)
  })
}

export async function selectNarrationTake(presentationId: string, sectionId: string, takeId: string | null) {
  return withDatabase(async (database) => {
    const transaction = database.transaction(TAKE_STORE, 'readwrite')
    const store = transaction.objectStore(TAKE_STORE)
    const records = await requestResult(store.index(SECTION_INDEX).getAll(IDBKeyRange.only(sectionKey(presentationId, sectionId)))) as StoredNarrationTake[]

    if (takeId !== null && !records.some((record) => record.id === takeId)) {
      transaction.abort()
      throw new Error('The selected narration take no longer exists.')
    }

    for (const record of records) {
      const selected = record.id === takeId
      if (record.selected !== selected) store.put({ ...record, selected })
    }
    await transactionDone(transaction)
  })
}

async function deleteByIndex(indexName: string, value: string) {
  return withDatabase(async (database) => {
    const transaction = database.transaction(TAKE_STORE, 'readwrite')
    const store = transaction.objectStore(TAKE_STORE)
    const request = store.index(indexName).openKeyCursor(IDBKeyRange.only(value))
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          resolve()
          return
        }
        store.delete(cursor.primaryKey)
        cursor.continue()
      }
      request.onerror = () => reject(request.error ?? new Error('Narration takes could not be deleted.'))
    })
    await transactionDone(transaction)
  })
}

export function deleteNarrationTakesForSection(presentationId: string, sectionId: string) {
  return deleteByIndex(SECTION_INDEX, sectionKey(presentationId, sectionId))
}

export function deleteNarrationTakesForPresentation(presentationId: string) {
  return deleteByIndex(PRESENTATION_INDEX, presentationId)
}

// Short integration-facing names used by presentation and section deletion flows.
export const deleteSectionTakes = deleteNarrationTakesForSection
export const deletePresentationTakes = deleteNarrationTakesForPresentation
