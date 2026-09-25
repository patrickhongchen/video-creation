import type { Presentation } from './model'

export function findMissingPresentationAssets(presentation: Presentation) {
  const assets = new Map((presentation.imageAssets ?? []).map((asset) => [asset.id, asset]))
  const issues: string[] = []
  presentation.slides.forEach((slide, slideIndex) => {
    slide.elements.forEach((element) => {
      if (element.type !== 'image' || element.hidden) return
      const asset = assets.get(element.assetId)
      if (!asset) issues.push(`Slide ${slideIndex + 1} references unknown image asset: ${element.assetId}`)
      else if (!asset.source) issues.push(`Slide ${slideIndex + 1} references missing asset: ${asset.path ?? asset.name}`)
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
  await Promise.all(sources.map((source) => new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Could not load required image asset: ${source}`))
    image.src = source
    if (typeof image.decode === 'function') void image.decode().then(resolve, () => undefined)
  })))
}
