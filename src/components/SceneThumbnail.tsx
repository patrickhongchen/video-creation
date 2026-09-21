import type { CSSProperties } from 'react'
import type { Scene } from '../model'

export function SceneThumbnail({ scene, accent }: { scene: Scene; accent: string }) {
  if (scene.type === 'big-stat' || scene.type === 'stat-detail') {
    return <div className="thumb thumb-stat"><b style={{ color: accent }}>{scene.value}</b><span>{scene.label}</span><i style={{ background: accent }} /></div>
  }
  if (scene.type === 'comparison') {
    return <div className="thumb thumb-comparison"><b>{scene.left.value}</b><i /><b style={{ color: accent }}>{scene.right.value}</b></div>
  }
  if (scene.type === 'chart') {
    const highlighted = new Set(scene.highlightIds)
    const maxMagnitude = Math.max(1, ...scene.data.map((datum) => Math.abs(datum.value)))
    if (scene.chartType === 'line') {
      const values = scene.data.map((datum) => datum.value)
      const min = Math.min(...values)
      const max = Math.max(...values)
      const span = max - min || 1
      const points = scene.data.map((datum, index) => {
        const x = scene.data.length === 1 ? 26 : 3 + (index / (scene.data.length - 1)) * 46
        const y = 39 - ((datum.value - min) / span) * 29
        return `${x},${y}`
      }).join(' ')
      return <div className="thumb thumb-chart"><svg viewBox="0 0 52 48" aria-hidden="true"><path d="M3 40H49" className="thumb-chart-axis" /><polyline points={points} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{scene.data.map((datum, index) => {
        const [x, y] = points.split(' ')[index].split(',')
        return <circle key={datum.id} cx={x} cy={y} r={highlighted.size === 0 || highlighted.has(datum.id) ? 2.8 : 1.8} fill={highlighted.size === 0 || highlighted.has(datum.id) ? accent : '#aeb8c3'} />
      })}</svg></div>
    }
    return <div className={`thumb thumb-chart thumb-chart-bars ${scene.orientation === 'vertical' ? 'vertical' : ''}`} aria-hidden="true">
      {scene.data.slice(0, 5).map((datum) => <i key={datum.id} style={{ '--bar-size': `${Math.max(8, Math.abs(datum.value) / maxMagnitude * 100)}%`, '--bar-color': highlighted.size === 0 || highlighted.has(datum.id) ? accent : '#b9c2ca' } as CSSProperties} />)}
    </div>
  }
  if (scene.type === 'composition') {
    return <div className="thumb thumb-composition" aria-hidden="true">
      {scene.elements.filter((element) => !element.hidden).slice(-5).map((element, index) => {
        const left = Math.max(0, Math.min(88, element.frame.x / 1080 * 100))
        const top = Math.max(0, Math.min(92, element.frame.y / 1920 * 100))
        const width = Math.max(7, Math.min(100 - left, element.frame.width / 1080 * 100))
        const height = Math.max(4, Math.min(100 - top, element.frame.height / 1920 * 100))
        return <i key={element.id} className={`thumb-composition-element thumb-composition-element--${element.type}`} style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, borderColor: index === scene.elements.length - 1 ? accent : undefined, background: element.type === 'shape' ? ('fill' in element ? element.fill : undefined) : undefined }} />
      })}
    </div>
  }
  return <div className="thumb thumb-copy"><b>{scene.headline}</b><i style={{ background: accent }} /></div>
}
