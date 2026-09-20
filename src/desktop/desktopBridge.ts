import type { DesktopExportJob } from './desktopTypes'

export function getDesktopBridge() {
  return window.videoEssayDesktop ?? null
}

export function desktopExportIsAvailable() {
  return getDesktopBridge() !== null
}

export async function buildDesktopExportJob(job: Omit<DesktopExportJob, 'segments'> & {
  segments: Array<
    | DesktopExportJob['segments'][number]
    | {
        type: 'narration'
        sectionId: string
        title: string
        sceneIds: string[]
        durationMs: number
        cues: DesktopExportJob['segments'][number] extends infer _Segment ? import('../narration/narrationTypes').SceneCue[] : never
        takeId: string
        mimeType: string
        blob: Blob
      }
  >
}): Promise<DesktopExportJob> {
  const segments = await Promise.all(job.segments.map(async (segment) => {
    if (segment.type === 'silent-scene' || 'audio' in segment) return segment
    return {
      type: 'narration' as const,
      sectionId: segment.sectionId,
      title: segment.title,
      sceneIds: segment.sceneIds,
      durationMs: segment.durationMs,
      cues: segment.cues,
      audio: {
        takeId: segment.takeId,
        mimeType: segment.mimeType,
        bytes: await segment.blob.arrayBuffer(),
      },
    }
  }))
  return { ...job, segments }
}

