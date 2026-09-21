import type {
  CompositionArrowElement,
  CompositionChartElement,
  CompositionElement,
  CompositionImageElement,
  CompositionShape,
  CompositionShapeElement,
  CompositionTextElement,
  Presentation,
  Scene,
} from './model'

export type SceneType = Scene['type']

export const sceneTypeOptions: ReadonlyArray<{ type: SceneType; label: string }> = [
  { type: 'title', label: 'Title' },
  { type: 'text', label: 'Text' },
  { type: 'big-stat', label: 'Big Stat' },
  { type: 'comparison', label: 'Comparison' },
  { type: 'stat-detail', label: 'Stat Detail' },
  { type: 'chart', label: 'Chart' },
  { type: 'composition', label: 'Composition' },
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
    case 'chart': {
      const chartId = createStableId('chart')
      return {
        ...base,
        type,
        title: 'Chart',
        eyebrow: 'Sample data',
        headline: 'Compare the values.',
        chartType: 'bar',
        orientation: 'horizontal',
        data: [
          { id: createStableId('alpha'), label: 'Alpha', value: 28 },
          { id: createStableId('beta'), label: 'Beta', value: 21 },
          { id: createStableId('gamma'), label: 'Gamma', value: 13 },
        ],
        highlightIds: [],
        valueSuffix: '%',
        showValues: true,
        source: 'Illustrative sample data',
        supportingText: 'Replace these placeholder values with sourced data.',
        chartId,
      }
    }
    case 'composition':
      return {
        ...base,
        type,
        title: 'Composition',
        eyebrow: 'Custom layout',
        background: 'presentation',
        elements: [],
      }
  }
}

export type CompositionElementType = CompositionElement['type']

export function createCompositionTextElement(): CompositionTextElement {
  return {
    id: createStableId('text'),
    type: 'text',
    name: 'Headline',
    frame: { x: 140, y: 300, width: 800, height: 220, rotation: 0, opacity: 1 },
    text: 'Add your text.',
    role: 'headline',
    fontSize: 78,
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.05,
    letterSpacing: 0,
  }
}

export function createCompositionImageElement(assetId = ''): CompositionImageElement {
  return {
    id: createStableId('image'),
    type: 'image',
    name: 'Image',
    frame: { x: 190, y: 500, width: 700, height: 700, rotation: 0, opacity: 1 },
    assetId,
    fit: 'contain',
    position: 'center',
    flipX: false,
    flipY: false,
  }
}

export function createCompositionChartElement(): CompositionChartElement {
  return {
    id: createStableId('chart'),
    type: 'chart',
    name: 'Bar Chart',
    frame: { x: 100, y: 500, width: 880, height: 760, rotation: 0, opacity: 1 },
    chartType: 'bar',
    orientation: 'horizontal',
    data: [
      { id: createStableId('alpha'), label: 'Alpha', value: 28 },
      { id: createStableId('beta'), label: 'Beta', value: 21 },
      { id: createStableId('gamma'), label: 'Gamma', value: 13 },
    ],
    highlightIds: [],
    valueSuffix: '%',
    showValues: true,
    chartId: createStableId('chart'),
  }
}

export function createCompositionShapeElement(shape: CompositionShape = 'rectangle'): CompositionShapeElement {
  const isLine = shape === 'line'
  return {
    id: createStableId(shape),
    type: 'shape',
    name: shape === 'rectangle' ? 'Rectangle' : shape === 'circle' ? 'Circle' : 'Line',
    shape,
    frame: isLine
      ? { x: 240, y: 940, width: 600, height: 8, rotation: 0, opacity: 1 }
      : { x: 290, y: 650, width: 500, height: 500, rotation: 0, opacity: 1 },
    ...(isLine ? { stroke: '#ff554f', strokeWidth: 8 } : { fill: '#ff554f' }),
  }
}

export function createCompositionArrowElement(): CompositionArrowElement {
  return {
    id: createStableId('arrow'),
    type: 'arrow',
    name: 'Arrow',
    frame: { x: 240, y: 940, width: 600, height: 80, rotation: 0, opacity: 1 },
    stroke: '#ff554f',
    strokeWidth: 10,
    startCap: 'none',
    endCap: 'arrow',
  }
}

export function createCompositionElement(type: CompositionElementType): CompositionElement {
  switch (type) {
    case 'text': return createCompositionTextElement()
    case 'image': return createCompositionImageElement()
    case 'chart': return createCompositionChartElement()
    case 'shape': return createCompositionShapeElement()
    case 'arrow': return createCompositionArrowElement()
  }
}

export function duplicateCompositionElement(element: CompositionElement): CompositionElement {
  const copy = structuredClone(element)
  return {
    ...copy,
    id: createStableId(element.type),
    name: `${element.name} copy`,
    frame: { ...copy.frame, x: copy.frame.x + 24, y: copy.frame.y + 24 },
    sharedElementId: undefined,
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
  const copy = structuredClone(scene)
  if (copy.type === 'composition') {
    return {
      ...copy,
      id: createStableId(scene.type),
      title: `${scene.title} copy`,
      elements: copy.elements.map((element) => ({ ...element, id: createStableId(element.type) })),
    }
  }
  return { ...copy, id: createStableId(scene.type), title: `${scene.title} copy` }
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
