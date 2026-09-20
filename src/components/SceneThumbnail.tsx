import type { Scene } from '../model'

export function SceneThumbnail({ scene, accent }: { scene: Scene; accent: string }) {
  if (scene.type === 'big-stat' || scene.type === 'stat-detail') {
    return <div className="thumb thumb-stat"><b style={{ color: accent }}>{scene.value}</b><span>{scene.label}</span><i style={{ background: accent }} /></div>
  }
  if (scene.type === 'comparison') {
    return <div className="thumb thumb-comparison"><b>{scene.left.value}</b><i /><b style={{ color: accent }}>{scene.right.value}</b></div>
  }
  return <div className="thumb thumb-copy"><b>{scene.headline}</b><i style={{ background: accent }} /></div>
}
