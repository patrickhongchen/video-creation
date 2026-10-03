import type { PresentationVideoMimeType } from './model'

export function videoMimeType(file: File): PresentationVideoMimeType | null {
  if (file.type === 'video/mp4') return 'video/mp4'
  if (file.type === 'video/quicktime') return 'video/quicktime'
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extension === 'mp4' ? 'video/mp4' : extension === 'mov' ? 'video/quicktime' : null
}

export function readVideoFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The video could not be read.'))
    reader.onerror = () => reject(reader.error ?? new Error('The video could not be read.'))
    reader.readAsDataURL(file)
  })
}

export function readVideoRatio(source: string) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement('video')
    const cleanup = () => {
      clearTimeout(timeout)
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
    }
    const finish = (ratio: number) => { cleanup(); resolve(ratio) }
    const fail = () => { cleanup(); reject(new Error('The imported video could not be decoded.')) }
    const timeout = window.setTimeout(fail, 15_000)
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => finish(video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 16 / 9)
    video.onerror = fail
    video.src = source
  })
}
