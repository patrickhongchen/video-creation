export type TransitionType = 'fade' | 'slide' | 'scale'

export interface SlideTransition {
  type: TransitionType
  duration: number
}

export const SLIDE_WIDTH = 1080
export const SLIDE_HEIGHT = 1920
export const COMPOSITION_WIDTH = SLIDE_WIDTH
export const COMPOSITION_HEIGHT = SLIDE_HEIGHT

export interface ElementFrame {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  opacity?: number
}

export interface SlideElementBase {
  id: string
  name: string
  frame: ElementFrame
  locked?: boolean
  hidden?: boolean
  sharedElementId?: string
}

export type TextRole = 'headline' | 'body' | 'caption' | 'label'
export type TextAlign = 'left' | 'center' | 'right'

export interface SlideTextElement extends SlideElementBase {
  type: 'text'
  text: string
  role?: TextRole
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  color?: string
  textAlign?: TextAlign
  lineHeight?: number
  letterSpacing?: number
}

export type ImageFit = 'cover' | 'contain'
export type ImagePosition = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface SlideImageElement extends SlideElementBase {
  type: 'image'
  assetId: string
  fit: ImageFit
  position?: ImagePosition
  flipX?: boolean
  flipY?: boolean
}

export type ChartType = 'bar' | 'line'
export type ChartOrientation = 'horizontal' | 'vertical'

export interface ChartDatum {
  id: string
  label: string
  value: number
}

export interface ChartDomain {
  min?: number
  max?: number
}

export interface SlideChartElement extends SlideElementBase {
  type: 'chart'
  chartType: ChartType
  orientation?: ChartOrientation
  data: ChartDatum[]
  highlightIds: string[]
  valuePrefix?: string
  valueSuffix?: string
  decimalPlaces?: number
  showValues: boolean
  chartId?: string
  domain?: ChartDomain
}

export type SlideShape = 'rectangle' | 'circle' | 'line'

