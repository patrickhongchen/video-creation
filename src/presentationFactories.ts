import {
  DEFAULT_EDITORIAL_THEME,
  type Presentation,
  type PresentationTheme,
  type Slide,
  type SlideArrowElement,
  type SlideChartElement,
  type SlideElement,
  type SlideImageElement,
  type SlideShape,
  type SlideShapeElement,
  type SlideTextElement,
} from './model'

export type SlidePreset = 'blank' | 'title' | 'text' | 'big-stat' | 'comparison' | 'chart'

export const slidePresetOptions: ReadonlyArray<{ preset: SlidePreset; label: string }> = [
  { preset: 'blank', label: 'Blank' },
  { preset: 'title', label: 'Title' },
  { preset: 'text', label: 'Text' },
  { preset: 'big-stat', label: 'Big Stat' },
  { preset: 'comparison', label: 'Comparison' },
  { preset: 'chart', label: 'Chart' },
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

function presetText(
  name: string,
  text: string,
  role: SlideTextElement['role'],
  frame: SlideTextElement['frame'],
  fontSize: number,
  options: Partial<Pick<SlideTextElement, 'fontWeight' | 'textAlign' | 'color' | 'lineHeight' | 'letterSpacing' | 'sharedElementId'>> = {},
): SlideTextElement {
  return {
    id: createStableId('text'),
    type: 'text',
    name,
    frame: { rotation: 0, opacity: 1, ...frame },
    text,
    role,
    fontSize,
    ...options,
  }
}

function createPresetElements(preset: SlidePreset, accent: string): SlideElement[] {
  switch (preset) {
    case 'blank':
      return []
    case 'title':
      return [
        presetText('Eyebrow', 'A new presentation', 'label', { x: 100, y: 150, width: 880, height: 80 }, 28, { fontWeight: 700 }),
        presetText('Headline', 'Your headline\ngoes here.', 'headline', { x: 100, y: 520, width: 880, height: 430 }, 108, { fontWeight: 800 }),
        presetText('Subtitle', 'Add a concise supporting thought.', 'body', { x: 100, y: 1060, width: 800, height: 220 }, 42),
      ]
    case 'text':
      return [
        presetText('Eyebrow', 'The next idea', 'label', { x: 100, y: 150, width: 880, height: 80 }, 28, { fontWeight: 700 }),
        presetText('Headline', 'Build the argument.', 'headline', { x: 100, y: 350, width: 880, height: 300 }, 92, { fontWeight: 800 }),
        presetText('Body', 'Use this space to explain the next beat of your story.', 'body', { x: 100, y: 790, width: 800, height: 430 }, 40),
        presetText('Callout', 'A short takeaway.', 'caption', { x: 100, y: 1490, width: 880, height: 150 }, 30, { fontWeight: 700 }),
      ]
    case 'big-stat':
      return [
        presetText('Eyebrow', 'The key figure', 'label', { x: 100, y: 150, width: 880, height: 80 }, 28, { fontWeight: 700 }),
        presetText('Value', '42%', 'headline', { x: 100, y: 500, width: 880, height: 300 }, 190, {
          fontWeight: 800, color: accent, sharedElementId: createStableId('stat'),
        }),
        presetText('Label', 'a meaningful statistic', 'label', { x: 100, y: 820, width: 800, height: 180 }, 42, { fontWeight: 700 }),
        presetText('Supporting text', 'Add context and cite the source in your notes.', 'body', { x: 100, y: 1160, width: 800, height: 300 }, 34),
      ]
    case 'comparison':
      return [
        presetText('Headline', 'Compare two ideas.', 'headline', { x: 100, y: 300, width: 880, height: 280 }, 84, { fontWeight: 800 }),
        presetText('Left value', '1', 'headline', { x: 100, y: 820, width: 390, height: 230 }, 138, { fontWeight: 800 }),
        presetText('Left label', 'Before', 'label', { x: 100, y: 1060, width: 390, height: 120 }, 32, { fontWeight: 700 }),
        presetText('Right value', '2', 'headline', { x: 590, y: 820, width: 390, height: 230 }, 138, { fontWeight: 800, color: accent }),
        presetText('Right label', 'After', 'label', { x: 590, y: 1060, width: 390, height: 120 }, 32, { fontWeight: 700 }),
      ]
    case 'chart':
      return [
        presetText('Headline', 'Compare the values.', 'headline', { x: 100, y: 220, width: 880, height: 280 }, 78, { fontWeight: 800 }),
        createSlideChartElement(),
        presetText('Source', 'Illustrative sample data', 'caption', { x: 100, y: 1600, width: 880, height: 90 }, 22),
      ]
  }
}

export function createSlideFromPreset(
  preset: SlidePreset,
  themeOrOptions: PresentationTheme | { title?: string } = DEFAULT_EDITORIAL_THEME,
): Slide {
  const theme = 'accent' in themeOrOptions ? themeOrOptions : DEFAULT_EDITORIAL_THEME
  const options = 'accent' in themeOrOptions ? {} : themeOrOptions
  const title = options.title ?? ({
    blank: 'Blank slide',
    title: 'Title slide',
    text: 'Text slide',
    'big-stat': 'Big stat',
    comparison: 'Comparison',
    chart: 'Chart',
  } satisfies Record<SlidePreset, string>)[preset]
  return {
    id: createStableId(preset),
    title,
    duration: 4,
    transition: { type: 'fade', duration: 0.55 },
    background: 'presentation',
    elements: createPresetElements(preset, theme.accent),
  }
}

export function createSlideTextElement(): SlideTextElement {
  return presetText('Headline', 'Add your text.', 'headline', {
    x: 140, y: 300, width: 800, height: 220,
  }, 78, { fontWeight: 700, textAlign: 'center', lineHeight: 1.05, letterSpacing: 0 })
}

export function createSlideImageElement(assetId = ''): SlideImageElement {
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

export function createSlideChartElement(): SlideChartElement {
  return {
    id: createStableId('chart-element'),
    type: 'chart',
    name: 'Bar Chart',
    frame: { x: 100, y: 570, width: 880, height: 850, rotation: 0, opacity: 1 },
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

export function createSlideShapeElement(shape: SlideShape = 'rectangle'): SlideShapeElement {
  const isLine = shape === 'line'
  return {
    id: createStableId(shape),
    type: 'shape',
    name: shape === 'rectangle' ? 'Rectangle' : shape === 'circle' ? 'Circle' : 'Line',
    shape,
    frame: isLine
      ? { x: 240, y: 940, width: 600, height: 8, rotation: 0, opacity: 1 }
      : { x: 290, y: 650, width: 500, height: 500, rotation: 0, opacity: 1 },
    ...(isLine ? { stroke: DEFAULT_EDITORIAL_THEME.accent, strokeWidth: 8 } : { fill: DEFAULT_EDITORIAL_THEME.accent }),
  }
}

export function createSlideArrowElement(): SlideArrowElement {
  return {
    id: createStableId('arrow'),
    type: 'arrow',
    name: 'Arrow',
    frame: { x: 240, y: 940, width: 600, height: 80, rotation: 0, opacity: 1 },
    stroke: DEFAULT_EDITORIAL_THEME.accent,
    strokeWidth: 10,
    startCap: 'none',
    endCap: 'arrow',
  }
}

export type SlideElementType = SlideElement['type']

export function createSlideElement(type: SlideElementType): SlideElement {
  switch (type) {
    case 'text': return createSlideTextElement()
    case 'image': return createSlideImageElement()
    case 'chart': return createSlideChartElement()
    case 'shape': return createSlideShapeElement()
    case 'arrow': return createSlideArrowElement()
  }
}

export function duplicateSlideElement(element: SlideElement): SlideElement {
  const copy = structuredClone(element)
  return {
    ...copy,
    id: createStableId(element.type),
    name: `${element.name} copy`,
    frame: { ...copy.frame, x: copy.frame.x + 24, y: copy.frame.y + 24 },
    sharedElementId: undefined,
  }
}

export function duplicateSlide(slide: Slide): Slide {
  const copy = structuredClone(slide)
  return {
    ...copy,
    id: createStableId('slide'),
    title: `${slide.title} copy`,
    elements: copy.elements.map((element) => ({
      ...element,
      id: createStableId(element.type),
    })),
  }
}

export function createBlankPresentation(title = 'Untitled Presentation'): Presentation {
  return {
    schemaVersion: 2,
    id: createStableId(slugify(title)),
    title,
    tagline: 'A new presentation.',
    aspectRatio: '9:16',
    theme: structuredClone(DEFAULT_EDITORIAL_THEME),
    slides: [createSlideFromPreset('blank')],
  }
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

// Temporary API aliases while callers adopt Slide terminology.
export type SceneType = SlidePreset | 'composition' | 'stat-detail'
export const sceneTypeOptions: ReadonlyArray<{ type: SceneType; label: string }> = [
  ...slidePresetOptions.filter(({ preset }) => preset !== 'blank').map(({ preset, label }) => ({ type: preset, label })),
  { type: 'composition', label: 'Blank' },
]
export function createScene(type: SceneType): Slide {
  return createSlideFromPreset(type === 'composition' ? 'blank' : type === 'stat-detail' ? 'big-stat' : type)
}
export type CompositionElementType = SlideElementType
export const createCompositionTextElement = createSlideTextElement
export const createCompositionImageElement = createSlideImageElement
export const createCompositionChartElement = createSlideChartElement
export const createCompositionShapeElement = createSlideShapeElement
export const createCompositionArrowElement = createSlideArrowElement
export const createCompositionElement = createSlideElement
export const duplicateCompositionElement = duplicateSlideElement
export const duplicateScene = duplicateSlide
export { DEFAULT_EDITORIAL_THEME }
