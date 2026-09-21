import type {
  ChartDatum,
  ChartDomain,
  ChartOrientation,
  ChartType,
  LegacyNarrationStructure,
  LegacyPresentation,
  LegacyScene,
  NarrationStructure,
  Presentation,
  PresentationImageAsset,
  PresentationImageMimeType,
  PresentationTheme,
  Slide,
  SlideElement,
  SlideTransition,
  ThemeTextStyle,
} from './model'
import { migratePresentationV1ToV2 } from './presentationMigration'

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

function nonEmptyString(value: unknown, path: string): string {
  const result = string(value, path)
  if (!result.trim()) fail(path, 'expected a non-empty string')
  return result
}

function optionalString(value: unknown, path: string) {
  return value === undefined ? undefined : string(value, path)
}

function id(value: unknown, path: string) {
  const result = string(value, path)
  if (!result.trim()) fail(path, 'expected a non-empty ID')
  return result
}

function optionalId(value: unknown, path: string) {
  return value === undefined ? undefined : id(value, path)
}

function numericValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a finite number')
  return value
}

function finiteNumber(value: unknown, path: string, minimum = 0): number {
  const result = numericValue(value, path)
  if (result < minimum) fail(path, `expected a number of at least ${minimum}`)
  return result
}

function positiveNumber(value: unknown, path: string): number {
  const result = numericValue(value, path)
  if (result <= 0) fail(path, 'expected a number greater than 0')
  return result
}

function boundedNumber(value: unknown, path: string, minimum: number, maximum: number): number {
  const result = numericValue(value, path)
  if (result < minimum || result > maximum) fail(path, `expected a number from ${minimum} to ${maximum}`)
  return result
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'expected a boolean')
  return value
}

function optionalBoolean(value: unknown, path: string) {
  return value === undefined ? undefined : boolean(value, path)
}

