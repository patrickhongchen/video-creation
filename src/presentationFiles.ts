import type { Presentation } from './model'
import { slugify } from './presentationFactories'
import { parsePresentationJson } from './presentationValidation'

export function serializePresentation(presentation: Presentation) {
  return `${JSON.stringify(presentation, null, 2)}\n`
}

export function downloadPresentation(presentation: Presentation) {
  const blob = new Blob([serializePresentation(presentation)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${slugify(presentation.title || presentation.id)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export async function readPresentationFile(file: File) {
  return parsePresentationJson(await file.text())
}
