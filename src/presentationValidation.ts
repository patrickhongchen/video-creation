import type {
  ChartDatum,
  ChartDomain,
  ChartOrientation,
  ChartType,
  CompositionElement,
  CompositionScene,
  NarrationStructure,
  Presentation,
  PresentationImageAsset,
  PresentationImageMimeType,
  Scene,
  SceneTransition,
} from './model'

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

function optionalBoolean(value: unknown, path: string): boolean | undefined {
  return value === undefined ? undefined : boolean(value, path)
}

function boundedNumber(value: unknown, path: string, minimum: number, maximum: number): number {
  const result = numericValue(value, path)
  if (result < minimum || result > maximum) fail(path, `expected a number from ${minimum} to ${maximum}`)
  return result
}

function positiveNumber(value: unknown, path: string): number {
  const result = numericValue(value, path)
  if (result <= 0) fail(path, 'expected a number greater than 0')
  return result
}

function optionalColor(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined
  const result = string(value, path)
  if (!/^#[0-9a-f]{6}$/i.test(result)) fail(path, 'expected a six-digit hex color such as #ff554f')
  return result
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

function chartProperties(data: Record<string, unknown>, path: string) {
  if (data.chartType !== 'bar' && data.chartType !== 'line') fail(`${path}.chartType`, 'expected bar or line')
  const chartType: ChartType = data.chartType
  if (data.orientation !== undefined && data.orientation !== 'horizontal' && data.orientation !== 'vertical') fail(`${path}.orientation`, 'expected horizontal or vertical')
  const orientation = data.orientation as ChartOrientation | undefined
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
    chartType,
    orientation,
    data: parsedData,
    highlightIds,
    valuePrefix: optionalString(data.valuePrefix, `${path}.valuePrefix`),
    valueSuffix: optionalString(data.valueSuffix, `${path}.valueSuffix`),
    decimalPlaces,
    showValues: boolean(data.showValues, `${path}.showValues`),
    chartId: optionalId(data.chartId, `${path}.chartId`),
    domain,
  }
}

function elementFrame(value: unknown, path: string) {
  const data = object(value, path)
  const rotation = data.rotation === undefined ? undefined : boundedNumber(data.rotation, `${path}.rotation`, -360, 360)
  const opacity = data.opacity === undefined ? undefined : boundedNumber(data.opacity, `${path}.opacity`, 0, 1)
  return {
    x: numericValue(data.x, `${path}.x`),
    y: numericValue(data.y, `${path}.y`),
    width: positiveNumber(data.width, `${path}.width`),
    height: positiveNumber(data.height, `${path}.height`),
    rotation,
    opacity,
  }
}

function elementBase(data: Record<string, unknown>, path: string) {
  const name = string(data.name, `${path}.name`)
  if (!name.trim()) fail(`${path}.name`, 'expected a non-empty name')
  return {
    id: id(data.id, `${path}.id`),
    name,
    frame: elementFrame(data.frame, `${path}.frame`),
    locked: optionalBoolean(data.locked, `${path}.locked`),
    hidden: optionalBoolean(data.hidden, `${path}.hidden`),
    sharedElementId: optionalId(data.sharedElementId, `${path}.sharedElementId`),
  }
}

function parseCompositionElement(value: unknown, path: string, assetIds: ReadonlySet<string>): CompositionElement {
  const data = object(value, path)
  const base = elementBase(data, path)
  switch (data.type) {
    case 'text': {
      if (data.role !== undefined && data.role !== 'headline' && data.role !== 'body' && data.role !== 'caption' && data.role !== 'label') {
        fail(`${path}.role`, 'expected headline, body, caption, or label')
      }
      if (data.textAlign !== undefined && data.textAlign !== 'left' && data.textAlign !== 'center' && data.textAlign !== 'right') {
        fail(`${path}.textAlign`, 'expected left, center, or right')
      }
      let fontWeight: number | undefined
      if (data.fontWeight !== undefined) {
        fontWeight = boundedNumber(data.fontWeight, `${path}.fontWeight`, 100, 900)
        if (!Number.isInteger(fontWeight)) fail(`${path}.fontWeight`, 'expected an integer from 100 to 900')
      }
      return {
        ...base,
        type: 'text',
        text: string(data.text, `${path}.text`),
        role: data.role,
        fontSize: boundedNumber(data.fontSize, `${path}.fontSize`, 1, 512),
        fontWeight,
        textAlign: data.textAlign,
        lineHeight: data.lineHeight === undefined ? undefined : boundedNumber(data.lineHeight, `${path}.lineHeight`, 0.5, 3),
        letterSpacing: data.letterSpacing === undefined ? undefined : boundedNumber(data.letterSpacing, `${path}.letterSpacing`, -20, 100),
      }
    }
    case 'image': {
      const assetId = id(data.assetId, `${path}.assetId`)
      if (!assetIds.has(assetId)) fail(`${path}.assetId`, `references an unknown image asset "${assetId}"`)
      if (data.fit !== 'cover' && data.fit !== 'contain') fail(`${path}.fit`, 'expected cover or contain')
      const positions = ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
      if (data.position !== undefined && !positions.includes(data.position as typeof positions[number])) fail(`${path}.position`, `expected one of ${positions.join(', ')}`)
      return {
        ...base,
        type: 'image',
        assetId,
        fit: data.fit,
        position: data.position as typeof positions[number] | undefined,
        flipX: optionalBoolean(data.flipX, `${path}.flipX`),
        flipY: optionalBoolean(data.flipY, `${path}.flipY`),
      }
    }
    case 'chart':
      return { ...base, type: 'chart', ...chartProperties(data, path) }
    case 'shape': {
      if (data.shape !== 'rectangle' && data.shape !== 'circle' && data.shape !== 'line') fail(`${path}.shape`, 'expected rectangle, circle, or line')
      return {
        ...base,
        type: 'shape',
        shape: data.shape,
        fill: optionalColor(data.fill, `${path}.fill`),
        stroke: optionalColor(data.stroke, `${path}.stroke`),
        strokeWidth: data.strokeWidth === undefined ? undefined : finiteNumber(data.strokeWidth, `${path}.strokeWidth`),
      }
    }
    case 'arrow': {
      if (data.startCap !== undefined && data.startCap !== 'none' && data.startCap !== 'dot') fail(`${path}.startCap`, 'expected none or dot')
      if (data.endCap !== undefined && data.endCap !== 'none' && data.endCap !== 'arrow') fail(`${path}.endCap`, 'expected none or arrow')
      return {
        ...base,
        type: 'arrow',
        stroke: optionalColor(data.stroke, `${path}.stroke`),
        strokeWidth: data.strokeWidth === undefined ? undefined : positiveNumber(data.strokeWidth, `${path}.strokeWidth`),
        startCap: data.startCap,
        endCap: data.endCap,
      }
    }
    default:
      return fail(`${path}.type`, 'expected text, image, chart, shape, or arrow')
  }
}

function parseScene(value: unknown, index: number, assetIds: ReadonlySet<string>): Scene {
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
      return {
        ...base,
        type: 'chart',
        headline: string(data.headline, `${path}.headline`),
        ...chartProperties(data, path),
        source: optionalString(data.source, `${path}.source`),
        supportingText: optionalString(data.supportingText, `${path}.supportingText`),
      }
    }
    case 'composition': {
      if (!Array.isArray(data.elements)) fail(`${path}.elements`, 'expected an array')
      const elements = data.elements.map((element, elementIndex) => parseCompositionElement(element, `${path}.elements[${elementIndex}]`, assetIds))
      const elementIds = new Set<string>()
      const sharedIds = new Set<string>()
      elements.forEach((element, elementIndex) => {
        if (elementIds.has(element.id)) fail(`${path}.elements[${elementIndex}].id`, `duplicate element ID "${element.id}"`)
        elementIds.add(element.id)
        if (element.sharedElementId) {
          if (sharedIds.has(element.sharedElementId)) fail(`${path}.elements[${elementIndex}].sharedElementId`, `duplicate shared element identity "${element.sharedElementId}" in this scene`)
          sharedIds.add(element.sharedElementId)
        }
      })
      const background = data.background === undefined ? undefined : string(data.background, `${path}.background`)
      if (background !== undefined && background !== 'presentation' && background !== 'light' && background !== 'dark' && background !== 'accent' && !/^#[0-9a-f]{6}$/i.test(background)) {
        fail(`${path}.background`, 'expected presentation, light, dark, accent, or a six-digit hex color')
      }
      return { ...base, type: 'composition', background: background as CompositionScene['background'], elements }
    }
    default:
      return fail(`${path}.type`, 'expected title, text, big-stat, comparison, stat-detail, chart, or composition')
  }
}

