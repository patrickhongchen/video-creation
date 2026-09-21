export type TransitionType = 'fade' | 'slide' | 'scale'

export interface SceneTransition {
  type: TransitionType
  duration: number
}

interface SceneBase {
  id: string
  title: string
  duration: number
  notes?: string
  transition: SceneTransition
  eyebrow?: string
}

export interface TitleScene extends SceneBase {
  type: 'title'
  headline: string
  subtitle?: string
}

export interface TextScene extends SceneBase {
  type: 'text'
  headline: string
  body: string
  callout?: string
}

export interface BigStatScene extends SceneBase {
  type: 'big-stat'
  value: string
  label: string
  supportingText?: string
  elementId?: string
}

export interface ComparisonScene extends SceneBase {
  type: 'comparison'
  headline: string
  left: { label: string; value: string }
  right: { label: string; value: string }
}

export interface StatDetailScene extends SceneBase {
  type: 'stat-detail'
  value: string
  label: string
  headline: string
  body: string
  elementId?: string
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

export interface ChartScene extends SceneBase {
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

export const COMPOSITION_WIDTH = 1080
export const COMPOSITION_HEIGHT = 1920

export interface ElementFrame {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  opacity?: number
}

export interface CompositionElementBase {
  id: string
  name: string
  frame: ElementFrame
  locked?: boolean
  hidden?: boolean
  sharedElementId?: string
}

export type CompositionTextRole = 'headline' | 'body' | 'caption' | 'label'
export type CompositionTextAlign = 'left' | 'center' | 'right'

export interface CompositionTextElement extends CompositionElementBase {
  type: 'text'
  text: string
  role?: CompositionTextRole
  fontSize: number
  fontWeight?: number
  textAlign?: CompositionTextAlign
  lineHeight?: number
  letterSpacing?: number
}

export type ImageFit = 'cover' | 'contain'
export type ImagePosition = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface CompositionImageElement extends CompositionElementBase {
  type: 'image'
  assetId: string
  fit: ImageFit
  position?: ImagePosition
  flipX?: boolean
  flipY?: boolean
}

export interface CompositionChartElement extends CompositionElementBase {
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

export type CompositionShape = 'rectangle' | 'circle' | 'line'

export interface CompositionShapeElement extends CompositionElementBase {
  type: 'shape'
  shape: CompositionShape
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface CompositionArrowElement extends CompositionElementBase {
  type: 'arrow'
  stroke?: string
  strokeWidth?: number
  startCap?: 'none' | 'dot'
  endCap?: 'none' | 'arrow'
}

export type CompositionElement =
  | CompositionTextElement
  | CompositionImageElement
  | CompositionChartElement
  | CompositionShapeElement
  | CompositionArrowElement

export type CompositionBackground = 'presentation' | 'light' | 'dark' | 'accent' | `#${string}`

export interface CompositionScene extends SceneBase {
  type: 'composition'
  background?: CompositionBackground
  elements: CompositionElement[]
}

export type PresentationImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'

export interface PresentationImageAsset {
  id: string
  name: string
  mimeType: PresentationImageMimeType
  source: string
}

export type Scene = TitleScene | TextScene | BigStatScene | ComparisonScene | StatDetailScene | ChartScene | CompositionScene

export interface NarrationSection {
  id: string
  title: string
  sceneIds: string[]
}

export interface NarrationStructure {
  sections: NarrationSection[]
}

export interface Presentation {
  schemaVersion: 1
  id: string
  title: string
  tagline: string
  aspectRatio: '9:16'
  accent: string
  imageAssets?: PresentationImageAsset[]
  scenes: Scene[]
  narration?: NarrationStructure
}
