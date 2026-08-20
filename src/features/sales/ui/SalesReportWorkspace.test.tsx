import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as salesApi from '../api/sales'
import { SalesReportWorkspace } from './SalesReportWorkspace'
import { rankSalesProducts } from './salesReportUtils'

vi.mock('../api/sales', () => ({ SALES_CHANNELS: ['pos', 'wholesale', 'event'], getSalesByChannel: vi.fn(), getSalesReportDetail: vi.fn() }))

const totals: salesApi.SalesChannelTotal[] = [
  { channel: 'pos', saleCount: 2, totalMxn: 100 },
  { channel: 'wholesale', saleCount: 1, totalMxn: 72.5 },
  { channel: 'event', saleCount: 0, totalMxn: 0 },
]

const details: salesApi.SalesReportDetail[] = [
  { saleId: 'sale-1', saleDate: '2026-08-20T12:30:00Z', channel: 'pos', totalMxn: 100, productName: 'Mango', quantity: 2, lineTotalMxn: 50, contextLabel: 'Ana López' },
  { saleId: 'sale-1', saleDate: '2026-08-20T12:30:00Z', channel: 'pos', totalMxn: 100, productName: 'Cacao', quantity: 1, lineTotalMxn: 50, contextLabel: 'Ana López' },
  { saleId: 'sale-2', saleDate: '2026-08-20T13:30:00Z', channel: 'wholesale', totalMxn: 72.5, productName: 'Mango', quantity: 3, lineTotalMxn: 72.5, contextLabel: 'Tienda La Plaza' },
]

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function longDateValue(date: Date) {
  return date.toLocaleDateString('es-MX', { dateStyle: 'long' })
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
    vi.mocked(salesApi.getSalesReportDetail).mockResolvedValue(details)
  })

  it('shows combined and per-channel totals', async () => {
    render(<SalesReportWorkspace />)
    expect(await screen.findByText('$172.50 MXN')).toBeInTheDocument()
    expect(screen.getByText('Ventas acumuladas').closest('article')).toHaveTextContent('$172.50 MXN')
    expect(screen.getByText('Cantidad de ventas').closest('article')).toHaveTextContent('3')
    expect(screen.getByRole('heading', { name: 'Punto de venta' }).closest('li')).toHaveTextContent('2 ventas')
    expect(screen.getByRole('heading', { name: 'Mayoristas' }).closest('li')).toHaveTextContent('$72.50 MXN')
    expect(screen.getByRole('heading', { name: 'Eventos' }).closest('li')).toHaveTextContent('0 ventas')
  })

  it('renders one comparison bar per channel using the returned MXN totals', async () => {
    render(<SalesReportWorkspace />)
    expect(await screen.findByText('Reporte de ventas cargado.')).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(3)
    expect(screen.getByRole('progressbar', { name: 'Comparación del valor de ventas de Punto de venta' })).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByRole('progressbar', { name: 'Comparación del valor de ventas de Mayoristas' })).toHaveAttribute('aria-valuenow', '72.5')
    expect(screen.getByRole('progressbar', { name: 'Comparación del valor de ventas de Eventos' })).toHaveAttribute('aria-valuenow', '0')
  })

  it('aggregates top products by quantity and line amount', () => {
    expect(rankSalesProducts(details)).toEqual([
      { productName: 'Mango', quantity: 5, totalMxn: 122.5 },
      { productName: 'Cacao', quantity: 1, totalMxn: 50 },
    ])
  })

  it('renders safe detail rows with channel context labels', async () => {
    render(<SalesReportWorkspace />)
    expect(await screen.findByRole('heading', { name: 'Detalle de ventas' })).toBeInTheDocument()
    expect(screen.getAllByText('sale-1')).toHaveLength(2)
    expect(screen.getAllByText('Tienda La Plaza')).toHaveLength(2)
    expect(screen.getAllByText('Mango')).toHaveLength(5)
  })

  it('keeps zero channels visible when the API omits them', async () => {
    vi.mocked(salesApi.getSalesByChannel).mockResolvedValue([{ channel: 'pos', saleCount: 0, totalMxn: 0 }])
    vi.mocked(salesApi.getSalesReportDetail).mockResolvedValue([])
    render(<SalesReportWorkspace />)
    expect(await screen.findByText('No se registraron ventas en este rango de fechas.')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Punto de venta', 'Mayoristas', 'Eventos'])
    expect(screen.getAllByText('$0.00 MXN')).toHaveLength(5)
    expect(screen.getByText('No hay detalle de ventas para el rango seleccionado.')).toBeInTheDocument()
  })

  it('validates the date order before loading another report', async () => {
    render(<SalesReportWorkspace />)
    await screen.findByText('Reporte de ventas cargado.')
    const calls = vi.mocked(salesApi.getSalesByChannel).mock.calls.length
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    selectDate('Fecha inicial', today)
    selectDate('Fecha final', yesterday)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar reporte' }))
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha inicial debe ser anterior o igual')
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(salesApi.getSalesByChannel).toHaveBeenCalledTimes(calls)
  })

  it('submits the selected date picker range to the report API', async () => {
    render(<SalesReportWorkspace />)
    await screen.findByText('Reporte de ventas cargado.')
    const start = new Date()
    start.setDate(start.getDate() - 2)
    const end = new Date()
    selectDate('Fecha inicial', start)
    selectDate('Fecha final', end)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar reporte' }))
    await screen.findByText('Reporte de ventas cargado.')

    const expectedEnd = new Date(`${dateInputValue(end)}T00:00:00.000Z`)
    expectedEnd.setUTCDate(expectedEnd.getUTCDate() + 1)
    expect(salesApi.getSalesByChannel).toHaveBeenLastCalledWith({
      from: `${dateInputValue(start)}T00:00:00.000Z`,
      to: expectedEnd.toISOString(),
    })
    expect(salesApi.getSalesReportDetail).toHaveBeenLastCalledWith({
      from: `${dateInputValue(start)}T00:00:00.000Z`,
      to: expectedEnd.toISOString(),
    })
  })

  it('announces loading while a report request is pending', async () => {
    let resolve!: (value: salesApi.SalesChannelTotal[]) => void
    vi.mocked(salesApi.getSalesByChannel).mockReturnValue(new Promise((done) => { resolve = done }))
    render(<SalesReportWorkspace />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando reporte de ventas')
    expect(screen.getByRole('button', { name: 'Cargando reporte…' })).toBeDisabled()
    resolve(totals)
    expect(await screen.findByText('Reporte de ventas cargado.')).toBeInTheDocument()
  })

  it('focuses a recoverable error and retries the same report', async () => {
    vi.mocked(salesApi.getSalesByChannel).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(totals)
    render(<SalesReportWorkspace />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('$172.50 MXN')).toBeInTheDocument()
    expect(salesApi.getSalesByChannel).toHaveBeenCalledTimes(2)
  })
})