function narration(value: unknown, scenes: Scene[]): NarrationStructure | undefined {
  if (value === undefined) return undefined
  const data = object(value, 'presentation.narration')
  if (!Array.isArray(data.sections)) fail('presentation.narration.sections', 'expected an array')

  const sceneIndex = new Map(scenes.map((scene, index) => [scene.id, index]))
  const sectionIds = new Set<string>()
  const assignedSceneIds = new Set<string>()
  const sections = data.sections.map((candidate, index) => {
    const path = `presentation.narration.sections[${index}]`
    const section = object(candidate, path)
    const sectionId = id(section.id, `${path}.id`)
    if (sectionIds.has(sectionId)) fail(`${path}.id`, `duplicate narration section ID "${sectionId}"`)
    sectionIds.add(sectionId)
    if (!Array.isArray(section.sceneIds) || section.sceneIds.length === 0) fail(`${path}.sceneIds`, 'expected at least one scene ID')
    const sceneIds = section.sceneIds.map((candidateId, sceneIndexInSection) => id(candidateId, `${path}.sceneIds[${sceneIndexInSection}]`))
    if (new Set(sceneIds).size !== sceneIds.length) fail(`${path}.sceneIds`, 'expected unique scene IDs')
    const positions = sceneIds.map((sceneId, sceneIndexInSection) => {
      const position = sceneIndex.get(sceneId)
      if (position === undefined) fail(`${path}.sceneIds[${sceneIndexInSection}]`, `unknown scene ID "${sceneId}"`)
      if (assignedSceneIds.has(sceneId)) fail(`${path}.sceneIds[${sceneIndexInSection}]`, `scene "${sceneId}" already belongs to another narration section`)
      assignedSceneIds.add(sceneId)
      return position
    })
    positions.forEach((position, positionIndex) => {
      if (positionIndex > 0 && position !== positions[positionIndex - 1] + 1) fail(`${path}.sceneIds`, 'expected a contiguous range in presentation order')
    })
    return { id: sectionId, title: string(section.title, `${path}.title`), sceneIds }
  })

  return { sections }
}

