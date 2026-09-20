import type { Scene } from '../model'
import type { DesktopExportJob, DesktopExportSegment } from '../desktop/desktopTypes'

function firstSceneId(segment: DesktopExportSegment | undefined) {
  if (!segment) return undefined
  return segment.type === 'silent-scene'
    ? segment.sceneId
    : [...segment.cues].sort((left, right) => left.timeMs - right.timeMs)[0]?.sceneId ?? segment.sceneIds[0]
}

export interface ResolvedPlaybackVisual {
  scene: Scene
  sceneIndex: number
  segmentIndex: number
  segment: DesktopExportSegment | undefined
}

export function resolvePlaybackVisual(job: Pick<DesktopExportJob, 'presentation' | 'segments'>, elapsedMs: number): ResolvedPlaybackVisual {
  const { presentation, segments } = job
  let segmentStartMs = 0
  let segmentIndex = 0
  let activeSegment: DesktopExportSegment | undefined
  let sceneId: string | undefined

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const segmentEndMs = segmentStartMs + segment.durationMs
    if (elapsedMs < segmentEndMs || index === segments.length - 1) {
      segmentIndex = index
      activeSegment = segment
      if (segment.type === 'silent-scene') {
        sceneId = segment.sceneId
      } else {
        const localTimeMs = Math.max(0, elapsedMs - segmentStartMs)
        const cues = [...segment.cues].sort((left, right) => left.timeMs - right.timeMs)
        sceneId = firstSceneId(segment)
        for (const cue of cues) {
          if (cue.timeMs > localTimeMs) break
          sceneId = cue.sceneId
        }
      }
      break
    }
    segmentStartMs = segmentEndMs
  }

  sceneId ??= firstSceneId(segments[0]) ?? presentation.scenes[0]?.id
  const sceneIndex = Math.max(0, presentation.scenes.findIndex((scene) => scene.id === sceneId))
  return {
    scene: presentation.scenes[sceneIndex] ?? presentation.scenes[0],
    sceneIndex,
    segmentIndex,
    segment: activeSegment,
  }
}
