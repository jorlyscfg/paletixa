import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReportDailyPoint } from '../api/sales'

const WIDTH = 720
const HEIGHT = 240
const PADDING_X = 28
const PADDING_TOP = 20
const PADDING_BOTTOM = 34
const MIN_CHART_WIDTH = 544
const MIN_POINT_SPACING = 48
const MIN_TOUCH_TARGET = 44
const MAX_HIT_RADIUS = 30
const TOOLTIP_WIDTH = 188
const TOOLTIP_HEIGHT = 74
const TOOLTIP_GAP = 12

function formatMxn(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`))
}

function formatSaleCount(value: number) {
  return `${value} ${value === 1 ? 'venta reconocida' : 'ventas reconocidas'}`
}

function pointLabel(point: ReportDailyPoint) {
  return `Datos de ventas del ${formatDate(point.date)}: ${formatSaleCount(point.saleCount)}. Total: ${formatMxn(point.totalMxn)}.`
}

function tooltipPosition(point: { x: number; y: number }) {
  const x = Math.min(Math.max(point.x - TOOLTIP_WIDTH / 2, 8), WIDTH - TOOLTIP_WIDTH - 8)
  const abovePoint = point.y - TOOLTIP_HEIGHT - TOOLTIP_GAP
  const y = abovePoint >= PADDING_TOP ? abovePoint : Math.min(point.y + TOOLTIP_GAP, HEIGHT - TOOLTIP_HEIGHT - 4)
  return { x, y }
}

export type ReportTrendChartProps = {
  points: readonly ReportDailyPoint[]
  title?: string
}

export function ReportTrendChart({ points, title = 'Tendencia diaria de ventas' }: ReportTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null)
  const chartRef = useRef<HTMLElement | null>(null)
  const clearTooltip = useCallback(() => {
    setHoveredIndex(null)
    setFocusedIndex(null)
    setPinnedIndex(null)
  }, [])
  const titleId = 'report-trend-chart-title'
  const tooltipId = 'report-trend-chart-tooltip'
  const plotWidth = WIDTH - PADDING_X * 2
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM
  const chartMinWidth = Math.max(MIN_CHART_WIDTH, PADDING_X * 2 + Math.max(points.length - 1, 1) * MIN_POINT_SPACING)
  const hitRadius = Math.min(MAX_HIT_RADIUS, (MIN_TOUCH_TARGET / 2) * WIDTH / chartMinWidth)
  const maximum = Math.max(...points.map((point) => point.totalMxn), 0)
  const scaleMaximum = maximum > 0 ? maximum : 1
  const coordinates = points.map((point, index) => ({
    x: points.length < 2 ? WIDTH / 2 : PADDING_X + (index / (points.length - 1)) * plotWidth,
    y: PADDING_TOP + plotHeight - (point.totalMxn / scaleMaximum) * plotHeight,
  }))
  const linePath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const areaPath = coordinates.length > 0
    ? `${linePath} L ${coordinates[coordinates.length - 1].x.toFixed(2)} ${(PADDING_TOP + plotHeight).toFixed(2)} L ${coordinates[0].x.toFixed(2)} ${(PADDING_TOP + plotHeight).toFixed(2)} Z`
    : ''
  const activeIndex = pinnedIndex !== null && pinnedIndex < points.length
    ? pinnedIndex
    : focusedIndex !== null && focusedIndex < points.length
      ? focusedIndex
      : hoveredIndex !== null && hoveredIndex < points.length
        ? hoveredIndex
        : null
  const activePoint = activeIndex === null ? null : points[activeIndex]
  const activePosition = activeIndex === null ? null : tooltipPosition(coordinates[activeIndex])

  useEffect(() => {
    if (activeIndex === null) return

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.target instanceof Node && chartRef.current?.contains(event.target)) return
      clearTooltip()
    }

    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [activeIndex, clearTooltip])

  return <figure
    aria-labelledby={titleId}
    className="min-w-0"
    data-testid="report-trend-chart"
    ref={chartRef}
    onClick={(event) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-testid="report-trend-point"]')) clearTooltip()
    }}
  >
    <figcaption id={titleId} className="sr-only">{title}</figcaption>
    {points.length > 0 ? <>
      <div className="min-w-0 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-2 sm:p-4">
        <svg aria-labelledby={titleId} className="block h-auto min-w-[34rem] w-full" style={{ minWidth: `${chartMinWidth}px` }} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" focusable="false" onMouseLeave={() => setHoveredIndex(null)}>
          <line x1={PADDING_X} y1={PADDING_TOP + plotHeight} x2={WIDTH - PADDING_X} y2={PADDING_TOP + plotHeight} className="stroke-slate-700" strokeWidth="1" />
          <line x1={PADDING_X} y1={PADDING_TOP} x2={WIDTH - PADDING_X} y2={PADDING_TOP} className="stroke-slate-800" strokeWidth="1" strokeDasharray="4 6" />
          <path d={areaPath} className="fill-sky-500/10" />
          <path d={linePath} className="fill-none stroke-sky-400" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          {coordinates.map((point, index) => {
            const dailyPoint = points[index]
            const isActive = activeIndex === index
            const isPinned = pinnedIndex === index
            return <g
              key={`${dailyPoint.date}-${index}`}
              role="button"
              tabIndex={0}
              aria-label={pointLabel(dailyPoint)}
              aria-pressed={isPinned}
              aria-describedby={isActive ? tooltipId : undefined}
              data-testid="report-trend-point"
              data-date={dailyPoint.date}
              className="cursor-pointer outline-none"
              onMouseEnter={() => setHoveredIndex(index)}
              onFocus={() => setFocusedIndex(index)}
              onBlur={() => {
                setFocusedIndex(null)
                setPinnedIndex(null)
              }}
              onClick={() => setPinnedIndex((current) => current === index ? null : index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setPinnedIndex((current) => current === index ? null : index)
                }
              }}
            >
              <circle cx={point.x} cy={point.y} r={hitRadius} className="fill-transparent" pointerEvents="all" />
              <circle cx={point.x} cy={point.y} r={isActive ? 5 : 4} className={isActive ? 'fill-sky-300 stroke-white' : 'fill-slate-950 stroke-sky-300'} strokeWidth="2" />
            </g>
          })}
          {activePoint && activePosition ? <g
            id={tooltipId}
            role="tooltip"
            aria-label={pointLabel(activePoint)}
            data-testid="report-trend-tooltip"
            transform={`translate(${activePosition.x} ${activePosition.y})`}
            pointerEvents="none"
          >
            <rect width={TOOLTIP_WIDTH} height={TOOLTIP_HEIGHT} rx="10" className="fill-slate-950 stroke-sky-400/70" />
            <text x="12" y="19" className="fill-white" fontSize="12" fontWeight="700">{formatDate(activePoint.date)}</text>
            <text x="12" y="38" className="fill-slate-300" fontSize="11">{formatSaleCount(activePoint.saleCount)}</text>
            <text x="12" y="57" className="fill-sky-200" fontSize="11" fontWeight="700">Total: {formatMxn(activePoint.totalMxn)}</text>
          </g> : null}
          <text x={PADDING_X} y={HEIGHT - 10} className="fill-slate-500" fontSize="11" textAnchor="start">{formatDate(points[0].date)}</text>
          <text x={WIDTH - PADDING_X} y={HEIGHT - 10} className="fill-slate-500" fontSize="11" textAnchor="end">{formatDate(points[points.length - 1].date)}</text>
          <text x={PADDING_X} y={PADDING_TOP - 6} className="fill-slate-500" fontSize="11" textAnchor="start">{formatMxn(maximum)}</text>
          <text x={PADDING_X} y={PADDING_TOP + plotHeight - 6} className="fill-slate-500" fontSize="11" textAnchor="start">$0.00</text>
        </svg>
      </div>
    </> : <p role="status" className="ops-state ops-state-empty">No hay días disponibles para mostrar la tendencia.</p>}
  </figure>
}
