import {
  DEFAULT_EDITORIAL_THEME,
  type ChartScene,
  type LegacyPresentation,
  type LegacyScene,
  type Presentation,
  type Slide,
  type SlideChartElement,
  type SlideElement,
  type SlideTextElement,
  type TextRole,
} from './model'

type TextOptions = {
  role: TextRole
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontWeight?: number
  color?: string
  textAlign?: SlideTextElement['textAlign']
  sharedElementId?: string
}

function textElement(sceneId: string, key: string, name: string, text: string, options: TextOptions): SlideTextElement {
  return {
    id: `${sceneId}-${key}`,
    type: 'text',
    name,
    frame: { x: options.x, y: options.y, width: options.width, height: options.height, rotation: 0, opacity: 1 },
    text,
    role: options.role,
    fontSize: options.fontSize,
    fontWeight: options.fontWeight,
    color: options.color,
    textAlign: options.textAlign,
    lineHeight: options.role === 'headline' ? 1.05 : 1.25,
    ...(options.sharedElementId ? { sharedElementId: options.sharedElementId } : {}),
  }
}

function eyebrow(scene: LegacyScene): SlideTextElement[] {
  return scene.eyebrow
    ? [textElement(scene.id, 'eyebrow', 'Eyebrow', scene.eyebrow, {
      role: 'label', x: 96, y: 100, width: 888, height: 76, fontSize: 26, fontWeight: 700,
    })]
    : []
}

function chartElement(scene: ChartScene): SlideChartElement {
  return {
    id: `${scene.id}-chart`,
    type: 'chart',
    name: 'Chart',
    frame: { x: 96, y: 570, width: 888, height: 850, rotation: 0, opacity: 1 },
    chartType: scene.chartType,
    orientation: scene.orientation,
    data: scene.data.map((datum) => ({ ...datum })),
    highlightIds: [...scene.highlightIds],
    valuePrefix: scene.valuePrefix,
    valueSuffix: scene.valueSuffix,
    decimalPlaces: scene.decimalPlaces,
    showValues: scene.showValues,
    chartId: scene.chartId,
    domain: scene.domain ? { ...scene.domain } : undefined,
  }
}