function color(value: unknown, path: string): string {
  const result = string(value, path)
  if (!/^#[0-9a-f]{6}$/i.test(result)) fail(path, 'expected a six-digit hex color such as #ff554f')
  return result
}

function optionalColor(value: unknown, path: string) {
  return value === undefined ? undefined : color(value, path)
}

function transition(value: unknown, path: string): SlideTransition {
  const data = object(value, path)
  if (data.type !== 'fade' && data.type !== 'slide' && data.type !== 'scale') {
    fail(`${path}.type`, 'expected fade, slide, or scale')
  }
  return { type: data.type, duration: finiteNumber(data.duration, `${path}.duration`) }
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
    return {
      id: datumId,
      label: nonEmptyString(data.label, `${datumPath}.label`),
      value: numericValue(data.value, `${datumPath}.value`),
    }
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
  if (data.orientation !== undefined && data.orientation !== 'horizontal' && data.orientation !== 'vertical') {
    fail(`${path}.orientation`, 'expected horizontal or vertical')
  }
  const orientation = data.orientation as ChartOrientation | undefined
  const parsedData = chartData(data.data, `${path}.data`)
  if (!Array.isArray(data.highlightIds)) fail(`${path}.highlightIds`, 'expected an array of datum IDs')
  const datumIds = new Set(parsedData.map((datum) => datum.id))
  const highlightIds = data.highlightIds.map((value, index) => {
    const highlightId = id(value, `${path}.highlightIds[${index}]`)
    if (!datumIds.has(highlightId)) fail(`${path}.highlightIds[${index}]`, `unknown datum ID "${highlightId}"`)
    return highlightId
  })
  if (new Set(highlightIds).size !== highlightIds.length) fail(`${path}.highlightIds`, 'expected unique datum IDs')
  const domain = chartDomain(data.domain, `${path}.domain`)
  parsedData.forEach((datum, index) => {
    if (domain?.min !== undefined && datum.value < domain.min) {
      fail(`${path}.data[${index}].value`, `expected a value within the explicit domain (minimum ${domain.min})`)
    }
    if (domain?.max !== undefined && datum.value > domain.max) {
      fail(`${path}.data[${index}].value`, `expected a value within the explicit domain (maximum ${domain.max})`)
    }
  })
  let decimalPlaces: number | undefined
  if (data.decimalPlaces !== undefined) {
    decimalPlaces = numericValue(data.decimalPlaces, `${path}.decimalPlaces`)
    if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) {
      fail(`${path}.decimalPlaces`, 'expected an integer from 0 to 6')
    }
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
  return {
    x: numericValue(data.x, `${path}.x`),
    y: numericValue(data.y, `${path}.y`),
    width: positiveNumber(data.width, `${path}.width`),
    height: positiveNumber(data.height, `${path}.height`),
    rotation: data.rotation === undefined ? undefined : boundedNumber(data.rotation, `${path}.rotation`, -360, 360),
    opacity: data.opacity === undefined ? undefined : boundedNumber(data.opacity, `${path}.opacity`, 0, 1),
  }
}

function elementBase(data: Record<string, unknown>, path: string) {
  return {
    id: id(data.id, `${path}.id`),
    name: nonEmptyString(data.name, `${path}.name`),
    frame: elementFrame(data.frame, `${path}.frame`),
    locked: optionalBoolean(data.locked, `${path}.locked`),
    hidden: optionalBoolean(data.hidden, `${path}.hidden`),
    sharedElementId: optionalId(data.sharedElementId, `${path}.sharedElementId`),
  }
}

function parseElement(value: unknown, path: string, assetIds: ReadonlySet<string>): SlideElement {
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
        fontFamily: data.fontFamily === undefined ? undefined : nonEmptyString(data.fontFamily, `${path}.fontFamily`),
        fontSize: data.fontSize === undefined ? undefined : boundedNumber(data.fontSize, `${path}.fontSize`, 1, 512),
        fontWeight,
        color: optionalColor(data.color, `${path}.color`),
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
      if (data.position !== undefined && !positions.includes(data.position as typeof positions[number])) {
        fail(`${path}.position`, `expected one of ${positions.join(', ')}`)
      }
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
    case 'shape':
      if (data.shape !== 'rectangle' && data.shape !== 'circle' && data.shape !== 'line') {
        fail(`${path}.shape`, 'expected rectangle, circle, or line')
      }
      return {
        ...base,
        type: 'shape',
        shape: data.shape,
        fill: optionalColor(data.fill, `${path}.fill`),
        stroke: optionalColor(data.stroke, `${path}.stroke`),
        strokeWidth: data.strokeWidth === undefined ? undefined : finiteNumber(data.strokeWidth, `${path}.strokeWidth`),
      }
    case 'arrow':
      if (data.startCap !== undefined && data.startCap !== 'none' && data.startCap !== 'dot') {
        fail(`${path}.startCap`, 'expected none or dot')
      }
      if (data.endCap !== undefined && data.endCap !== 'none' && data.endCap !== 'arrow') {
        fail(`${path}.endCap`, 'expected none or arrow')
      }
      return {
        ...base,
        type: 'arrow',
        stroke: optionalColor(data.stroke, `${path}.stroke`),
        strokeWidth: data.strokeWidth === undefined ? undefined : positiveNumber(data.strokeWidth, `${path}.strokeWidth`),
        startCap: data.startCap,
        endCap: data.endCap,
      }
    default:
      return fail(`${path}.type`, 'expected text, image, chart, shape, or arrow')
  }
}

function background(value: unknown, path: string) {
  if (value === undefined) return undefined
  const result = string(value, path)
  if (result !== 'presentation' && result !== 'light' && result !== 'dark' && result !== 'accent' && !/^#[0-9a-f]{6}$/i.test(result)) {
    fail(path, 'expected presentation, light, dark, accent, or a six-digit hex color')
  }
  return result as Slide['background']
}

