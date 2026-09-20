export interface RecordingFormat {
  mimeType?: string
  extension: 'mp4' | 'webm'
}

const VIDEO_MIME_PREFERENCES: ReadonlyArray<Required<RecordingFormat>> = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
]

export function chooseRecordingFormat(): RecordingFormat {
  if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
    const supported = VIDEO_MIME_PREFERENCES.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType))
    if (supported) return supported
  }
  return { extension: 'webm' }
}

export function extensionForRecordedMime(mimeType: string, fallback: RecordingFormat['extension']) {
  if (mimeType.toLowerCase().includes('mp4')) return 'mp4' as const
  if (mimeType.toLowerCase().includes('webm')) return 'webm' as const
  return fallback
}
