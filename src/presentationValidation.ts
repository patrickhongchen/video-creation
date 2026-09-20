import type { ChartDatum, ChartDomain, Presentation, Scene, SceneTransition } from './model'

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

function optionalId(value: unknown, path: string) {
  return value === undefined ? undefined : id(value, path)
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

function numericValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a finite number')
  return value
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'expected a boolean')
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

function chartData(value: unknown, path: string): ChartDatum[] {
  if (!Array.isArray(value) || value.length === 0) fail(path, 'expected at least one datum')
  const seenIds = new Set<string>()
  return value.map((candidate, index) => {
    const datumPath = `${path}[${index}]`
    const data = object(candidate, datumPath)
    const datumId = id(data.id, `${datumPath}.id`)
    if (seenIds.has(datumId)) fail(`${datumPath}.id`, `duplicate datum ID "${datumId}"`)
    seenIds.add(datumId)
    const label = string(data.label, `${datumPath}.label`)
    if (!label.trim()) fail(`${datumPath}.label`, 'expected a non-empty label')
    return { id: datumId, label, value: numericValue(data.value, `${datumPath}.value`) }
  })
}

function chartDomain(value: unknown, path: string): ChartDomain | undefined {
  if (value === undefined) return undefined
  const data = object(value, path)
  const min = data.min === undefined ? undefined : numericValue(data.min, `${path}.min`)
  const max = data.max === undefined ? undefined : numericValue(data.max, `${path}.max`)
  if (min !== undefined && max !== undefined && min >= max) fail(path, 'expected min to be less than max')
  return { min, max }
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
    case 'chart': {
      if (data.chartType !== 'bar' && data.chartType !== 'line') fail(`${path}.chartType`, 'expected bar or line')
      if (data.orientation !== undefined && data.orientation !== 'horizontal' && data.orientation !== 'vertical') fail(`${path}.orientation`, 'expected horizontal or vertical')
      const parsedData = chartData(data.data, `${path}.data`)
      if (!Array.isArray(data.highlightIds)) fail(`${path}.highlightIds`, 'expected an array of datum IDs')
      const datumIds = new Set(parsedData.map((datum) => datum.id))
      const highlightIds = data.highlightIds.map((value, highlightIndex) => {
        const highlightId = id(value, `${path}.highlightIds[${highlightIndex}]`)
        if (!datumIds.has(highlightId)) fail(`${path}.highlightIds[${highlightIndex}]`, `unknown datum ID "${highlightId}"`)
        return highlightId
      })
      if (new Set(highlightIds).size !== highlightIds.length) fail(`${path}.highlightIds`, 'expected unique datum IDs')
      const domain = chartDomain(data.domain, `${path}.domain`)
      parsedData.forEach((datum, datumIndex) => {
        if (domain?.min !== undefined && datum.value < domain.min) fail(`${path}.data[${datumIndex}].value`, `expected a value within the explicit domain (minimum ${domain.min})`)
        if (domain?.max !== undefined && datum.value > domain.max) fail(`${path}.data[${datumIndex}].value`, `expected a value within the explicit domain (maximum ${domain.max})`)
      })
      let decimalPlaces: number | undefined
      if (data.decimalPlaces !== undefined) {
        decimalPlaces = numericValue(data.decimalPlaces, `${path}.decimalPlaces`)
        if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) fail(`${path}.decimalPlaces`, 'expected an integer from 0 to 6')
      }
      return {
        ...base,
        type: 'chart',
        headline: string(data.headline, `${path}.headline`),
        chartType: data.chartType,
        orientation: data.orientation,
        data: parsedData,
        highlightIds,
        valuePrefix: optionalString(data.valuePrefix, `${path}.valuePrefix`),
        valueSuffix: optionalString(data.valueSuffix, `${path}.valueSuffix`),
        decimalPlaces,
        showValues: boolean(data.showValues, `${path}.showValues`),
        source: optionalString(data.source, `${path}.source`),
        supportingText: optionalString(data.supportingText, `${path}.supportingText`),
        chartId: optionalId(data.chartId, `${path}.chartId`),
        domain,
      }
    }
    default:
      return fail(`${path}.type`, 'expected title, text, big-stat, comparison, stat-detail, or chart')
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
