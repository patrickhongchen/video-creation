import type { NarrationSection, Slide } from '../model'

const GENERIC_SECTION_TITLE = /^Section \d+$/

function cloneSection(section: NarrationSection): NarrationSection {
  return { ...section, slideIds: [...section.slideIds] }
}

function renumberGenericTitles(sections: NarrationSection[]): NarrationSection[] {
  return sections.map((section, index) => ({
    ...section,
    title: GENERIC_SECTION_TITLE.test(section.title) ? `Section ${index + 1}` : section.title,
  }))
}

/**
 * Normalizes sections into deck order and makes their ranges cover the whole deck.
 * Malformed legacy records are left untouched so a repair can be explicit.
 */
export function coverSlidesWithSections(
  slides: readonly Slide[],
  sections: readonly NarrationSection[],
  defaultSectionId: string,
): NarrationSection[] {
  if (slides.length === 0) return sections.map(cloneSection)
  if (sections.length === 0) {
    return [{
      id: defaultSectionId,
      title: 'Section 1',
      slideIds: slides.map((slide) => slide.id),
    }]
  }

  const slideIndexById = new Map(slides.map((slide, index) => [slide.id, index]))
  const anchored: Array<{ section: NarrationSection; start: number; sourceIndex: number }> = []
  let hasOrphan = false

  sections.forEach((section, sourceIndex) => {
    const knownIndices = section.slideIds
      .map((slideId) => slideIndexById.get(slideId))
      .filter((index): index is number => index !== undefined)
    if (knownIndices.length === 0) {
      hasOrphan = true
      return
    }
    anchored.push({ section, start: Math.min(...knownIndices), sourceIndex })
  })

  anchored.sort((left, right) => left.start - right.start || left.sourceIndex - right.sourceIndex)
  if (hasOrphan || anchored.some((item, index) => index > 0 && item.start === anchored[index - 1].start)) {
    return sections.map(cloneSection)
  }
  const covered = anchored.map(({ section }, index) => {
    const start = index === 0 ? 0 : anchored[index].start
    const end = index + 1 < anchored.length ? anchored[index + 1].start : slides.length
    return {
      ...section,
      slideIds: slides.slice(start, end).map((slide) => slide.id),
    }
  })

  return renumberGenericTitles(covered)
}

/** Existing section IDs whose slide ranges change in an update. */
export function sectionsWithChangedSlideRanges(
  sections: readonly NarrationSection[],
  nextSections: readonly NarrationSection[],
): string[] {
  const nextById = new Map(nextSections.map((section) => [section.id, section]))
  return sections.filter((section) => {
    const next = nextById.get(section.id)
    return next && (section.slideIds.length !== next.slideIds.length
      || section.slideIds.some((id, index) => id !== next.slideIds[index]))
  }).map((section) => section.id)
}

/** Adds a section boundary at the requested slide. */
export function splitSectionAtSlide(
  slides: readonly Slide[],
  sections: readonly NarrationSection[],
  slideIndex: number,
  newSectionId: string,
): NarrationSection[] {
  if (!Number.isInteger(slideIndex) || slideIndex < 0 || slideIndex >= slides.length) {
    return sections.map(cloneSection)
  }

  const slideId = slides[slideIndex].id
  const ownerIndex = sections.findIndex((section) => section.slideIds.includes(slideId))
  if (ownerIndex < 0) return sections.map(cloneSection)

  const owner = sections[ownerIndex]
  const boundaryIndex = owner.slideIds.indexOf(slideId)
  if (boundaryIndex <= 0) return sections.map(cloneSection)

  const next = sections.map(cloneSection)
  next.splice(ownerIndex, 1,
    { ...owner, slideIds: owner.slideIds.slice(0, boundaryIndex) },
    {
      id: newSectionId,
      title: `Section ${ownerIndex + 2}`,
      slideIds: owner.slideIds.slice(boundaryIndex),
    },
  )
  return renumberGenericTitles(next)
}

/** Removes a boundary by joining a section to the section immediately before it. */
export function mergeSectionIntoPrevious(
  sections: readonly NarrationSection[],
  sectionId: string,
): NarrationSection[] {
  const sectionIndex = sections.findIndex((section) => section.id === sectionId)
  if (sectionIndex <= 0) return sections.map(cloneSection)

  const next = sections.map(cloneSection)
  const previous = next[sectionIndex - 1]
  const current = next[sectionIndex]
  previous.slideIds = [...new Set([...previous.slideIds, ...current.slideIds])]
  next.splice(sectionIndex, 1)
  return renumberGenericTitles(next)
}