function parseSlide(value: unknown, index: number, assetIds: ReadonlySet<string>): Slide {
  const path = `presentation.slides[${index}]`
  const data = object(value, path)
  if (!Array.isArray(data.elements)) fail(`${path}.elements`, 'expected an array')
  const elements = data.elements.map((element, elementIndex) => parseElement(element, `${path}.elements[${elementIndex}]`, assetIds))
  const elementIds = new Set<string>()
  const sharedIds = new Set<string>()
  elements.forEach((element, elementIndex) => {
    if (elementIds.has(element.id)) fail(`${path}.elements[${elementIndex}].id`, `duplicate element ID "${element.id}"`)
    elementIds.add(element.id)
    if (element.sharedElementId && sharedIds.has(element.sharedElementId)) {
      fail(`${path}.elements[${elementIndex}].sharedElementId`, `duplicate shared element identity "${element.sharedElementId}" in this slide`)
    }
    if (element.sharedElementId) sharedIds.add(element.sharedElementId)
  })
  return {
    id: id(data.id, `${path}.id`),
    title: string(data.title, `${path}.title`),
    duration: finiteNumber(data.duration, `${path}.duration`, 1),
    notes: optionalString(data.notes, `${path}.notes`),
    transition: transition(data.transition, `${path}.transition`),
    background: background(data.background, `${path}.background`),
    elements,
  }
}

function themeTextStyle(value: unknown, path: string): ThemeTextStyle {
  const data = object(value, path)
  const fontWeight = boundedNumber(data.fontWeight, `${path}.fontWeight`, 100, 900)
  if (!Number.isInteger(fontWeight)) fail(`${path}.fontWeight`, 'expected an integer from 100 to 900')
  return {
    fontFamily: data.fontFamily === undefined ? undefined : nonEmptyString(data.fontFamily, `${path}.fontFamily`),
    fontSize: boundedNumber(data.fontSize, `${path}.fontSize`, 1, 512),
    fontWeight,
    color: optionalColor(data.color, `${path}.color`),
    lineHeight: data.lineHeight === undefined ? undefined : boundedNumber(data.lineHeight, `${path}.lineHeight`, 0.5, 3),
    letterSpacing: data.letterSpacing === undefined ? undefined : boundedNumber(data.letterSpacing, `${path}.letterSpacing`, -20, 100),
  }
}

function theme(value: unknown): PresentationTheme {
  const path = 'presentation.theme'
  const data = object(value, path)
  const chart = object(data.chartStyle, `${path}.chartStyle`)
  return {
    id: id(data.id, `${path}.id`),
    name: data.name === undefined ? undefined : nonEmptyString(data.name, `${path}.name`),
    background: color(data.background, `${path}.background`),
    foreground: color(data.foreground, `${path}.foreground`),
    accent: color(data.accent, `${path}.accent`),
    fontFamily: nonEmptyString(data.fontFamily, `${path}.fontFamily`),
    defaultHeadlineStyle: themeTextStyle(data.defaultHeadlineStyle, `${path}.defaultHeadlineStyle`),
    defaultBodyStyle: themeTextStyle(data.defaultBodyStyle, `${path}.defaultBodyStyle`),
    defaultCaptionStyle: themeTextStyle(data.defaultCaptionStyle, `${path}.defaultCaptionStyle`),
    defaultLabelStyle: data.defaultLabelStyle === undefined
      ? undefined
      : themeTextStyle(data.defaultLabelStyle, `${path}.defaultLabelStyle`),
    chartStyle: {
      foreground: color(chart.foreground, `${path}.chartStyle.foreground`),
      muted: color(chart.muted, `${path}.chartStyle.muted`),
      grid: color(chart.grid, `${path}.chartStyle.grid`),
    },
  }
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
    const mimeType = string(data.mimeType, `${path}.mimeType`)
    if (!IMAGE_MIME_TYPES.includes(mimeType as PresentationImageMimeType)) {
      fail(`${path}.mimeType`, `expected one of ${IMAGE_MIME_TYPES.join(', ')}`)
    }
    const source = string(data.source, `${path}.source`)
    const dataUrl = /^data:([^;,]+)(?:;[^,]*)?,(.+)$/is.exec(source)
    if (!dataUrl) fail(`${path}.source`, 'expected a non-empty data URL')
    if (dataUrl[1].toLowerCase() !== mimeType.toLowerCase()) {
      fail(`${path}.source`, `expected a data URL with MIME type ${mimeType}`)
    }
    return {
      id: assetId,
      name: nonEmptyString(data.name, `${path}.name`),
      mimeType: mimeType as PresentationImageMimeType,
      source,
    }
  })
}

