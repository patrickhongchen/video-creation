import { describe, expect, it } from 'vitest'
import type { LegacyPresentation, Presentation, Slide } from './model'
import { createSlideFromPreset, duplicateSlide, slidePresetOptions } from './presentationFactories'
import { serializePresentation } from './presentationFiles'
import { validatePresentation } from './presentationValidation'

const legacyPresentation: LegacyPresentation = {
  schemaVersion: 1,
  id: 'legacy-project',
  title: 'Legacy project',
  tagline: 'Migration fixture',
  aspectRatio: '9:16',
  accent: '#6633ff',
  scenes: [
    {
      id: 'legacy-title',
      type: 'title',
      title: 'Opening',
      duration: 3,
      headline: 'An opening',
      subtitle: 'With context',
      transition: { type: 'fade', duration: 0.5 },
    },
    {
      id: 'legacy-stat',
      type: 'big-stat',
      title: 'Key number',
      duration: 5,
      value: '42%',
      label: 'the important number',
      elementId: 'shared-statistic',
      notes: 'Keep this note and ID.',
      transition: { type: 'scale', duration: 0.7 },
    },
    {
      id: 'legacy-stat-detail',
      type: 'stat-detail',
      title: 'Explain the number',
      duration: 4,
      value: '42%',
      label: 'the same number',
      headline: 'Now add meaning.',
      body: 'The identity should continue.',
      elementId: 'shared-statistic',
      transition: { type: 'slide', duration: 0.6 },
    },
    {
      id: 'legacy-chart',
      type: 'chart',
      title: 'Chart',
      duration: 5,
      headline: 'A chart story',
      chartType: 'bar',
      orientation: 'horizontal',
      chartId: 'continuing-chart',
      data: [
        { id: 'alpha', label: 'Alpha', value: 20 },
        { id: 'beta', label: 'Beta', value: 35 },
      ],
      highlightIds: ['beta'],
      valueSuffix: '%',
      showValues: true,
      domain: { min: 0, max: 50 },
      transition: { type: 'fade', duration: 0.5 },
    },
    {
      id: 'legacy-composition',
      type: 'composition',
      title: 'Custom composition',
      duration: 4,
      eyebrow: 'Preserve this label',
      background: 'light',
      elements: [{
        id: 'existing-text',
        type: 'text',
        name: 'Existing text',
        frame: { x: 100, y: 500, width: 800, height: 200 },
        text: 'Existing structured content',
        fontSize: 64,
      }],
      transition: { type: 'fade', duration: 0.5 },
    },
  ],
  narration: {
    sections: [{ id: 'section-1', title: 'Opening section', sceneIds: ['legacy-title', 'legacy-stat'] }],
  },
}

describe('schema v1 migration', () => {
  it('produces canonical slides while preserving IDs, narration membership, and Morph identity', () => {
    const migrated = validatePresentation(legacyPresentation)

    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.slides.map((slide) => slide.id)).toEqual(legacyPresentation.scenes.map((scene) => scene.id))
    expect(migrated.narration?.sections[0]).toEqual({
      id: 'section-1',
      title: 'Opening section',
      slideIds: ['legacy-title', 'legacy-stat'],
    })
    expect(migrated.slides[1].notes).toBe('Keep this note and ID.')

    const statValue = migrated.slides[1].elements.find((element) => element.name === 'Value')
    const detailValue = migrated.slides[2].elements.find((element) => element.name === 'Value')
    expect(statValue?.sharedElementId).toBe('shared-statistic')
    expect(detailValue?.sharedElementId).toBe('shared-statistic')
  })

  it('preserves semantic chart identity, datum IDs, highlights, formatting, and domain', () => {
    const migrated = validatePresentation(legacyPresentation)
    const chart = migrated.slides[3].elements.find((element) => element.type === 'chart')

    expect(chart).toMatchObject({
      type: 'chart',
      chartId: 'continuing-chart',
      orientation: 'horizontal',
      highlightIds: ['beta'],
      valueSuffix: '%',
      domain: { min: 0, max: 50 },
    })
    expect(chart?.type === 'chart' ? chart.data.map((datum) => datum.id) : []).toEqual(['alpha', 'beta'])
  })

  it('preserves legacy Composition elements and its eyebrow metadata', () => {
    const migrated = validatePresentation(legacyPresentation)
    const slide = migrated.slides[4]

    expect(slide.background).toBe('light')
    expect(slide.elements.find((element) => element.name === 'Eyebrow')).toMatchObject({
      type: 'text',
      text: 'Preserve this label',
    })
    expect(slide.elements.find((element) => element.id === 'existing-text')).toMatchObject({
      type: 'text',
      text: 'Existing structured content',
    })
  })
})

