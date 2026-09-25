import { SLIDE_HEIGHT, SLIDE_WIDTH, type Presentation, type SlideChartElement, type SlideElement } from './model'

export interface PresentationDiagnostic {
  code: string
  message: string
  path?: string
  slideId?: string
  elementId?: string
}

function diagnostic(code: string, message: string, slideId: string, elementId?: string): PresentationDiagnostic {
  return { code, message, slideId, ...(elementId ? { elementId } : {}) }
}

function chartSignature(chart: SlideChartElement) {
  return `${chart.chartType}:${chart.chartType === 'bar' ? chart.orientation ?? 'horizontal' : ''}`
}

function sameChartData(a: SlideChartElement, b: SlideChartElement) {
  return chartSignature(a) === chartSignature(b)
    && a.data.length === b.data.length
    && a.data.every((datum, index) => datum.id === b.data[index].id && datum.label === b.data[index].label)
}

function overlapRatio(a: SlideElement, b: SlideElement) {
  const areaA = a.frame.width * a.frame.height
  const areaB = b.frame.width * b.frame.height
  // Full-bleed images with text laid over them are normal composition.
  if ((a.type === 'image' || b.type === 'image') && Math.max(areaA, areaB) / Math.min(areaA, areaB) > 3) return 0
  const left = Math.max(a.frame.x, b.frame.x)
  const top = Math.max(a.frame.y, b.frame.y)
  const width = Math.min(a.frame.x + a.frame.width, b.frame.x + b.frame.width) - left
  const height = Math.min(a.frame.y + a.frame.height, b.frame.y + b.frame.height) - top
  if (width <= 0 || height <= 0) return 0
  return width * height / Math.min(areaA, areaB)
}

/** Conservative visual checks. Schema and required asset failures belong to Project validation. */
export function lintPresentation(presentation: Presentation): PresentationDiagnostic[] {
  const warnings: PresentationDiagnostic[] = []
  presentation.slides.forEach((slide, slideIndex) => {
    const visible = slide.elements.filter((element) => !element.hidden && element.frame.opacity !== 0)
    for (const element of visible) {
      const { x, y, width, height } = element.frame
      if (x + width <= 0 || y + height <= 0 || x >= SLIDE_WIDTH || y >= SLIDE_HEIGHT) {
        warnings.push(diagnostic('element-off-slide', `Element is completely outside the ${SLIDE_WIDTH}×${SLIDE_HEIGHT} slide.`, slide.id, element.id))
      }
      if (element.type === 'text') {
        const role = element.role ?? 'body'
        const defaultStyle = role === 'headline' ? presentation.theme.defaultHeadlineStyle
          : role === 'caption' ? presentation.theme.defaultCaptionStyle
            : role === 'label' ? presentation.theme.defaultLabelStyle ?? presentation.theme.defaultCaptionStyle
              : presentation.theme.defaultBodyStyle
        const fontSize = element.fontSize ?? defaultStyle.fontSize
        if (fontSize < 22) {
          warnings.push(diagnostic('text-small', `fontSize ${fontSize} may be too small for a presentation.`, slide.id, element.id))
        }
        const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.52)))
        const linesAvailable = Math.max(1, Math.floor(height / (fontSize * (element.lineHeight ?? defaultStyle.lineHeight ?? 1.2))))
        const estimatedLines = element.text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
        if (element.text.length >= 120 && estimatedLines > linesAvailable * 1.5) {
          warnings.push(diagnostic('text-dense', `Text has ${element.text.length} characters in a ${Math.round(width)}×${Math.round(height)} frame and may be difficult to read.`, slide.id, element.id))
        }
      }
      if (element.type === 'chart' && (width < 420 || height < 320)) {
        warnings.push(diagnostic('chart-frame-small', `Chart frame is ${Math.round(width)}×${Math.round(height)}; labels or values may be difficult to read.`, slide.id, element.id))
      }
    }

    // Large intersections among several content elements usually hide information.
    // Ignore decoration and isolated overlaps: these are often deliberate.
    const content = visible.filter((element) => element.type === 'text' || element.type === 'image' || element.type === 'chart')
    const heavilyOverlapping = new Set<string>()
    for (let a = 0; a < content.length; a += 1) {
      for (let b = a + 1; b < content.length; b += 1) {
        if (overlapRatio(content[a], content[b]) >= 0.7) {
          heavilyOverlapping.add(content[a].id)
          heavilyOverlapping.add(content[b].id)
        }
      }
    }
    if (heavilyOverlapping.size >= 4) {
      warnings.push(diagnostic('heavy-overlap', `${heavilyOverlapping.size} content elements overlap substantially; check their layer order and readability.`, slide.id))
    }
    if (visible.length >= 13) {
      warnings.push(diagnostic('many-elements', `${visible.length} visible elements may compete for attention.`, slide.id))
    }

    const next = presentation.slides[slideIndex + 1]
    if (!next) return
    const charts = visible.filter((element): element is SlideChartElement => element.type === 'chart')
    const nextCharts = next.elements.filter((element): element is SlideChartElement => element.type === 'chart' && !element.hidden)
    if (charts.length === 1 && nextCharts.length === 1) {
      const [current] = charts
      const [following] = nextCharts
      if (current.chartId && following.chartId && current.chartId !== following.chartId && sameChartData(current, following)) {
        warnings.push(diagnostic('chart-identity-reset', `The next slide has the same chart type and datum IDs but chartId changes from "${current.chartId}" to "${following.chartId}". Preserve chartId if this is one continuing chart.`, next.id, following.id))
      }
    }
  })
  return warnings
}
