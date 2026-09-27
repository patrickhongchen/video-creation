import type { DesktopExportJob } from './desktopTypes'
import type { NarrationPointerSample } from '../narration/resolveNarrationPointer'
import type { SceneCue } from '../narration/narrationTypes'
import type { FinalPlaybackPlan } from '../finalPlayback/finalPlaybackTypes'

export function getDesktopBridge() {
  return window.videoEssayDesktop ?? null
}

export function desktopExportIsAvailable() {
  return getDesktopBridge() !== null
}

export function desktopProjectsAreAvailable() {
  return getDesktopBridge() !== null
}

export type DesktopExportSourceSegment = DesktopExportJob['segments'][number]
  | {
        type: 'narration'
        sectionId: string
        title: string
        sceneIds: string[]
        durationMs: number
        cues: SceneCue[]
        pointerTrack?: NarrationPointerSample[]
        takeId: string
        mimeType: string
        blob: Blob
      }

export function desktopSegmentsFromFinalPlan(plan: FinalPlaybackPlan): DesktopExportSourceSegment[] {
  return plan.segments.map((segment) => segment.type === 'silent-scene'
    ? { ...segment }
    : {
        type: 'narration' as const,
        sectionId: segment.sectionId,
        title: segment.title,
        sceneIds: [...segment.sceneIds],
        durationMs: segment.durationMs,
        cues: segment.take.cues.map((cue) => ({ ...cue })),
        pointerTrack: segment.take.pointerTrack?.map((sample) => ({ ...sample })),
        takeId: segment.take.id,
        mimeType: segment.take.mimeType,
        blob: segment.take.blob,
      })
}

export async function buildDesktopExportJob(job: Omit<DesktopExportJob, 'segments'> & {
  segments: DesktopExportSourceSegment[]
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
      pointerTrack: segment.pointerTrack,
      audio: {
        takeId: segment.takeId,
        mimeType: segment.mimeType,
        bytes: await segment.blob.arrayBuffer(),
      },
    }
  }))
  return { ...job, segments }
}
