import { useCallback, useEffect, useRef, type DragEvent as ReactDragEvent } from 'react'
import type { Presentation, Slide, SlideElement } from '../model'
import { createSlideImageElement } from '../presentationFactories'
import { duplicateSelection } from './selectionLayout'
import { getDesktopBridge } from '../desktop/desktopBridge'
import type { DesktopImportedAsset, DesktopProjectSnapshot } from '../desktop/desktopTypes'
import { imageMimeType, isSupportedImageMimeType, readImageRatio } from '../imageUtils'

interface ClipboardImagesOptions {
  currentProject: DesktopProjectSnapshot | null
  selectedSlide: Slide
  selectedIndex: number
  selectedElementId: string | null
  selectedElementIds: string[]
  mode: 'edit' | 'present' | 'narrate'
  isPreviewing: boolean
  updateCurrent: (update: (presentation: Presentation) => Presentation) => void
  updateSlide: (slide: Slide) => void
  setSelectedElementId: (id: string | null) => void
  setSelection: (ids: string[]) => void
  setError: (error: string) => void
}

function imageFromClipboardHtml(html: string) {
  if (!html.trim()) return null
  const image = new DOMParser().parseFromString(html, 'text/html').querySelector('img')
  if (!image) return null
  const candidates = ['src', 'data-src', 'data-iurl'].map((attribute) => image.getAttribute(attribute)?.trim())
  const source = candidates.find((candidate) => candidate?.startsWith('https://'))
    ?? candidates.find((candidate) => candidate?.startsWith('data:image/'))
  if (!source) return null
  return { source, name: image.getAttribute('alt')?.trim().slice(0, 80) || 'copied-image' }
}