export interface SlideShapeElement extends SlideElementBase {
  type: 'shape'
  shape: SlideShape
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface SlideArrowElement extends SlideElementBase {
  type: 'arrow'
  stroke?: string
  strokeWidth?: number
  startCap?: 'none' | 'dot'
  endCap?: 'none' | 'arrow'
}

export type SlideElement =
  | SlideTextElement
  | SlideImageElement
  | SlideChartElement
  | SlideShapeElement
  | SlideArrowElement

export type SlideBackground = 'presentation' | 'light' | 'dark' | 'accent' | `#${string}`

export interface Slide {
  id: string
  title: string
  duration: number
  notes?: string
  transition: SlideTransition
  background?: SlideBackground
  elements: SlideElement[]
}

export interface ThemeTextStyle {
  fontFamily?: string
  fontSize: number
  fontWeight: number
  color?: string
  lineHeight?: number
  letterSpacing?: number
}

export interface ThemeChartStyle {
  foreground: string
  muted: string
  grid: string
}

export interface PresentationTheme {
  id: string
  name?: string
  background: string
  foreground: string
  accent: string
  fontFamily: string
  defaultHeadlineStyle: ThemeTextStyle
  defaultBodyStyle: ThemeTextStyle
  defaultCaptionStyle: ThemeTextStyle
  defaultLabelStyle?: ThemeTextStyle
  chartStyle: ThemeChartStyle
}

export const DEFAULT_EDITORIAL_THEME: PresentationTheme = {
  id: 'editorial',
  name: 'Editorial',
  background: '#fffdf9',
  foreground: '#111821',
  accent: '#ff554f',
  fontFamily: 'Inter, system-ui, sans-serif',
  defaultHeadlineStyle: { fontSize: 92, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 },
  defaultBodyStyle: { fontSize: 38, fontWeight: 400, lineHeight: 1.35 },
  defaultCaptionStyle: { fontSize: 24, fontWeight: 500, lineHeight: 1.25 },
  defaultLabelStyle: { fontSize: 28, fontWeight: 700, lineHeight: 1.15, letterSpacing: 1 },
  chartStyle: { foreground: '#111821', muted: '#667386', grid: '#d9e0e7' },
}

export type PresentationImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'

export interface PresentationImageAsset {
  id: string
  name: string
  mimeType: PresentationImageMimeType
  /** Canonical project-relative path, for example assets/theater.jpg. */
  path?: string
  /** Runtime URL or legacy browser data URL. Desktop project saves omit runtime URLs. */
  source?: string
}

export interface NarrationSection {
  id: string
  title: string
  slideIds: string[]
}

export interface NarrationStructure {
  sections: NarrationSection[]
}

export interface Presentation {
  schemaVersion: 2
  id: string
  title: string
  tagline: string
  aspectRatio: '9:16'
  theme: PresentationTheme
  imageAssets?: PresentationImageAsset[]
  slides: Slide[]
  narration?: NarrationStructure
}

// Compatibility names for the Phase 5B element vocabulary.
export type SceneTransition = SlideTransition
export type Scene = Slide
export type CompositionElementBase = SlideElementBase
export type CompositionTextRole = TextRole
export type CompositionTextAlign = TextAlign
export type CompositionTextElement = SlideTextElement
export type CompositionImageElement = SlideImageElement
export type CompositionChartElement = SlideChartElement
export type CompositionShape = SlideShape
export type CompositionShapeElement = SlideShapeElement
export type CompositionArrowElement = SlideArrowElement
export type CompositionElement = SlideElement
export type CompositionBackground = SlideBackground
export type CompositionScene = Slide
export type TextElement = SlideTextElement
export type ImageElement = SlideImageElement
export type ChartElement = SlideChartElement
export type ShapeElement = SlideShapeElement
export type ArrowElement = SlideArrowElement

// v1 types intentionally live only at the import/migration boundary.
interface LegacySceneBase {
  id: string
  title: string
  duration: number
  notes?: string
  transition: SlideTransition
  eyebrow?: string
}

export interface TitleScene extends LegacySceneBase {
  type: 'title'
  headline: string
  subtitle?: string
}

export interface TextScene extends LegacySceneBase {
  type: 'text'
  headline: string
  body: string
  callout?: string
}

export interface BigStatScene extends LegacySceneBase {
  type: 'big-stat'
  value: string
  label: string
  supportingText?: string
  elementId?: string
}

export interface ComparisonScene extends LegacySceneBase {
  type: 'comparison'
  headline: string
  left: { label: string; value: string }
  right: { label: string; value: string }
}

export interface StatDetailScene extends LegacySceneBase {
  type: 'stat-detail'
  value: string
  label: string
  headline: string
  body: string
  elementId?: string
}

export interface ChartScene extends LegacySceneBase {
  type: 'chart'
  headline: string
  chartType: ChartType
  orientation?: ChartOrientation
  data: ChartDatum[]
  highlightIds: string[]
  valuePrefix?: string
  valueSuffix?: string
  decimalPlaces?: number
  showValues: boolean
  source?: string
  supportingText?: string
  chartId?: string
  domain?: ChartDomain
}

export interface LegacyCompositionScene extends LegacySceneBase {
  type: 'composition'
  background?: SlideBackground
  elements: SlideElement[]
}

export type LegacyScene = TitleScene | TextScene | BigStatScene | ComparisonScene | StatDetailScene | ChartScene | LegacyCompositionScene

export interface LegacyNarrationSection {
  id: string
  title: string
  sceneIds: string[]
}

export interface LegacyNarrationStructure {
  sections: LegacyNarrationSection[]
}

export interface LegacyPresentation {
  schemaVersion: 1
  id: string
  title: string
  tagline: string
  aspectRatio: '9:16'
  accent: string
  imageAssets?: PresentationImageAsset[]
  scenes: LegacyScene[]
  narration?: LegacyNarrationStructure
}
