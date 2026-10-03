import { useRef, useState, type ChangeEvent } from 'react'
import type { SlideElement } from '../model'
import { imageMimeType, readImageFile, readImageRatioWithFallback } from '../imageUtils'
import { readVideoFile, readVideoRatio, videoMimeType } from '../videoUtils'
import {
  createSlideArrowElement,
  createSlideChartElement,
  createSlideImageElement,
  createSlideVideoElement,
  createSlideShapeElement,
  createSlideTextElement,
  createStableId,
} from '../presentationFactories'
import type { CompositionEditorProps } from './CompositionInspector'

type CanvasToolbarProps = Pick<CompositionEditorProps, 'slide' | 'presentation' | 'grid' | 'guides' | 'snap' | 'onGridChange' | 'onGuidesChange' | 'onSnapChange' | 'onSelect' | 'onSlideChange' | 'onPresentationChange' | 'onImportImage' | 'onImportVideo' | 'videoImporting' | 'onImportError'>

export function CanvasToolbar({
  slide,
  presentation,
  grid,
  guides,
  snap,
  onGridChange,
  onGuidesChange,
  onSnapChange,
  onSelect,
  onSlideChange,
  onPresentationChange,
  onImportImage,
  onImportVideo,
  onImportError,
  videoImporting = false,
}: CanvasToolbarProps) {
  const imageInput = useRef<HTMLInputElement>(null)
  const [browserVideoImporting, setBrowserVideoImporting] = useState(false)
  const [videoError, setVideoError] = useState('')
  const videoInput = useRef<HTMLInputElement>(null)
  const shapeMenu = useRef<HTMLDetailsElement>(null)
  const addElement = (element: SlideElement) => {
    onSlideChange({ ...slide, elements: [...slide.elements, element] })
    onSelect(element.id)
  }
  const addShape = (element: SlideElement) => {
    addElement(element)
    if (shapeMenu.current) shapeMenu.current.open = false
  }
  const pickImage = () => {
    if (onImportImage) {
      onImportImage('add')
      return
    }
    imageInput.current?.click()
  }
  const acceptImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const mimeType = imageMimeType(file)
    if (!mimeType) return
    const source = (await readImageFile(file)).replace(/^data:[^;,]*/i, `data:${mimeType}`)
    const asset = { id: createStableId(file.name.replace(/\.[^.]+$/, '') || 'image'), name: file.name, mimeType, source }
    onPresentationChange({ ...presentation, imageAssets: [...(presentation.imageAssets ?? []), asset] })
    const ratio = await readImageRatioWithFallback(source)
    const element = createSlideImageElement(asset.id)
    const width = Math.round(ratio >= 1 ? 700 : 700 * ratio)
    const height = Math.round(ratio >= 1 ? 700 / ratio : 700)
    addElement({ ...element, frame: { ...element.frame, x: (1080 - width) / 2, y: (1920 - height) / 2, width, height } })
  }
  const pickVideo = () => onImportVideo ? onImportVideo() : videoInput.current?.click()
  const acceptVideo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBrowserVideoImporting(true)
    setVideoError('')
    onImportError?.('')
    try {
      const mimeType = videoMimeType(file)
      if (!mimeType) throw new Error('Choose an MP4 or MOV video file.')
      const source = (await readVideoFile(file)).replace(/^data:[^;,]*/i, `data:${mimeType}`)
      const ratio = await readVideoRatio(source)
      const asset = { id: createStableId(file.name.replace(/\.[^.]+$/, '') || 'video'), name: file.name, mimeType, source }
      onPresentationChange({ ...presentation, videoAssets: [...(presentation.videoAssets ?? []), asset] })
      const element = createSlideVideoElement(asset.id)
      const width = Math.round(ratio >= 1 ? 900 : 900 * ratio)
      const height = Math.round(ratio >= 1 ? 900 / ratio : 900)
      addElement({ ...element, frame: { ...element.frame, x: (1080 - width) / 2, y: (1920 - height) / 2, width, height } })
    } catch (problem) {
      const message = problem instanceof Error ? `Video import failed: ${problem.message}` : 'Video import failed.'
      if (onImportError) onImportError(message)
      else setVideoError(message)
    } finally {
      setBrowserVideoImporting(false)
    }
  }

  return <div className="canvas-toolbar" aria-label="Canvas tools">
    <div className="composition-toolbar-actions canvas-toolbar-group">
      <button type="button" onClick={() => addElement(createSlideTextElement())}>+ Text</button>
      <button type="button" onClick={pickImage}>+ Image</button>
      <button type="button" disabled={videoImporting || browserVideoImporting} onClick={pickVideo}>{videoImporting || browserVideoImporting ? 'Importing Video…' : '+ Video'}</button>
      <button type="button" onClick={() => addElement(createSlideChartElement())}>+ Chart</button>
      <details ref={shapeMenu} name="canvas-tools" className="composition-toolbar-menu canvas-toolbar-menu">
        <summary>+ Shape</summary>
        <div className="composition-toolbar-menu-content canvas-toolbar-menu-content">
          <button type="button" aria-label="Add rectangle" onClick={() => addShape({ ...createSlideShapeElement('rectangle'), fill: presentation.theme.accent })}>Rectangle</button>
          <button type="button" aria-label="Add circle" onClick={() => addShape({ ...createSlideShapeElement('circle'), fill: presentation.theme.accent })}>Circle</button>
          <button type="button" aria-label="Add line" onClick={() => addShape({ ...createSlideShapeElement('line'), stroke: presentation.theme.accent })}>Line</button>
          <button type="button" aria-label="Add arrow" onClick={() => addShape({ ...createSlideArrowElement(), stroke: presentation.theme.accent })}>Arrow</button>
        </div>
      </details>
      <details name="canvas-tools" className="composition-toolbar-menu canvas-toolbar-menu">
        <summary>View</summary>
        <div className="composition-toolbar-menu-content canvas-toolbar-menu-content">
          <label><input aria-label="Snap" type="checkbox" checked={snap} onChange={(event) => onSnapChange(event.target.checked)} /> Snap</label>
          <label><input aria-label="Guides" type="checkbox" checked={guides} onChange={(event) => onGuidesChange(event.target.checked)} /> Guides</label>
          <label><input aria-label="Grid" type="checkbox" checked={grid} onChange={(event) => onGridChange(event.target.checked)} /> Grid</label>
        </div>
      </details>
      <details name="canvas-tools" className="composition-toolbar-menu composition-style-menu canvas-toolbar-menu">
        <summary>Style</summary>
        <div className="canvas-toolbar-menu-content"><label><span>Accent</span><input aria-label="Presentation accent" type="color" value={presentation.theme.accent} onChange={(event) => onPresentationChange({ ...presentation, theme: { ...presentation.theme, accent: event.target.value } })} /></label></div>
      </details>
    </div>
    {videoError && <span role="alert">{videoError}</span>}
    {!onImportImage && <input ref={imageInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" onChange={(event) => void acceptImage(event)} />}
    {!onImportVideo && <input ref={videoInput} className="visually-hidden" type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={(event) => void acceptVideo(event)} />}
  </div>
}
