import { motion, useReducedMotion } from 'motion/react'
import type { ChartScene } from '../model'
import { createChartTicks, createLinearScale, formatChartValue, resolveChartDomain } from './chartScale'

export interface BarChartProps {
  scene: ChartScene
  accent: string
  layoutNamespace: string
  variant?: ChartRenderVariant
}

export type ChartRenderVariant = 'scene' | 'element'

const VIEWBOX_WIDTH = 840
const VIEWBOX_HEIGHT = 560

function datumLayoutId(scene: ChartScene, layoutNamespace: string, datumId: string) {
  return JSON.stringify([layoutNamespace, scene.chartId ?? scene.id, scene.chartType, scene.orientation ?? 'horizontal', datumId])
}

function chartValue(scene: ChartScene, value: number) {
  return formatChartValue(value, {
    prefix: scene.valuePrefix,
    suffix: scene.valueSuffix,
    decimalPlaces: scene.decimalPlaces,
  })
}

export function BarChart({ scene, accent, layoutNamespace, variant = 'scene' }: BarChartProps) {
  const reducedMotion = useReducedMotion()
  const isElement = variant === 'element'
  const domain = resolveChartDomain(scene.data.map((datum) => datum.value), scene.domain)
  const ticks = createChartTicks(domain)
  const hasHighlights = scene.highlightIds.length > 0
  const highlightedIds = new Set(scene.highlightIds)
  const orientation = scene.orientation ?? 'horizontal'
  const isHorizontal = orientation === 'horizontal'

  const left = isHorizontal ? 220 : 76
  const right = isHorizontal ? 104 : 30
  const top = 30
  const bottom = isHorizontal ? 58 : 106
  const plotWidth = VIEWBOX_WIDTH - left - right
  const plotHeight = VIEWBOX_HEIGHT - top - bottom
  const valueScale = createLinearScale(
    domain,
    isHorizontal ? [left, left + plotWidth] : [top + plotHeight, top],
    true,
  )
  const zeroPosition = valueScale(0)
  const bandSize = (isHorizontal ? plotHeight : plotWidth) / Math.max(scene.data.length, 1)
  const barSize = Math.min(isHorizontal ? 54 : 70, Math.max(8, bandSize * 0.58))
  const formatValue = (value: number) => chartValue(scene, value)

  return (
    <div
      className={`${isElement ? '' : 'scene-layout ' }chart-layout chart-layout--bar chart-layout--${orientation}${isElement ? ' chart-layout--element' : ''}`}
      style={isElement ? { boxSizing: 'border-box', width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden', padding: 0 } : undefined}
    >
      {!isElement && (
        <motion.header
          className="chart-header"
          key={scene.id}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {scene.eyebrow && <div className="scene-kicker">{scene.eyebrow}</div>}
          <h1 className="chart-headline">{scene.headline}</h1>
          {scene.supportingText && <p className="chart-supporting-text">{scene.supportingText}</p>}
        </motion.header>
      )}

      <div
        className={`chart-visual${isElement ? ' chart-visual--element' : ''}`}
        style={isElement ? { flex: '1 1 100%', width: '100%', height: '100%', minWidth: 0, minHeight: 0, margin: 0, overflow: 'hidden' } : undefined}
      >
        <svg
          className={`chart-svg chart-svg--bar${isElement ? ' chart-svg--element' : ''}`}
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          style={isElement ? { width: '100%', height: '100%', overflow: 'hidden' } : undefined}
          role="img"
          aria-label={`${scene.headline}. Bar chart.`}
        >
          <g className="chart-grid" aria-hidden="true">
            {ticks.map((tick) => {
              const position = valueScale(tick)
              return isHorizontal ? (
                <g key={tick}>
                  <line className="chart-grid-line" x1={position} x2={position} y1={top} y2={top + plotHeight} />
                  <text className="chart-tick-label" x={position} y={top + plotHeight + 36} textAnchor="middle">
                    {formatValue(tick)}
                  </text>
                </g>
              ) : (
                <g key={tick}>
                  <line className="chart-grid-line" x1={left} x2={left + plotWidth} y1={position} y2={position} />
                  <text className="chart-tick-label" x={left - 16} y={position + 6} textAnchor="end">
                    {formatValue(tick)}
                  </text>
                </g>
              )
            })}
            {isHorizontal ? (
              <line className="chart-zero-line" x1={zeroPosition} x2={zeroPosition} y1={top} y2={top + plotHeight} />
            ) : (
              <line className="chart-zero-line" x1={left} x2={left + plotWidth} y1={zeroPosition} y2={zeroPosition} />
            )}
          </g>

          <g className="chart-marks">
            {scene.data.map((datum, position) => {
              const datumPosition = valueScale(datum.value)
              const highlighted = highlightedIds.has(datum.id)
              const opacity = hasHighlights && !highlighted ? 0.28 : 1
              const fill = highlighted || !hasHighlights ? accent : 'currentColor'
              const transition = reducedMotion
                ? { duration: 0 }
                : { duration: 0.55, delay: position * 0.055, ease: [0.22, 1, 0.36, 1] as const }

              if (isHorizontal) {
                const y = top + bandSize * position + (bandSize - barSize) / 2
                const x = Math.min(zeroPosition, datumPosition)
                const width = Math.abs(datumPosition - zeroPosition)
                const positive = datum.value >= 0
                const labelX = Math.min(VIEWBOX_WIDTH - 8, Math.max(8, datumPosition + (positive ? 12 : -12)))

                return (
                  <motion.g
                    className="chart-datum"
                    key={datum.id}
                    initial={{ y }}
                    animate={{ y }}
                    transition={reducedMotion ? { duration: 0 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <text className="chart-category-label" x={left - 18} y={barSize / 2 + 7} textAnchor="end">
                      {datum.label}
                    </text>
                    <motion.rect
                      className={`chart-bar${highlighted ? ' chart-bar--highlighted' : ''}${hasHighlights && !highlighted ? ' chart-bar--muted' : ''}`}
                      layoutId={datumLayoutId(scene, layoutNamespace, datum.id)}
                      y={0}
                      width={width}
                      height={barSize}
                      rx={Math.min(7, barSize / 5)}
                      initial={reducedMotion ? false : { x: zeroPosition, width: 0, opacity: 0 }}
                      animate={{ x, width, opacity, fill }}
                      transition={transition}
                    />
                    {scene.showValues && (
                      <motion.text
                        className="chart-value-label"
                        x={labelX}
                        y={barSize / 2 + 7}
                        textAnchor={positive ? 'start' : 'end'}
                        initial={reducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity }}
                        transition={transition}
                      >
                        {formatValue(datum.value)}
                      </motion.text>
                    )}
                  </motion.g>
                )
              }

              const x = left + bandSize * position + (bandSize - barSize) / 2
              const y = Math.min(zeroPosition, datumPosition)
              const height = Math.abs(datumPosition - zeroPosition)
              const positive = datum.value >= 0
              const labelY = Math.min(VIEWBOX_HEIGHT - 8, Math.max(18, datumPosition + (positive ? -14 : 26)))

              return (
                <motion.g
                  className="chart-datum"
                  key={datum.id}
                  initial={{ x }}
                  animate={{ x }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.rect
                    className={`chart-bar${highlighted ? ' chart-bar--highlighted' : ''}${hasHighlights && !highlighted ? ' chart-bar--muted' : ''}`}
                    layoutId={datumLayoutId(scene, layoutNamespace, datum.id)}
                    x={0}
                    width={barSize}
                    height={height}
                    rx={Math.min(7, barSize / 5)}
                    initial={reducedMotion ? false : { y: zeroPosition, height: 0, opacity: 0 }}
                    animate={{ y, height, opacity, fill }}
                    transition={transition}
                  />
                  <text
                    className="chart-category-label chart-category-label--vertical"
                    x={barSize / 2}
                    y={top + plotHeight + 30}
                    textAnchor="middle"
                  >
                    {datum.label}
                  </text>
                  {scene.showValues && (
                    <motion.text
                      className="chart-value-label"
                      x={barSize / 2}
                      y={labelY}
                      textAnchor="middle"
                      initial={reducedMotion ? false : { opacity: 0 }}
                      animate={{ opacity }}
                      transition={transition}
                    >
                      {formatValue(datum.value)}
                    </motion.text>
                  )}
                </motion.g>
              )
            })}
          </g>
        </svg>
      </div>

      {!isElement && scene.source && <footer className="chart-source">Source: {scene.source}</footer>}
    </div>
  )
}

export default BarChart