const IMAGE_MIME_TYPES: readonly PresentationImageMimeType[] = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

function imageAssets(value: unknown): PresentationImageAsset[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) fail('presentation.imageAssets', 'expected an array')
  const seenIds = new Set<string>()
  return value.map((candidate, index) => {
    const path = `presentation.imageAssets[${index}]`
    const data = object(candidate, path)
    const assetId = id(data.id, `${path}.id`)
    if (seenIds.has(assetId)) fail(`${path}.id`, `duplicate image asset ID "${assetId}"`)
    seenIds.add(assetId)
    const name = string(data.name, `${path}.name`)
    if (!name.trim()) fail(`${path}.name`, 'expected a non-empty name')
    const mimeType = string(data.mimeType, `${path}.mimeType`)
    if (!IMAGE_MIME_TYPES.includes(mimeType as PresentationImageMimeType)) fail(`${path}.mimeType`, `expected one of ${IMAGE_MIME_TYPES.join(', ')}`)
    const source = string(data.source, `${path}.source`)
    const dataUrl = /^data:([^;,]+)(?:;[^,]*)?,(.+)$/is.exec(source)
    if (!dataUrl) fail(`${path}.source`, 'expected a non-empty data URL')
    if (dataUrl[1].toLowerCase() !== mimeType.toLowerCase()) fail(`${path}.source`, `expected a data URL with MIME type ${mimeType}`)
    return { id: assetId, name, mimeType: mimeType as PresentationImageMimeType, source }
  })
}