function sharedElementSignature(element: SlideElement): string {
  if (element.type === 'chart') return `chart:${element.chartType}:${element.chartType === 'bar' ? element.orientation ?? 'horizontal' : 'line'}`
  if (element.type === 'shape') return `shape:${element.shape}`
  return element.type
}

function validateReusableIdentities(slides: Slide[]) {
  const sharedElements = new Map<string, { signature: string; path: string }>()
  const charts = new Map<string, { signature: string; path: string }>()
  slides.forEach((slide, slideIndex) => {
    const slideChartIds = new Set<string>()
    slide.elements.forEach((element, elementIndex) => {
      const path = `presentation.slides[${slideIndex}].elements[${elementIndex}]`
      if (element.type === 'chart' && element.chartId) {
        if (slideChartIds.has(element.chartId)) {
          fail(`${path}.chartId`, `duplicate chart ID "${element.chartId}" in this slide`)
        }
        slideChartIds.add(element.chartId)
        const signature = element.chartType === 'bar'
          ? `${element.chartType}:${element.orientation ?? 'horizontal'}`
          : element.chartType
        const prior = charts.get(element.chartId)
        if (prior && prior.signature !== signature) {
          fail(`${path}.chartId`, `chart ID "${element.chartId}" is already used by an incompatible ${prior.signature} chart at ${prior.path}`)
        }
        charts.set(element.chartId, { signature, path: `${path}.chartId` })
      }
      if (!element.sharedElementId) return
      const signature = sharedElementSignature(element)
      const prior = sharedElements.get(element.sharedElementId)
      if (prior && prior.signature !== signature) {
        fail(`${path}.sharedElementId`, `shared identity "${element.sharedElementId}" is incompatible with ${prior.signature} at ${prior.path}`)
      }
      sharedElements.set(element.sharedElementId, { signature, path: `${path}.sharedElementId` })
    })
  })
}

function parseNarrationV2(value: unknown, slides: Slide[]): NarrationStructure | undefined {
  if (value === undefined) return undefined
  const data = object(value, 'presentation.narration')
  if (!Array.isArray(data.sections)) fail('presentation.narration.sections', 'expected an array')
  const slideIndex = new Map(slides.map((slide, index) => [slide.id, index]))
  const sectionIds = new Set<string>()
  const assignedSlideIds = new Set<string>()
  const sections = data.sections.map((candidate, index) => {
    const path = `presentation.narration.sections[${index}]`
    const section = object(candidate, path)
    const sectionId = id(section.id, `${path}.id`)
    if (sectionIds.has(sectionId)) fail(`${path}.id`, `duplicate narration section ID "${sectionId}"`)
    sectionIds.add(sectionId)
    if (!Array.isArray(section.slideIds) || section.slideIds.length === 0) fail(`${path}.slideIds`, 'expected at least one slide ID')
    const slideIds = section.slideIds.map((candidateId, itemIndex) => id(candidateId, `${path}.slideIds[${itemIndex}]`))
    if (new Set(slideIds).size !== slideIds.length) fail(`${path}.slideIds`, 'expected unique slide IDs')
    const positions = slideIds.map((slideId, itemIndex) => {
      const position = slideIndex.get(slideId)
      if (position === undefined) fail(`${path}.slideIds[${itemIndex}]`, `unknown slide ID "${slideId}"`)
      if (assignedSlideIds.has(slideId)) fail(`${path}.slideIds[${itemIndex}]`, `slide "${slideId}" already belongs to another narration section`)
      assignedSlideIds.add(slideId)
      return position
    })
    positions.forEach((position, positionIndex) => {
      if (positionIndex > 0 && position !== positions[positionIndex - 1] + 1) {
        fail(`${path}.slideIds`, 'expected a contiguous range in presentation order')
      }
    })
    return { id: sectionId, title: string(section.title, `${path}.title`), slideIds }
  })
  return { sections }
}

