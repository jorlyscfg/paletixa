import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as salesApi from '../api/sales'
import { SalesReportWorkspace } from './SalesReportWorkspace'

vi.mock('../api/sales', () => ({ SALES_CHANNELS: ['pos', 'wholesale', 'event'], getSalesByChannel: vi.fn() }))

const totals: salesApi.SalesChannelTotal[] = [
  { channel: 'pos', saleCount: 2, totalMxn: 100 },
  { channel: 'wholesale', saleCount: 1, totalMxn: 72.5 },
  { channel: 'event', saleCount: 0, totalMxn: 0 },
]

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function longDateValue(date: Date) {
  return date.toLocaleDateString('en-US', { dateStyle: 'long' })
}

function selectDate(label: string, date: Date) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}:`) }))
  fireEvent.click(screen.getByRole('button', { name: longDateValue(date) }))
}

describe('sales report workspace', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(salesApi.getSalesByChannel).mockResolvedValue(totals)
  })

  it('shows combined and per-channel totals', async () => {
    render(<SalesReportWorkspace />)
    expect(await screen.findByText('$172.50 MXN')).toBeInTheDocument()
    expect(screen.getByText('Combined sales').closest('article')).toHaveTextContent('$172.50 MXN')
    expect(screen.getByText('Sales count').closest('article')).toHaveTextContent('3')
    expect(screen.getByRole('heading', { name: 'POS' }).closest('li')).toHaveTextContent('2 sales')
    expect(screen.getByRole('heading', { name: 'Wholesale' }).closest('li')).toHaveTextContent('$72.50 MXN')
    expect(screen.getByRole('heading', { name: 'Event' }).closest('li')).toHaveTextContent('0 sales')
  })

  it('renders one comparison bar per channel using the returned MXN totals', async () => {
    render(<SalesReportWorkspace />)
    expect(await screen.findByText('Sales report loaded.')).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(3)
    expect(screen.getByRole('progressbar', { name: 'POS sales value comparison' })).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByRole('progressbar', { name: 'Wholesale sales value comparison' })).toHaveAttribute('aria-valuenow', '72.5')
    expect(screen.getByRole('progressbar', { name: 'Event sales value comparison' })).toHaveAttribute('aria-valuenow', '0')
  })

  it('keeps zero channels visible when the API omits them', async () => {
    vi.mocked(salesApi.getSalesByChannel).mockResolvedValue([{ channel: 'pos', saleCount: 0, totalMxn: 0 }])
    render(<SalesReportWorkspace />)
    expect(await screen.findByText('No sales were recorded for this date range.')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['POS', 'Wholesale', 'Event'])
    expect(screen.getAllByText('$0.00 MXN')).toHaveLength(4)
  })

  it('validates the date order before loading another report', async () => {
    render(<SalesReportWorkspace />)
    await screen.findByText('Sales report loaded.')
    const calls = vi.mocked(salesApi.getSalesByChannel).mock.calls.length
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    selectDate('Start date', today)
    selectDate('End date', yesterday)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh report' }))
    expect(screen.getByRole('alert')).toHaveTextContent('start date must be on or before')
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(salesApi.getSalesByChannel).toHaveBeenCalledTimes(calls)
  })

  it('submits the selected date picker range to the report API', async () => {
    render(<SalesReportWorkspace />)
    await screen.findByText('Sales report loaded.')
    const start = new Date()
    start.setDate(start.getDate() - 2)
    const end = new Date()
    selectDate('Start date', start)
    selectDate('End date', end)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh report' }))
    await screen.findByText('Sales report loaded.')

    const expectedEnd = new Date(`${dateInputValue(end)}T00:00:00.000Z`)
    expectedEnd.setUTCDate(expectedEnd.getUTCDate() + 1)
    expect(salesApi.getSalesByChannel).toHaveBeenLastCalledWith({
      from: `${dateInputValue(start)}T00:00:00.000Z`,
      to: expectedEnd.toISOString(),
    })
  })

  it('announces loading while a report request is pending', async () => {
    let resolve!: (value: salesApi.SalesChannelTotal[]) => void
    vi.mocked(salesApi.getSalesByChannel).mockReturnValue(new Promise((done) => { resolve = done }))
    render(<SalesReportWorkspace />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading sales report')
    expect(screen.getByRole('button', { name: 'Loading report…' })).toBeDisabled()
    resolve(totals)
    expect(await screen.findByText('Sales report loaded.')).toBeInTheDocument()
  })

  it('focuses a recoverable error and retries the same report', async () => {
    vi.mocked(salesApi.getSalesByChannel).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(totals)
    render(<SalesReportWorkspace />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('$172.50 MXN')).toBeInTheDocument()
    expect(salesApi.getSalesByChannel).toHaveBeenCalledTimes(2)
  })
})
