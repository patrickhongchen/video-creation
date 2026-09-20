import type { Presentation, Scene, SceneTransition } from './model'

export class PresentationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PresentationValidationError'
  }
}

function fail(path: string, message: string): never {
  throw new PresentationValidationError(`${path}: ${message}`)
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'expected an object')
  return value as Record<string, unknown>
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'expected a string')
  return value
}

function optionalString(value: unknown, path: string) {
  return value === undefined ? undefined : string(value, path)
}

function id(value: unknown, path: string) {
  const result = string(value, path)
  if (!result.trim()) fail(path, 'expected a non-empty ID')
  return result
}

function finiteNumber(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) fail(path, `expected a number of at least ${minimum}`)
  return value
}

function transition(value: unknown, path: string): SceneTransition {
  const data = object(value, path)
  if (data.type !== 'fade' && data.type !== 'slide' && data.type !== 'scale') fail(`${path}.type`, 'expected fade, slide, or scale')
  return { type: data.type, duration: finiteNumber(data.duration, `${path}.duration`) }
}

function sceneBase(data: Record<string, unknown>, path: string) {
  return {
    id: id(data.id, `${path}.id`),
    title: string(data.title, `${path}.title`),
    duration: finiteNumber(data.duration, `${path}.duration`, 1),
    transition: transition(data.transition, `${path}.transition`),
    notes: optionalString(data.notes, `${path}.notes`),
    eyebrow: optionalString(data.eyebrow, `${path}.eyebrow`),
  }
}

function pair(value: unknown, path: string) {
  const data = object(value, path)
  return { label: string(data.label, `${path}.label`), value: string(data.value, `${path}.value`) }
}

function parseScene(value: unknown, index: number): Scene {
  const path = `presentation.scenes[${index}]`
  const data = object(value, path)
  const base = sceneBase(data, path)
  switch (data.type) {
    case 'title':
      return { ...base, type: 'title', headline: string(data.headline, `${path}.headline`), subtitle: optionalString(data.subtitle, `${path}.subtitle`) }
    case 'text':
      return { ...base, type: 'text', headline: string(data.headline, `${path}.headline`), body: string(data.body, `${path}.body`), callout: optionalString(data.callout, `${path}.callout`) }
    case 'big-stat':
      return { ...base, type: 'big-stat', value: string(data.value, `${path}.value`), label: string(data.label, `${path}.label`), supportingText: optionalString(data.supportingText, `${path}.supportingText`), elementId: optionalString(data.elementId, `${path}.elementId`) }
    case 'comparison':
      return { ...base, type: 'comparison', headline: string(data.headline, `${path}.headline`), left: pair(data.left, `${path}.left`), right: pair(data.right, `${path}.right`) }
    case 'stat-detail':
      return { ...base, type: 'stat-detail', value: string(data.value, `${path}.value`), label: string(data.label, `${path}.label`), headline: string(data.headline, `${path}.headline`), body: string(data.body, `${path}.body`), elementId: optionalString(data.elementId, `${path}.elementId`) }
    default:
      return fail(`${path}.type`, 'expected title, text, big-stat, comparison, or stat-detail')
  }
}

export function validatePresentation(value: unknown): Presentation {
  const data = object(value, 'presentation')
  if (data.schemaVersion !== 1) fail('presentation.schemaVersion', 'unsupported or missing version (expected 1)')
  if (data.aspectRatio !== '9:16') fail('presentation.aspectRatio', 'only 9:16 is supported')
  if (!Array.isArray(data.scenes) || data.scenes.length === 0) fail('presentation.scenes', 'expected at least one scene')
  const scenes = data.scenes.map(parseScene)
  const sceneIds = new Set<string>()
  scenes.forEach((scene, index) => {
    if (sceneIds.has(scene.id)) fail(`presentation.scenes[${index}].id`, `duplicate scene ID "${scene.id}"`)
    sceneIds.add(scene.id)
  })
  return {
    schemaVersion: 1,
    id: id(data.id, 'presentation.id'),
    title: string(data.title, 'presentation.title'),
    tagline: string(data.tagline, 'presentation.tagline'),
    aspectRatio: '9:16',
    accent: (() => {
      const accent = string(data.accent, 'presentation.accent')
      if (!/^#[0-9a-f]{6}$/i.test(accent)) fail('presentation.accent', 'expected a six-digit hex color such as #ff554f')
      return accent
    })(),
    scenes,
  }
}

export function parsePresentationJson(source: string) {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON'
    throw new PresentationValidationError(`Could not parse JSON: ${detail}`)
  }
  return validatePresentation(value)
}