describe('slide presets and duplication', () => {
  it('creates every preset as an unconstrained ordinary slide', () => {
    for (const { preset } of slidePresetOptions) {
      const slide = createSlideFromPreset(preset)
      expect(slide).toHaveProperty('elements')
      expect(slide).not.toHaveProperty('preset')
      expect(slide).not.toHaveProperty('type')
      if (preset === 'blank') expect(slide.elements).toEqual([])
    }
  })

  it('regenerates slide and element IDs while preserving cross-slide identities', () => {
    const original: Slide = {
      id: 'slide-original',
      title: 'Original',
      duration: 4,
      transition: { type: 'fade', duration: 0.5 },
      elements: [
        {
          id: 'image-original',
          type: 'image',
          name: 'Photo',
          sharedElementId: 'shared-photo',
          assetId: 'photo-asset',
          fit: 'cover',
          frame: { x: 100, y: 100, width: 500, height: 500 },
        },
        {
          id: 'chart-original',
          type: 'chart',
          name: 'Chart',
          sharedElementId: 'shared-chart-frame',
          chartId: 'chart-story',
          chartType: 'bar',
          data: [{ id: 'datum-a', label: 'A', value: 10 }],
          highlightIds: ['datum-a'],
          showValues: true,
          frame: { x: 100, y: 700, width: 800, height: 600 },
        },
      ],
    }

    const copy = duplicateSlide(original)
    expect(copy.id).not.toBe(original.id)
    expect(copy.elements.map((element) => element.id)).not.toEqual(original.elements.map((element) => element.id))
    expect(copy.elements.map((element) => element.sharedElementId)).toEqual(['shared-photo', 'shared-chart-frame'])
    expect(copy.elements[0].type === 'image' && copy.elements[0].assetId).toBe('photo-asset')
    expect(copy.elements[1].type === 'chart' && copy.elements[1].chartId).toBe('chart-story')
    expect(copy.elements[1].type === 'chart' && copy.elements[1].data[0].id).toBe('datum-a')
  })
})

describe('v2 serialization and validation', () => {
  it('round-trips the canonical representation without legacy scenes', () => {
    const presentation = validatePresentation(legacyPresentation)
    const serialized = serializePresentation(presentation)
    const parsed = validatePresentation(JSON.parse(serialized))

    expect(parsed).toEqual(presentation)
    expect(serialized).toContain('"schemaVersion": 2')
    expect(serialized).toContain('"slides"')
    expect(serialized).not.toContain('"scenes"')
  })

  it('reports a path-specific duplicate element ID error', () => {
    const presentation = validatePresentation(legacyPresentation)
    const invalid: Presentation = structuredClone(presentation)
    invalid.slides[0].elements.push(structuredClone(invalid.slides[0].elements[0]))

    expect(() => validatePresentation(invalid)).toThrow(/presentation\.slides\[0\]\.elements\[\d+\]\.id: duplicate element ID/)
  })

  it('rejects duplicate chart identities within one slide', () => {
    const presentation = validatePresentation(legacyPresentation)
    const invalid: Presentation = structuredClone(presentation)
    const chart = invalid.slides[3].elements.find((element) => element.type === 'chart')!
    invalid.slides[3].elements.push({ ...structuredClone(chart), id: 'duplicate-chart-element' })

    expect(() => validatePresentation(invalid)).toThrow(/presentation\.slides\[3\]\.elements\[\d+\]\.chartId: duplicate chart ID/)
  })
})