/** All image entry points share the same asset placement path. */
export function useEditorClipboardImages({ currentProject, selectedSlide, selectedIndex, selectedElementId, selectedElementIds, mode, isPreviewing, updateCurrent, updateSlide, setSelectedElementId, setSelection, setError }: ClipboardImagesOptions) {
  const desktop = getDesktopBridge()
  const copiedElements = useRef<SlideElement[]>([])
  const internalCopyIsCurrent = useRef(false)
  const copySelection = () => {
    copiedElements.current = structuredClone(selectedSlide.elements.filter(({ id }) => selectedElementIds.includes(id)))
    internalCopyIsCurrent.current = copiedElements.current.length > 0
  }
  useEffect(() => {
    const onBlur = () => { internalCopyIsCurrent.current = false }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])
  const placeImportedAsset = useCallback(async (
    asset: DesktopImportedAsset,
    action: 'add' | 'replace' = 'add',
    center?: { x: number; y: number },
  ) => {
    const ratio = await readImageRatio(asset.source)
    const width = Math.round(ratio >= 1 ? 700 : 700 * ratio)
    const height = Math.round(ratio >= 1 ? 700 / ratio : 700)
    const image = createSlideImageElement(asset.id)
    const frame = {
      ...image.frame,
      x: Math.round((center?.x ?? 540) - width / 2),
      y: Math.round((center?.y ?? 960) - height / 2),
      width,
      height,
    }
    const selected = selectedSlide.elements.find((element) => element.id === selectedElementId)
    const nextElementId = action === 'replace' && selected?.type === 'image' ? selected.id : image.id
    updateCurrent((current) => {
      const slide = current.slides[selectedIndex] ?? current.slides[0]
      let elements: SlideElement[]
      if (action === 'replace' && selected?.type === 'image') {
        elements = slide.elements.map((element) => element.id === selected.id ? { ...selected, assetId: asset.id } : element)
      } else {
        elements = [...slide.elements, { ...image, frame }]
      }
      return {
        ...current,
        imageAssets: [...(current.imageAssets ?? []).filter((candidate) => candidate.id !== asset.id), asset],
        slides: current.slides.map((candidate, index) => index === selectedIndex ? { ...slide, elements } : candidate),
      }
    })
    setSelectedElementId(nextElementId)
  }, [selectedElementId, selectedIndex, selectedSlide.elements, updateCurrent])

  const chooseProjectImage = useCallback(async (action: 'add' | 'replace') => {
    if (!desktop || !currentProject) return
    try {
      const result = await desktop.chooseImage(currentProject.projectId)
      if (result.status === 'imported') await placeImportedAsset(result.asset, action)
    } catch (problem) {
      setError(problem instanceof Error ? `Image import failed: ${problem.message}` : 'Image import failed.')
    }
  }, [currentProject, desktop, placeImportedAsset])

  const importImageBytes = useCallback(async (file: File, suggestedName: string, center?: { x: number; y: number }) => {
    if (!desktop || !currentProject) return
    const mimeType = imageMimeType(file)
    if (!mimeType) throw new Error('Supported image types are PNG, JPEG, WebP, and SVG.')
    const asset = await desktop.saveImageBytes({
      projectId: currentProject.projectId,
      bytes: await file.arrayBuffer(),
      mimeType,
      suggestedName,
    })
    await placeImportedAsset(asset, 'add', center)
  }, [currentProject, desktop, placeImportedAsset])

  const importClipboardImageSource = useCallback(async (source: string, suggestedName: string) => {
    if (!desktop || !currentProject) return
    if (source.startsWith('data:image/')) {
      const response = await fetch(source)
      const blob = await response.blob()
      const mimeType = blob.type === 'image/jpg' ? 'image/jpeg' : blob.type
      if (!isSupportedImageMimeType(mimeType)) throw new Error('The copied image format is not supported.')
      await importImageBytes(new File([blob], suggestedName, { type: mimeType }), 'pasted-image')
      return
    }
    const asset = await desktop.importRemoteImage({ projectId: currentProject.projectId, url: source, suggestedName })
    await placeImportedAsset(asset)
  }, [currentProject, desktop, importImageBytes, placeImportedAsset])

  useEffect(() => {
    if (mode !== 'edit' || isPreviewing) return
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return
      const clipboardFiles = Array.from(event.clipboardData?.files ?? [])
      if (clipboardFiles.length === 0) {
        Array.from(event.clipboardData?.items ?? []).forEach((item) => {
          const file = item.kind === 'file' ? item.getAsFile() : null
          if (file) clipboardFiles.push(file)
        })
      }
      const imageFile = clipboardFiles.find((file) => imageMimeType(file))
      if (imageFile && currentProject) {
        event.preventDefault()
        internalCopyIsCurrent.current = false
        void importImageBytes(imageFile, 'pasted-image.png').catch((problem) => {
          setError(problem instanceof Error ? `Paste failed: ${problem.message}` : 'Paste failed.')
        })
        return
      }
      const htmlImage = imageFromClipboardHtml(event.clipboardData?.getData('text/html') ?? '')
      const pasteCopiedElement = () => {
        if (!copiedElements.current.length) return false
        const copies = duplicateSelection(copiedElements.current, copiedElements.current.map(({ id }) => id))
        updateSlide({ ...selectedSlide, elements: [...selectedSlide.elements, ...copies.elements.slice(copiedElements.current.length)] })
        setSelection(copies.selectedIds)
        return true
      }
      if (htmlImage && currentProject && desktop) {
        event.preventDefault()
        void (async () => {
          const nativeImage = await desktop.importClipboardImage(currentProject.projectId)
          internalCopyIsCurrent.current = false
          if (nativeImage.status === 'imported') await placeImportedAsset(nativeImage.asset)
          else await importClipboardImageSource(htmlImage.source, htmlImage.name)
        })().catch((problem) => {
          setError(problem instanceof Error ? `Paste failed: ${problem.message}` : 'Paste failed.')
        })
        return
      }
      if (internalCopyIsCurrent.current && copiedElements.current.length) {
        event.preventDefault()
        pasteCopiedElement()
        return
      }
      if (currentProject && desktop) {
        event.preventDefault()
        void (async () => {
          const nativeImage = await desktop.importClipboardImage(currentProject.projectId)
          if (nativeImage.status === 'imported') {
            internalCopyIsCurrent.current = false
            await placeImportedAsset(nativeImage.asset)
            return
          }
          if (htmlImage) {
            internalCopyIsCurrent.current = false
            await importClipboardImageSource(htmlImage.source, htmlImage.name)
            return
          }
          pasteCopiedElement()
        })().catch((problem) => {
          setError(problem instanceof Error ? `Paste failed: ${problem.message}` : 'Paste failed.')
        })
        return
      }
      if (copiedElements.current.length) {
        event.preventDefault()
        pasteCopiedElement()
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [currentProject, desktop, importClipboardImageSource, importImageBytes, isPreviewing, mode, placeImportedAsset, selectedSlide, updateSlide, setSelection])

  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', preventFileNavigation)
    window.addEventListener('drop', preventFileNavigation)
    return () => {
      window.removeEventListener('dragover', preventFileNavigation)
      window.removeEventListener('drop', preventFileNavigation)
    }
  }, [])

  const dropProjectImage = async (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault()
    if (isPreviewing) return
    const file = [...event.dataTransfer.files].find((candidate) => imageMimeType(candidate))
    if (!file || !currentProject || !desktop) {
      if (event.dataTransfer.files.length) setError('Only PNG, JPEG, WebP, and SVG images can be dropped on a slide.')
      return
    }
    const stage = event.currentTarget.querySelector<HTMLElement>('.stage')
    const bounds = stage?.getBoundingClientRect()
    const center = bounds ? {
      x: Math.max(0, Math.min(1080, ((event.clientX - bounds.left) / bounds.width) * 1080)),
      y: Math.max(0, Math.min(1920, ((event.clientY - bounds.top) / bounds.height) * 1920)),
    } : undefined
    try {
      const asset = await desktop.importDroppedImage(currentProject.projectId, file)
      await placeImportedAsset(asset, 'add', center)
    } catch (problem) {
      setError(problem instanceof Error ? `Drop failed: ${problem.message}` : 'Drop failed.')
    }
  }

  return { chooseProjectImage, dropProjectImage, copySelection }
}
