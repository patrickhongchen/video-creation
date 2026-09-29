import type { SlideEntranceAnimation } from '../model'

const MAX_ELEMENT_ENTRANCE_DELAY_MS = 60_000
const MAX_ELEMENT_ENTRANCE_DURATION_MS = 10_000

export interface LegacyAnimationValidationBoundary {
  object(value: unknown, path: string): Record<string, unknown>
  positiveInteger(value: unknown, path: string): number
  boundedNumber(value: unknown, path: string, minimum: number, maximum: number): number
  fail(path: string, message: string): never
}

/**
 * Import-only compatibility for projects authored before click-driven reveal
 * groups. Runtime animation objects must not retain delayMs or durationMs.
 */
export function deriveLegacyAnimationOrders(
  elements: unknown[],
  path: string,
  validation: LegacyAnimationValidationBoundary,
): ReadonlyMap<number, number> {
  const delays = new Set<number>()
  const canonicalOrders = new Set<number>()
  elements.forEach((candidate, index) => {
    const element = validation.object(candidate, `${path}[${index}]`)
    if (element.animation === undefined) return
    const animationPath = `${path}[${index}].animation`
    const animation = validation.object(element.animation, animationPath)
    if (animation.order !== undefined) {
      canonicalOrders.add(validation.positiveInteger(animation.order, `${animationPath}.order`))
      return
    }
    delays.add(validation.boundedNumber(animation.delayMs, `${animationPath}.delayMs`, 0, MAX_ELEMENT_ENTRANCE_DELAY_MS))
    validation.boundedNumber(animation.durationMs, `${animationPath}.durationMs`, 0, MAX_ELEMENT_ENTRANCE_DURATION_MS)
  })

  const result = new Map<number, number>()
  let nextOrder = 1
  Array.from(delays).sort((a, b) => a - b).forEach((delay) => {
    while (canonicalOrders.has(nextOrder)) nextOrder += 1
    result.set(delay, nextOrder)
    nextOrder += 1
  })
  return result
}

export function parseLegacyTimingAnimation(
  data: Record<string, unknown>,
  path: string,
  entrance: SlideEntranceAnimation['entrance'],
  legacyOrders: ReadonlyMap<number, number>,
  validation: Pick<LegacyAnimationValidationBoundary, 'boundedNumber' | 'fail'>,
): SlideEntranceAnimation {
  const delay = validation.boundedNumber(data.delayMs, `${path}.delayMs`, 0, MAX_ELEMENT_ENTRANCE_DELAY_MS)
  validation.boundedNumber(data.durationMs, `${path}.durationMs`, 0, MAX_ELEMENT_ENTRANCE_DURATION_MS)
  const order = legacyOrders.get(delay)
  if (order === undefined) validation.fail(`${path}.delayMs`, 'could not derive a reveal order')
  return { entrance, order }
}
