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

export type Scene = TitleScene | TextScene | BigStatScene | ComparisonScene | StatDetailScene

export interface Presentation {
  id: string
  title: string
  tagline: string
  aspectRatio: '9:16'
  accent: string
  scenes: Scene[]
}
