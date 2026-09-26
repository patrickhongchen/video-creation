import { describe, expect, it } from 'vitest'
import type { NarrationSection, Slide } from '../model'
import { coverSlidesWithSections, mergeSectionIntoPrevious, sectionsWithChangedSlideRanges, splitSectionAtSlide } from './sectionBoundaries'

function slide(id: string): Slide {
  return {
    id,
    title: id,
    duration: 3,
    transition: { type: 'fade', duration: 0.2 },
    elements: [],
  }
}

const slides = ['a', 'b', 'c', 'd', 'e'].map(slide)

describe('coverSlidesWithSections', () => {
  it('fills leading and interior gaps into sequential sections', () => {
    const sections: NarrationSection[] = [
      { id: 'second', title: 'Details', slideIds: ['d'] },
      { id: 'first', title: 'Opening', slideIds: ['b'] },
    ]

    expect(coverSlidesWithSections(slides, sections, 'default')).toEqual([
      { id: 'first', title: 'Opening', slideIds: ['a', 'b', 'c'] },
      { id: 'second', title: 'Details', slideIds: ['d', 'e'] },
    ])
  })

  it('creates one default section when the deck has no sections', () => {
    expect(coverSlidesWithSections(slides, [], 'default')).toEqual([
      { id: 'default', title: 'Section 1', slideIds: ['a', 'b', 'c', 'd', 'e'] },
    ])
  })

  it('orders existing generic section names with their slide ranges', () => {
    expect(coverSlidesWithSections(slides, [
      { id: 'later', title: 'Section 1', slideIds: ['d'] },
      { id: 'earlier', title: 'Section 2', slideIds: ['a'] },
    ], 'default')).toEqual([
      { id: 'earlier', title: 'Section 1', slideIds: ['a', 'b', 'c'] },
      { id: 'later', title: 'Section 2', slideIds: ['d', 'e'] },
    ])
  })

  it('does not persist orphaned legacy records during automatic coverage', () => {
    const orphan = { id: 'orphan', title: 'Old section', slideIds: ['deleted-slide'] }
    const sections = [
      orphan,
      { id: 'current', title: 'Current', slideIds: ['c'] },
    ]
    expect(coverSlidesWithSections(slides, sections, 'default')).toEqual(sections)
  })

  it('does not create an empty section from duplicate legacy starts', () => {
    const sections = [
      { id: 'one', title: 'One', slideIds: ['a'] },
      { id: 'two', title: 'Two', slideIds: ['a'] },
    ]
    expect(coverSlidesWithSections(slides, sections, 'default')).toEqual(sections)
  })

  it('does not alter section data for an empty deck', () => {
    const sections = [{ id: 'legacy', title: 'Legacy', slideIds: ['missing'] }]
    expect(coverSlidesWithSections([], sections, 'default')).toEqual(sections)
  })
})

describe('section boundary changes', () => {
  it('identifies surviving sections whose recorded slide range changed', () => {
    const original = [
      { id: 'intro', title: 'Intro', slideIds: ['a', 'b'] },
      { id: 'end', title: 'End', slideIds: ['d'] },
    ]
    const next = coverSlidesWithSections(slides, original, 'default')
    expect(sectionsWithChangedSlideRanges(original, next)).toEqual(['intro', 'end'])
    expect(sectionsWithChangedSlideRanges(original, original.map((section) => ({ ...section, title: 'Renamed' })))).toEqual([])
  })

  it('splits the owning section at a slide and preserves custom titles', () => {
    const sections: NarrationSection[] = [
      { id: 'intro', title: 'Introduction', slideIds: ['a', 'b', 'c'] },
      { id: 'end', title: 'Section 2', slideIds: ['d', 'e'] },
    ]

    expect(splitSectionAtSlide(slides, sections, 1, 'new')).toEqual([
      { id: 'intro', title: 'Introduction', slideIds: ['a'] },
      { id: 'new', title: 'Section 2', slideIds: ['b', 'c'] },
      { id: 'end', title: 'Section 3', slideIds: ['d', 'e'] },
    ])
  })

  it('merges a section into its predecessor and renumbers generic titles', () => {
    const sections: NarrationSection[] = [
      { id: 'intro', title: 'Introduction', slideIds: ['a'] },
      { id: 'middle', title: 'Section 2', slideIds: ['b', 'c'] },
      { id: 'end', title: 'Section 3', slideIds: ['d', 'e'] },
    ]

    expect(mergeSectionIntoPrevious(sections, 'middle')).toEqual([
      { id: 'intro', title: 'Introduction', slideIds: ['a', 'b', 'c'] },
      { id: 'end', title: 'Section 2', slideIds: ['d', 'e'] },
    ])
  })
})
