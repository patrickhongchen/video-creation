import { motion, useReducedMotion } from 'motion/react'
import type { ChartRenderModel } from './BarChart'
import { createChartTicks, createLinearScale, formatChartValue, resolveChartDomain } from './chartScale'

export interface LineChartProps {
  scene: ChartRenderModel
  accent: string
  layoutNamespace: string
}

const VIEWBOX_WIDTH = 840
const VIEWBOX_HEIGHT = 560
const LEFT = 78
const RIGHT = 34
const TOP = 34
const BOTTOM = 104

function datumLayoutId(scene: ChartRenderModel, layoutNamespace: string, datumId: string) {
  return JSON.stringify([layoutNamespace, scene.chartId ?? scene.id, scene.chartType, datumId])
}

export function LineChart({ scene, accent, layoutNamespace }: LineChartProps) {
  const reducedMotion = useReducedMotion()
  const orientation = scene.orientation ?? 'vertical'
  const domain = resolveChartDomain(scene.data.map((datum) => datum.value), scene.domain)
  const ticks = createChartTicks(domain)
  const yScale = createLinearScale(domain, [VIEWBOX_HEIGHT - BOTTOM, TOP], true)
  const plotWidth = VIEWBOX_WIDTH - LEFT - RIGHT
  const plotBottom = VIEWBOX_HEIGHT - BOTTOM
  const highlightedIds = new Set(scene.highlightIds)
  const hasHighlights = highlightedIds.size > 0
  const formatValue = (value: number) => formatChartValue(value, {
    prefix: scene.valuePrefix,
    suffix: scene.valueSuffix,
    decimalPlaces: scene.decimalPlaces,
  })
  const xAt = (position: number) => scene.data.length > 1
    ? LEFT + (plotWidth * position) / (scene.data.length - 1)
    : LEFT + plotWidth / 2
  const points = scene.data.map((datum, position) => ({
    ...datum,
    x: xAt(position),
    y: yScale(datum.value),
  }))
  const path = points.map((point, position) => `${position === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  return (
    <div
      className={`chart-layout chart-layout--line chart-layout--${orientation} chart-layout--element`}
      style={{ boxSizing: 'border-box', width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden', padding: 0 }}
    >
      <div
        className="chart-visual chart-visual--element"
        style={{ flex: '1 1 100%', width: '100%', height: '100%', minWidth: 0, minHeight: 0, margin: 0, overflow: 'hidden' }}
      >
        <svg
          className="chart-svg chart-svg--line chart-svg--element"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%', overflow: 'hidden' }}
          role="img"
          aria-label={`${scene.headline ?? scene.name ?? 'Chart'}. Line chart.`}
        >
          <g className="chart-grid" aria-hidden="true">
            {ticks.map((tick) => {
              const y = yScale(tick)
              return (
                <g key={tick}>
                  <line className="chart-grid-line" x1={LEFT} x2={VIEWBOX_WIDTH - RIGHT} y1={y} y2={y} />
                  <text className="chart-tick-label" x={LEFT - 16} y={y + 6} textAnchor="end">
                    {formatValue(tick)}
                  </text>
                </g>
              )
            })}
            <line className="chart-zero-line" x1={LEFT} x2={VIEWBOX_WIDTH - RIGHT} y1={yScale(0)} y2={yScale(0)} />
          </g>

          {path && (
            <motion.path
              className="chart-line"
              fill="none"
              stroke={accent}
              pathLength={1}
              vectorEffect="non-scaling-stroke"
              initial={reducedMotion ? false : { d: path, pathLength: 0, opacity: 0 }}
              animate={{ d: path, pathLength: 1, opacity: 1 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          )}

          <g className="chart-points">
            {points.map((point, position) => {
              const highlighted = highlightedIds.has(point.id)
              const opacity = hasHighlights && !highlighted ? 0.28 : 1
              const radius = highlighted ? 11 : 7
              const transition = reducedMotion
                ? { duration: 0 }
                : { duration: 0.42, delay: position * 0.055, ease: [0.22, 1, 0.36, 1] as const }

              return (
                <g className="chart-datum" key={point.id}>
                  <motion.circle
                    className={`chart-point${highlighted ? ' chart-point--highlighted' : ''}${hasHighlights && !highlighted ? ' chart-point--muted' : ''}`}
                    layoutId={datumLayoutId(scene, layoutNamespace, point.id)}
                    r={radius}
                    initial={reducedMotion ? false : { cx: point.x, cy: point.y, scale: 0, opacity: 0 }}
                    animate={{ cx: point.x, cy: point.y, scale: 1, opacity, fill: highlighted || !hasHighlights ? accent : 'currentColor', r: radius }}
                    transition={transition}
                  />
                  <text
                    className="chart-category-label chart-category-label--line"
                    x={point.x}
                    y={plotBottom + 32}
                    textAnchor="middle"
                  >
                    {point.label}
                  </text>
                  {scene.showValues && (
                    <motion.text
                      className="chart-value-label"
                      x={point.x}
                      y={Math.max(18, point.y - 18)}
                      textAnchor="middle"
                      initial={reducedMotion ? false : { opacity: 0 }}
                      animate={{ opacity }}
                      transition={transition}
                    >
                      {formatValue(point.value)}
                    </motion.text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}

export default LineChart