function legacySceneBase(data: Record<string, unknown>, path: string) {
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

function parseLegacyScene(value: unknown, index: number, assetIds: ReadonlySet<string>): LegacyScene {
  const path = `presentation.scenes[${index}]`
  const data = object(value, path)
  const base = legacySceneBase(data, path)
  switch (data.type) {
    case 'title':
      return { ...base, type: 'title', headline: string(data.headline, `${path}.headline`), subtitle: optionalString(data.subtitle, `${path}.subtitle`) }
    case 'text':
      return { ...base, type: 'text', headline: string(data.headline, `${path}.headline`), body: string(data.body, `${path}.body`), callout: optionalString(data.callout, `${path}.callout`) }
    case 'big-stat':
      return { ...base, type: 'big-stat', value: string(data.value, `${path}.value`), label: string(data.label, `${path}.label`), supportingText: optionalString(data.supportingText, `${path}.supportingText`), elementId: optionalId(data.elementId, `${path}.elementId`) }
    case 'comparison':
      return { ...base, type: 'comparison', headline: string(data.headline, `${path}.headline`), left: pair(data.left, `${path}.left`), right: pair(data.right, `${path}.right`) }
    case 'stat-detail':
      return { ...base, type: 'stat-detail', value: string(data.value, `${path}.value`), label: string(data.label, `${path}.label`), headline: string(data.headline, `${path}.headline`), body: string(data.body, `${path}.body`), elementId: optionalId(data.elementId, `${path}.elementId`) }
    case 'chart':
      return {
        ...base,
        type: 'chart',
        headline: string(data.headline, `${path}.headline`),
        ...chartProperties(data, path),
        source: optionalString(data.source, `${path}.source`),
        supportingText: optionalString(data.supportingText, `${path}.supportingText`),
      }
    case 'composition': {
      if (!Array.isArray(data.elements)) fail(`${path}.elements`, 'expected an array')
      const elements = data.elements.map((element, elementIndex) => parseElement(element, `${path}.elements[${elementIndex}]`, assetIds))
      const elementIds = new Set<string>()
      elements.forEach((element, elementIndex) => {
        if (elementIds.has(element.id)) fail(`${path}.elements[${elementIndex}].id`, `duplicate element ID "${element.id}"`)
        elementIds.add(element.id)
      })
      return { ...base, type: 'composition', background: background(data.background, `${path}.background`), elements }
    }
    default:
      return fail(`${path}.type`, 'expected title, text, big-stat, comparison, stat-detail, chart, or composition')
  }
}

function parseLegacyNarration(value: unknown, scenes: LegacyScene[]): LegacyNarrationStructure | undefined {
  if (value === undefined) return undefined
  const data = object(value, 'presentation.narration')
  if (!Array.isArray(data.sections)) fail('presentation.narration.sections', 'expected an array')
  const sceneIndex = new Map(scenes.map((scene, index) => [scene.id, index]))
  const sectionIds = new Set<string>()
  const assigned = new Set<string>()
  return {
    sections: data.sections.map((candidate, index) => {
      const path = `presentation.narration.sections[${index}]`
      const section = object(candidate, path)
      const sectionId = id(section.id, `${path}.id`)
      if (sectionIds.has(sectionId)) fail(`${path}.id`, `duplicate narration section ID "${sectionId}"`)
      sectionIds.add(sectionId)
      if (!Array.isArray(section.sceneIds) || section.sceneIds.length === 0) fail(`${path}.sceneIds`, 'expected at least one scene ID')
      const sceneIds = section.sceneIds.map((candidateId, itemIndex) => id(candidateId, `${path}.sceneIds[${itemIndex}]`))
      const positions = sceneIds.map((sceneId, itemIndex) => {
        const position = sceneIndex.get(sceneId)
        if (position === undefined) fail(`${path}.sceneIds[${itemIndex}]`, `unknown scene ID "${sceneId}"`)
        if (assigned.has(sceneId)) fail(`${path}.sceneIds[${itemIndex}]`, `scene "${sceneId}" already belongs to another narration section`)
        assigned.add(sceneId)
        return position
      })
      if (new Set(sceneIds).size !== sceneIds.length) fail(`${path}.sceneIds`, 'expected unique scene IDs')
      positions.forEach((position, positionIndex) => {
        if (positionIndex > 0 && position !== positions[positionIndex - 1] + 1) {
          fail(`${path}.sceneIds`, 'expected a contiguous range in presentation order')
        }
      })
      return { id: sectionId, title: string(section.title, `${path}.title`), sceneIds }
    }),
  }
}

export function validateLegacyPresentation(value: unknown): LegacyPresentation {
  const data = object(value, 'presentation')
  if (data.schemaVersion !== 1) fail('presentation.schemaVersion', 'unsupported or missing version (expected 1)')
  if (data.aspectRatio !== '9:16') fail('presentation.aspectRatio', 'only 9:16 is supported')
  if (!Array.isArray(data.scenes) || data.scenes.length === 0) fail('presentation.scenes', 'expected at least one scene')
  const parsedAssets = imageAssets(data.imageAssets)
  const assetIds = new Set(parsedAssets?.map((asset) => asset.id) ?? [])
  const scenes = data.scenes.map((scene, index) => parseLegacyScene(scene, index, assetIds))
  const sceneIds = new Set<string>()
  scenes.forEach((scene, index) => {
    if (sceneIds.has(scene.id)) fail(`presentation.scenes[${index}].id`, `duplicate scene ID "${scene.id}"`)
    sceneIds.add(scene.id)
  })
  const accent = color(data.accent, 'presentation.accent')
  const narration = parseLegacyNarration(data.narration, scenes)
  return {
    schemaVersion: 1,
    id: id(data.id, 'presentation.id'),
    title: string(data.title, 'presentation.title'),
    tagline: string(data.tagline, 'presentation.tagline'),
    aspectRatio: '9:16',
    accent,
    ...(parsedAssets ? { imageAssets: parsedAssets } : {}),
    scenes,
    ...(narration ? { narration } : {}),
  }
}

export function validatePresentationV2(value: unknown): Presentation {
  const data = object(value, 'presentation')
  if (data.schemaVersion !== 2) fail('presentation.schemaVersion', 'unsupported or missing version (expected 2)')
  if (data.aspectRatio !== '9:16') fail('presentation.aspectRatio', 'only 9:16 is supported')
  if (!Array.isArray(data.slides) || data.slides.length === 0) fail('presentation.slides', 'expected at least one slide')
  const parsedAssets = imageAssets(data.imageAssets)
  const assetIds = new Set(parsedAssets?.map((asset) => asset.id) ?? [])
  const slides = data.slides.map((slide, index) => parseSlide(slide, index, assetIds))
  const slideIds = new Set<string>()
  slides.forEach((slide, index) => {
    if (slideIds.has(slide.id)) fail(`presentation.slides[${index}].id`, `duplicate slide ID "${slide.id}"`)
    slideIds.add(slide.id)
  })
  validateReusableIdentities(slides)
  const narration = parseNarrationV2(data.narration, slides)
  return {
    schemaVersion: 2,
    id: id(data.id, 'presentation.id'),
    title: string(data.title, 'presentation.title'),
    tagline: string(data.tagline, 'presentation.tagline'),
    aspectRatio: '9:16',
    theme: theme(data.theme),
    ...(parsedAssets ? { imageAssets: parsedAssets } : {}),
    slides,
    ...(narration ? { narration } : {}),
  }
}

export function validatePresentation(value: unknown): Presentation {
  const data = object(value, 'presentation')
  if (data.schemaVersion === 1) return validatePresentationV2(migratePresentationV1ToV2(validateLegacyPresentation(value)))
  if (data.schemaVersion === 2) return validatePresentationV2(value)
  return fail('presentation.schemaVersion', 'unsupported or missing version (expected 1 or 2)')
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
