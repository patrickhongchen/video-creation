import type { Presentation, Scene } from './model'

export type SceneType = Scene['type']

export const sceneTypeOptions: ReadonlyArray<{ type: SceneType; label: string }> = [
  { type: 'title', label: 'Title' },
  { type: 'text', label: 'Text' },
  { type: 'big-stat', label: 'Big Stat' },
  { type: 'comparison', label: 'Comparison' },
  { type: 'stat-detail', label: 'Stat Detail' },
]

function randomSuffix() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'presentation'
}

export function createStableId(prefix: string) {
  return `${slugify(prefix)}-${randomSuffix()}`
}

export function createScene(type: SceneType): Scene {
  const base = {
    id: createStableId(type),
    duration: 4,
    transition: { type: 'fade' as const, duration: 0.55 },
    eyebrow: 'New scene',
  }

  switch (type) {
    case 'title':
      return { ...base, type, title: 'Title scene', headline: 'Your headline\ngoes here.', subtitle: 'Add a concise supporting thought.' }
    case 'text':
      return { ...base, type, title: 'Text scene', headline: 'Build the argument.', body: 'Use this space to explain the next beat of your story.', callout: 'A short takeaway.' }
    case 'big-stat':
      return { ...base, type, title: 'Big stat', value: '42%', label: 'a meaningful statistic', supportingText: 'Add context and cite the source in your notes.' }
    case 'comparison':
      return { ...base, type, title: 'Comparison', headline: 'Compare two ideas.', left: { label: 'Before', value: '1' }, right: { label: 'After', value: '2' } }
    case 'stat-detail':
      return { ...base, type, title: 'Stat detail', value: '42%', label: 'the key figure', headline: 'Explain what the number means.', body: 'Connect the statistic to a concrete consequence.' }
  }
}

export function createBlankPresentation(title = 'Untitled Presentation'): Presentation {
  return {
    schemaVersion: 1,
    id: createStableId(slugify(title)),
    title,
    tagline: 'A new vertical video essay.',
    aspectRatio: '9:16',
    accent: '#ff554f',
    scenes: [createScene('title')],
  }
}

export function duplicateScene(scene: Scene): Scene {
  // elementId is intentionally preserved so adjacent copies can Morph together.
  return { ...structuredClone(scene), id: createStableId(scene.type), title: `${scene.title} copy` }
}

export function duplicatePresentation(presentation: Presentation): Presentation {
  return {
    ...structuredClone(presentation),
    id: createStableId(slugify(presentation.title)),
    title: `${presentation.title} Copy`,
  }
}

export function makePresentationIdUnique(id: string, existingIds: Iterable<string>) {
  const ids = new Set(existingIds)
  const base = id.trim() || 'presentation'
  if (!ids.has(base)) return base
  let suffix = 2
  while (ids.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}