function migrateElements(scene: LegacyScene, accent: string): SlideElement[] {
  switch (scene.type) {
    case 'composition': {
      const elements = structuredClone(scene.elements)
      const migratedEyebrow = eyebrow(scene)[0]
      if (!migratedEyebrow) return elements
      const usedIds = new Set(elements.map((element) => element.id))
      let candidateId = migratedEyebrow.id
      let suffix = 2
      while (usedIds.has(candidateId)) candidateId = `${migratedEyebrow.id}-${suffix++}`
      return [{ ...migratedEyebrow, id: candidateId }, ...elements]
    }
    case 'title':
      return [
        ...eyebrow(scene),
        textElement(scene.id, 'headline', 'Headline', scene.headline, {
          role: 'headline', x: 96, y: 500, width: 888, height: 440, fontSize: 108, fontWeight: 800,
        }),
        ...(scene.subtitle ? [textElement(scene.id, 'subtitle', 'Subtitle', scene.subtitle, {
          role: 'body', x: 96, y: 1030, width: 800, height: 220, fontSize: 42,
        })] : []),
      ]
    case 'text':
      return [
        ...eyebrow(scene),
        textElement(scene.id, 'headline', 'Headline', scene.headline, {
          role: 'headline', x: 96, y: 310, width: 888, height: 400, fontSize: 92, fontWeight: 800,
        }),
        textElement(scene.id, 'body', 'Body', scene.body, {
          role: 'body', x: 96, y: 810, width: 820, height: 440, fontSize: 40,
        }),
        ...(scene.callout ? [textElement(scene.id, 'callout', 'Callout', scene.callout, {
          role: 'caption', x: 96, y: 1460, width: 888, height: 180, fontSize: 30, fontWeight: 700,
        })] : []),
      ]
    case 'big-stat':
      return [
        ...eyebrow(scene),
        textElement(scene.id, 'value', 'Value', scene.value, {
          role: 'headline', x: 96, y: 500, width: 888, height: 300, fontSize: 190, fontWeight: 800,
          color: accent, sharedElementId: scene.elementId,
        }),
        textElement(scene.id, 'label', 'Label', scene.label, {
          role: 'label', x: 96, y: 810, width: 820, height: 180, fontSize: 42, fontWeight: 700,
        }),
        ...(scene.supportingText ? [textElement(scene.id, 'supporting', 'Supporting text', scene.supportingText, {
          role: 'body', x: 96, y: 1160, width: 820, height: 300, fontSize: 34,
        })] : []),
      ]
    case 'stat-detail':
      return [
        ...eyebrow(scene),
        textElement(scene.id, 'value', 'Value', scene.value, {
          role: 'headline', x: 96, y: 290, width: 500, height: 220, fontSize: 126, fontWeight: 800,
          color: accent, sharedElementId: scene.elementId,
        }),
        textElement(scene.id, 'label', 'Label', scene.label, {
          role: 'label', x: 96, y: 505, width: 500, height: 110, fontSize: 30, fontWeight: 700,
        }),
        textElement(scene.id, 'headline', 'Headline', scene.headline, {
          role: 'headline', x: 96, y: 770, width: 888, height: 330, fontSize: 76, fontWeight: 800,
        }),
        textElement(scene.id, 'body', 'Body', scene.body, {
          role: 'body', x: 96, y: 1190, width: 820, height: 350, fontSize: 36,
        }),
      ]
    case 'comparison':
      return [
        ...eyebrow(scene),
        textElement(scene.id, 'headline', 'Headline', scene.headline, {
          role: 'headline', x: 96, y: 270, width: 888, height: 320, fontSize: 82, fontWeight: 800,
        }),
        textElement(scene.id, 'left-value', 'Left value', scene.left.value, {
          role: 'headline', x: 96, y: 800, width: 400, height: 230, fontSize: 138, fontWeight: 800,
        }),
        textElement(scene.id, 'left-label', 'Left label', scene.left.label, {
          role: 'label', x: 96, y: 1040, width: 400, height: 120, fontSize: 32, fontWeight: 700,
        }),
        textElement(scene.id, 'right-value', 'Right value', scene.right.value, {
          role: 'headline', x: 584, y: 800, width: 400, height: 230, fontSize: 138, fontWeight: 800,
          color: accent,
        }),
        textElement(scene.id, 'right-label', 'Right label', scene.right.label, {
          role: 'label', x: 584, y: 1040, width: 400, height: 120, fontSize: 32, fontWeight: 700,
        }),
      ]
    case 'chart':
      return [
        ...eyebrow(scene),
        textElement(scene.id, 'headline', 'Headline', scene.headline, {
          role: 'headline', x: 96, y: 220, width: 888, height: 300, fontSize: 78, fontWeight: 800,
        }),
        chartElement(scene),
        ...(scene.supportingText ? [textElement(scene.id, 'supporting', 'Supporting text', scene.supportingText, {
          role: 'body', x: 96, y: 1450, width: 888, height: 190, fontSize: 30,
        })] : []),
        ...(scene.source ? [textElement(scene.id, 'source', 'Source', scene.source, {
          role: 'caption', x: 96, y: 1690, width: 888, height: 90, fontSize: 21,
        })] : []),
      ]
  }
}

export function migrateLegacyScene(scene: LegacyScene, accent = DEFAULT_EDITORIAL_THEME.accent): Slide {
  return {
    id: scene.id,
    title: scene.title,
    duration: scene.duration,
    notes: scene.notes,
    transition: { ...scene.transition },
    background: scene.type === 'composition' ? scene.background : 'presentation',
    elements: migrateElements(scene, accent),
  }
}

export function migratePresentationV1ToV2(presentation: LegacyPresentation): Presentation {
  return {
    schemaVersion: 2,
    id: presentation.id,
    title: presentation.title,
    tagline: presentation.tagline,
    aspectRatio: '9:16',
    theme: {
      ...structuredClone(DEFAULT_EDITORIAL_THEME),
      accent: presentation.accent,
    },
    ...(presentation.imageAssets ? { imageAssets: structuredClone(presentation.imageAssets) } : {}),
    slides: presentation.scenes.map((scene) => migrateLegacyScene(scene, presentation.accent)),
    ...(presentation.narration ? {
      narration: {
        sections: presentation.narration.sections.map((section) => ({
          id: section.id,
          title: section.title,
          slideIds: [...section.sceneIds],
        })),
      },
    } : {}),
  }
}

export const migratePresentation = migratePresentationV1ToV2
