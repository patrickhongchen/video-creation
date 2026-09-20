import { demoPresentation } from '../demoPresentation'
import type { Presentation } from '../model'
import { samplePresentation } from '../samplePresentation'
import { validatePresentation } from '../presentationValidation'

const LIBRARY_KEY = 'video-essay-studio:library:v1'
const LEGACY_KEY = 'video-essay-studio:presentation:v1'

export interface PresentationLibrary {
  presentations: Presentation[]
  activePresentationId: string
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function initialLibrary(): PresentationLibrary {
  const seeds = [clone(demoPresentation), clone(samplePresentation)]
  try {
    const legacySource = localStorage.getItem(LEGACY_KEY)
    if (legacySource) {
      const raw = JSON.parse(legacySource) as Record<string, unknown>
      const migrated = validatePresentation({ ...raw, schemaVersion: raw.schemaVersion ?? 1 })
      const withoutCollision = seeds.filter((item) => item.id !== migrated.id)
      return { presentations: [migrated, ...withoutCollision], activePresentationId: migrated.id }
    }
  } catch {
    // A corrupt legacy document should not prevent the seeded library from loading.
  }
  return { presentations: seeds, activePresentationId: demoPresentation.id }
}

export function loadPresentationLibrary(): PresentationLibrary {
  try {
    const source = localStorage.getItem(LIBRARY_KEY)
    if (!source) return initialLibrary()
    const raw = JSON.parse(source) as Record<string, unknown>
    if (!Array.isArray(raw.presentations)) throw new Error('Invalid library')
    const presentations: Presentation[] = []
    const presentationIds = new Set<string>()
    raw.presentations.forEach((candidate) => {
      try {
        const presentation = validatePresentation(candidate)
        if (!presentationIds.has(presentation.id)) {
          presentations.push(presentation)
          presentationIds.add(presentation.id)
        }
      } catch {
        // Keep other valid local projects when one stored entry is malformed.
      }
    })
    if (presentations.length === 0) return initialLibrary()
    const requestedId = typeof raw.activePresentationId === 'string' ? raw.activePresentationId : ''
    const activePresentationId = presentations.some((item) => item.id === requestedId) ? requestedId : presentations[0].id
    return { presentations, activePresentationId }
  } catch {
    return initialLibrary()
  }
}

export function savePresentationLibrary(library: PresentationLibrary) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library))
}
