import type { Presentation } from './model'
import { seekVideoToTime } from './videoFrameReadiness'

export function findMissingPresentationAssets(presentation: Presentation) {
  const imageAssets = new Map((presentation.imageAssets ?? []).map((asset) => [asset.id, asset]))
  const videoAssets = new Map((presentation.videoAssets ?? []).map((asset) => [asset.id, asset]))
  const issues: string[] = []
  presentation.slides.forEach((slide, slideIndex) => {
    slide.elements.forEach((element) => {
      if (element.hidden) return
      if (element.type === 'image') {
        const asset = imageAssets.get(element.assetId)
        if (!asset) issues.push(`Slide ${slideIndex + 1} references unknown image asset: ${element.assetId}`)
        else if (!asset.source) issues.push(`Slide ${slideIndex + 1} references missing asset: ${asset.path ?? asset.name}`)
      } else if (element.type === 'video') {
        const asset = videoAssets.get(element.assetId)
        if (!asset) issues.push(`Slide ${slideIndex + 1} references unknown video asset: ${element.assetId}`)
        else if (!asset.source) issues.push(`Slide ${slideIndex + 1} references missing asset: ${asset.path ?? asset.name}`)
      }
    })
  })
  return issues
}

export async function decodePresentationAssets(presentation: Presentation) {
  const missing = findMissingPresentationAssets(presentation)
  if (missing.length > 0) throw new Error(missing.join('\n'))
  const requiredIds = new Set(presentation.slides.flatMap((slide) => slide.elements
    .filter((element) => element.type === 'image' && !element.hidden)
    .map((element) => element.type === 'image' ? element.assetId : '')))
  const sources = [...new Set((presentation.imageAssets ?? [])
    .filter((asset) => requiredIds.has(asset.id))
    .map((asset) => asset.source)
    .filter((source): source is string => Boolean(source)))]
  const requiredVideoIds = new Set(presentation.slides.flatMap((slide) => slide.elements
    .filter((element) => element.type === 'video' && !element.hidden)
    .map((element) => element.type === 'video' ? element.assetId : '')))
  const requiredVideos = (presentation.videoAssets ?? []).filter((asset) => requiredVideoIds.has(asset.id) && asset.source)
  await Promise.all([...sources.map((source) => new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Could not load required image asset: ${source}`))
    image.src = source
    if (typeof image.decode === 'function') void image.decode().then(resolve, () => undefined)
  })), ...requiredVideos.map(async (asset) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.dataset.videoName = asset.name
    video.src = asset.source!
    video.load()
    try {
      await seekVideoToTime(video, 0)
    } finally {
      video.removeAttribute('src')
      video.load()
    }
  })])
}
