export interface ChartDomainInput {
  min?: number
  max?: number
}

export interface ResolvedChartDomain {
  min: number
  max: number
}

export type LinearScale = ((value: number) => number) & {
  domain: ResolvedChartDomain
  range: readonly [number, number]
}

function finiteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Resolves a usable chart domain from a data series and optional author bounds.
 * Inferred domains include zero. An explicit positive minimum or negative maximum
 * is treated as an intentional request to exclude zero.
 */
export function resolveChartDomain(
  values: readonly number[],
  requested: ChartDomainInput = {},
): ResolvedChartDomain {
  const finiteValues = values.filter(Number.isFinite)
  const requestedMin = finiteNumber(requested.min) ? requested.min : undefined
  const requestedMax = finiteNumber(requested.max) ? requested.max : undefined

  let min: number
  let max: number

  if (finiteValues.length > 0) {
    const dataMin = Math.min(...finiteValues)
    const dataMax = Math.max(...finiteValues)
    const fallbackPadding = Math.max(Math.abs(requestedMin ?? requestedMax ?? 0) * 0.1, 1)
    min = requestedMin ?? (requestedMax === undefined ? dataMin : Math.min(dataMin, requestedMax - fallbackPadding))
    max = requestedMax ?? (requestedMin === undefined ? dataMax : Math.max(dataMax, requestedMin + fallbackPadding))
  } else if (requestedMin !== undefined && requestedMax !== undefined) {
    min = requestedMin
    max = requestedMax
  } else if (requestedMin !== undefined) {
    min = requestedMin
    max = requestedMin > 0 ? requestedMin + Math.max(Math.abs(requestedMin) * 0.1, 1) : 0
  } else if (requestedMax !== undefined) {
    min = requestedMax < 0 ? requestedMax - Math.max(Math.abs(requestedMax) * 0.1, 1) : 0
    max = requestedMax
  } else {
    min = 0
    max = 1
  }

  if (min > max) {
    ;[min, max] = [max, min]
  }

  const explicitlyExcludesZero =
    (requestedMin !== undefined && requestedMin > 0) ||
    (requestedMax !== undefined && requestedMax < 0)

  if (!explicitlyExcludesZero) {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  }

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.1, 1)
    min -= padding
    max += padding
  }

  return { min, max }
}

/** Creates a linear numeric scale. Reversed ranges are supported. */
export function createLinearScale(
  domain: ResolvedChartDomain,
  range: readonly [number, number],
  clamp = false,
): LinearScale {
  const domainSpan = domain.max - domain.min
  const rangeSpan = range[1] - range[0]

  const scale = ((value: number) => {
    const safeValue = Number.isFinite(value) ? value : domain.min
    const ratio = domainSpan === 0 ? 0.5 : (safeValue - domain.min) / domainSpan
    const scaledRatio = clamp ? Math.min(1, Math.max(0, ratio)) : ratio
    return range[0] + scaledRatio * rangeSpan
  }) as LinearScale

  scale.domain = domain
  scale.range = range
  return scale
}

/** Returns evenly spaced ticks, including both ends of the resolved domain. */
export function createChartTicks(
  domain: ResolvedChartDomain,
  count = 5,
): number[] {
  const tickCount = Math.max(2, Math.floor(count))
  const step = (domain.max - domain.min) / (tickCount - 1)
  return Array.from({ length: tickCount }, (_, index) => domain.min + step * index)
}

export function formatChartValue(
  value: number,
  options: { prefix?: string; suffix?: string; decimalPlaces?: number } = {},
): string {
  const inferredPlaces = Number.isInteger(value)
    ? 0
    : Math.abs(value).toFixed(6).split('.')[1].replace(/0+$/, '').length
  const decimalPlaces = Math.min(6, Math.max(0, Math.floor(options.decimalPlaces ?? inferredPlaces)))
  return `${options.prefix ?? ''}${value.toFixed(decimalPlaces)}${options.suffix ?? ''}`
}
