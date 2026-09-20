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

export type Scene = TitleScene | TextScene | BigStatScene | ComparisonScene | StatDetailScene | ChartScene

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
  scenes: Scene[]
  narration?: NarrationStructure
}
