import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReportTrendChart } from './ReportTrendChart'

describe('ReportTrendChart', () => {
  afterEach(cleanup)

  it('renders a dependency-free visual without daily cards and exposes interactive points', () => {
    render(<ReportTrendChart points={[{ date: '2026-08-27', saleCount: 2, totalMxn: 100 }, { date: '2026-08-28', saleCount: 0, totalMxn: 0 }]} />)

    expect(screen.getByTestId('report-trend-chart').querySelector('svg')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Datos diarios de ventas' })).not.toBeInTheDocument()

    const points = screen.getAllByRole('button')
    expect(points).toHaveLength(2)
    expect(points[0]).toHaveAttribute('tabindex', '0')
    expect(points[0]).toHaveAttribute('aria-label', expect.stringContaining('27-ago'))
    expect(points[1]).toHaveAttribute('aria-label', expect.stringContaining('0 ventas reconocidas'))
    expect(Number(points[0].querySelector('circle')?.getAttribute('r'))).toBeGreaterThanOrEqual(20)
  })

  it('reveals the hovered point tooltip with the formatted day, count, and MXN total', () => {
    render(<ReportTrendChart points={[{ date: '2026-08-27', saleCount: 2, totalMxn: 100 }, { date: '2026-08-28', saleCount: 0, totalMxn: 0 }]} />)

    fireEvent.mouseEnter(screen.getAllByRole('button')[1])

    expect(screen.getByRole('tooltip')).toHaveTextContent('28-ago')
    expect(screen.getByRole('tooltip')).toHaveTextContent('0 ventas reconocidas')
    expect(screen.getByRole('tooltip')).toHaveTextContent('$0.00')
  })

  it('closes a focused point tooltip when the point loses focus', () => {
    render(<ReportTrendChart points={[{ date: '2026-08-27', saleCount: 2, totalMxn: 100 }]} />)

    const point = screen.getByRole('button')
    fireEvent.focus(point)

    expect(screen.getByRole('tooltip')).toHaveTextContent('27-ago')

    fireEvent.keyDown(point, { key: 'Enter' })
    expect(point).toHaveAttribute('aria-pressed', 'true')

    fireEvent.blur(point)

    expect(point).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('pins and toggles a point tooltip on click, including after leaving the chart', () => {
    render(<ReportTrendChart points={[{ date: '2026-08-27', saleCount: 2, totalMxn: 100 }, { date: '2026-08-28', saleCount: 0, totalMxn: 0 }]} />)

    const chart = screen.getByTestId('report-trend-chart')
    const point = screen.getAllByRole('button')[0]
    fireEvent.click(point)
    fireEvent.mouseLeave(chart.querySelector('svg')!)

    expect(point).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('tooltip')).toHaveTextContent('27-ago')

    fireEvent.click(point)

    expect(point).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('closes a pinned tooltip when clicking the chart background', () => {
    render(<ReportTrendChart points={[{ date: '2026-08-27', saleCount: 2, totalMxn: 100 }, { date: '2026-08-28', saleCount: 0, totalMxn: 0 }]} />)

    const chart = screen.getByTestId('report-trend-chart')
    const point = screen.getAllByRole('button')[0]
    fireEvent.click(point)

    expect(screen.getByRole('tooltip')).toHaveTextContent('27-ago')

    fireEvent.click(chart.querySelector('svg')!)

    expect(point).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('closes a pinned tooltip when clicking outside the chart', () => {
    render(<ReportTrendChart points={[{ date: '2026-08-27', saleCount: 2, totalMxn: 100 }]} />)

    const point = screen.getByRole('button')
    fireEvent.click(point)

    expect(screen.getByRole('tooltip')).toHaveTextContent('27-ago')

    fireEvent.click(document.body)

    expect(point).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('switches the pinned tooltip when clicking another point', () => {
    render(<ReportTrendChart points={[{ date: '2026-08-27', saleCount: 2, totalMxn: 100 }, { date: '2026-08-28', saleCount: 0, totalMxn: 0 }]} />)

    const points = screen.getAllByRole('button')
    fireEvent.click(points[0])
    fireEvent.click(points[1])

    expect(points[0]).toHaveAttribute('aria-pressed', 'false')
    expect(points[1]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('tooltip')).toHaveTextContent('28-ago')
  })

  it('supports keyboard activation for pinning a point tooltip', () => {
    render(<ReportTrendChart points={[{ date: '2026-08-27', saleCount: 2, totalMxn: 100 }]} />)

    const point = screen.getByRole('button')
    fireEvent.keyDown(point, { key: 'Enter' })

    expect(point).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('tooltip')).toHaveTextContent('27-ago')
  })

  it('announces an empty trend without rendering invalid SVG geometry', () => {
    render(<ReportTrendChart points={[]} />)

    expect(screen.getByRole('status')).toHaveTextContent('No hay días disponibles')
    expect(screen.queryByTestId('report-trend-chart')?.querySelector('svg')).not.toBeInTheDocument()
  })
})
