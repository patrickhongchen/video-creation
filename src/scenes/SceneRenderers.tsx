import { motion } from 'motion/react'
import type { ComponentType } from 'react'
import { BarChart, LineChart } from '../charts'
import type { BigStatScene, ChartScene, ComparisonScene, Scene, StatDetailScene, TextScene, TitleScene } from '../model'

interface SceneRendererProps<T extends Scene> {
  scene: T
  accent: string
  layoutNamespace: string
}

function Kicker({ children }: { children?: string }) {
  return children ? <div className="scene-kicker">{children}</div> : null
}

function Rule({ accent }: { accent: string }) {
  return <div className="scene-rule" style={{ background: accent }} />
}

function TitleRenderer({ scene, accent }: SceneRendererProps<TitleScene>) {
  return (
    <div className="scene-layout title-layout">
      <Kicker>{scene.eyebrow}</Kicker>
      <div className="title-copy">
        <h1>{scene.headline}</h1>
        <Rule accent={accent} />
        {scene.subtitle && <p>{scene.subtitle}</p>}
      </div>
      <div className="editorial-index">STORY / 01</div>
    </div>
  )
}

function TextRenderer({ scene, accent }: SceneRendererProps<TextScene>) {
  return (
    <div className="scene-layout text-layout">
      <Kicker>{scene.eyebrow}</Kicker>
      <div className="text-copy">
        <h1>{scene.headline}</h1>
        <Rule accent={accent} />
        <p>{scene.body}</p>
      </div>
      {scene.callout && <div className="scene-callout">{scene.callout}</div>}
    </div>
  )
}

function BigStatRenderer({ scene, accent, layoutNamespace }: SceneRendererProps<BigStatScene>) {
  const stat = (
    <div className="stat-cluster">
      <div className="stat-value" style={{ color: accent }}>{scene.value}</div>
      <div className="stat-label">{scene.label}</div>
    </div>
  )
  return (
    <div className="scene-layout stat-layout">
      <Kicker>{scene.eyebrow}</Kicker>
      {scene.elementId ? (
        <motion.div layoutId={`${layoutNamespace}:${scene.elementId}`} className="shared-stat" transition={{ type: 'spring', stiffness: 150, damping: 22 }}>
          {stat}
        </motion.div>
      ) : stat}
      {scene.supportingText && <p className="stat-support">{scene.supportingText}</p>}
      <div className="bottom-lockup"><Rule accent={accent} /><span>REAL PLACES.<br />BRIGHTER TOMORROWS.</span></div>
    </div>
  )
}

function StatDetailRenderer({ scene, accent, layoutNamespace }: SceneRendererProps<StatDetailScene>) {
  const stat = (
    <div className="detail-stat-cluster">
      <div className="detail-stat-value" style={{ color: accent }}>{scene.value}</div>
      <div className="detail-stat-label">{scene.label}</div>
    </div>
  )
  return (
    <div className="scene-layout detail-layout">
      <Kicker>{scene.eyebrow}</Kicker>
      {scene.elementId ? (
        <motion.div layoutId={`${layoutNamespace}:${scene.elementId}`} className="shared-stat detail-shared" transition={{ type: 'spring', stiffness: 150, damping: 22 }}>
          {stat}
        </motion.div>
      ) : stat}
      <div className="detail-copy">
        <h1>{scene.headline}</h1>
        <Rule accent={accent} />
        <p>{scene.body}</p>
      </div>
    </div>
  )
}

function ComparisonRenderer({ scene, accent }: SceneRendererProps<ComparisonScene>) {
  return (
    <div className="scene-layout comparison-layout">
      <Kicker>{scene.eyebrow}</Kicker>
      <h1>{scene.headline}</h1>
      <div className="comparison-grid">
        {[scene.left, scene.right].map((item, index) => (
          <div className="comparison-item" key={item.label}>
            <span className="comparison-number" style={{ color: index === 1 ? accent : undefined }}>{item.value}</span>
            <span className="comparison-label">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="comparison-caption">ONE ROOM. ONE MOMENT. TOGETHER.</div>
    </div>
  )
}

function ChartRenderer({ scene, accent, layoutNamespace }: SceneRendererProps<ChartScene>) {
  return scene.chartType === 'bar'
    ? <BarChart scene={scene} accent={accent} layoutNamespace={layoutNamespace} />
    : <LineChart scene={scene} accent={accent} layoutNamespace={layoutNamespace} />
}

type RendererMap = {
  [K in Scene['type']]: ComponentType<SceneRendererProps<Extract<Scene, { type: K }>>>
}

export const sceneRendererRegistry: RendererMap = {
  title: TitleRenderer,
  text: TextRenderer,
  'big-stat': BigStatRenderer,
  comparison: ComparisonRenderer,
  'stat-detail': StatDetailRenderer,
  chart: ChartRenderer,
}

export function renderScene(scene: Scene, accent: string, layoutNamespace: string) {
  const Renderer = sceneRendererRegistry[scene.type] as ComponentType<SceneRendererProps<Scene>>
  return <Renderer scene={scene} accent={accent} layoutNamespace={layoutNamespace} />
}