function sharedElementSignature(element: CompositionElement): string {
  if (element.type === 'chart') return `chart:${element.chartType}:${element.chartType === 'bar' ? element.orientation ?? 'horizontal' : 'line'}`
  if (element.type === 'shape') return `shape:${element.shape}`
  return element.type
}

function validateReusableIdentities(scenes: Scene[]) {
  const sharedElements = new Map<string, { signature: string; path: string }>()
  const charts = new Map<string, { signature: string; path: string }>()

  const registerChart = (chartId: string | undefined, chartType: ChartType, orientation: ChartOrientation | undefined, path: string) => {
    if (!chartId) return
    const signature = chartType === 'bar' ? `${chartType}:${orientation ?? 'horizontal'}` : chartType
    const prior = charts.get(chartId)
    if (prior && prior.signature !== signature) fail(path, `chart ID "${chartId}" is already used by an incompatible ${prior.signature} chart at ${prior.path}`)
    charts.set(chartId, { signature, path })
  }

  scenes.forEach((scene, sceneIndex) => {
    const scenePath = `presentation.scenes[${sceneIndex}]`
    if (scene.type === 'chart') registerChart(scene.chartId, scene.chartType, scene.orientation, `${scenePath}.chartId`)
    if (scene.type !== 'composition') return
    scene.elements.forEach((element, elementIndex) => {
      const elementPath = `${scenePath}.elements[${elementIndex}]`
      if (element.type === 'chart') registerChart(element.chartId, element.chartType, element.orientation, `${elementPath}.chartId`)
      if (!element.sharedElementId) return
      const signature = sharedElementSignature(element)
      const prior = sharedElements.get(element.sharedElementId)
      if (prior && prior.signature !== signature) {
        fail(`${elementPath}.sharedElementId`, `shared identity "${element.sharedElementId}" is incompatible with ${prior.signature} at ${prior.path}`)
      }
      sharedElements.set(element.sharedElementId, { signature, path: `${elementPath}.sharedElementId` })
    })
  })
}

export function validatePresentation(value: unknown): Presentation {
  const data = object(value, 'presentation')
  if (data.schemaVersion !== 1) fail('presentation.schemaVersion', 'unsupported or missing version (expected 1)')
  if (data.aspectRatio !== '9:16') fail('presentation.aspectRatio', 'only 9:16 is supported')
  if (!Array.isArray(data.scenes) || data.scenes.length === 0) fail('presentation.scenes', 'expected at least one scene')
  const parsedImageAssets = imageAssets(data.imageAssets)
  const assetIds = new Set(parsedImageAssets?.map((asset) => asset.id) ?? [])
  const scenes = data.scenes.map((scene, index) => parseScene(scene, index, assetIds))
  const sceneIds = new Set<string>()
  scenes.forEach((scene, index) => {
    if (sceneIds.has(scene.id)) fail(`presentation.scenes[${index}].id`, `duplicate scene ID "${scene.id}"`)
    sceneIds.add(scene.id)
  })
  validateReusableIdentities(scenes)
  const narrationStructure = narration(data.narration, scenes)
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
    ...(parsedImageAssets ? { imageAssets: parsedImageAssets } : {}),
    scenes,
    ...(narrationStructure ? { narration: narrationStructure } : {}),
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
