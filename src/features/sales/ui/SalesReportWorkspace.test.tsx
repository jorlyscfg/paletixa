import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as salesApi from '../api/sales'
import { DashboardWorkspace, SalesReportWorkspace } from './SalesReportWorkspace'
import { getDefaultReportDateRange, validateReportDateRange } from './salesReportUtils'

const configurationApi = vi.hoisted(() => ({ getTimezone: vi.fn() }))
vi.mock('../../configuration/api/configuration', () => ({
  getReportTimezoneConfiguration: configurationApi.getTimezone,
  isConfigurationUnauthorizedError: (error: unknown) => error instanceof Error && /access denied|unauthorized|forbidden/i.test(error.message),
}))

vi.mock('../api/sales', () => ({
  DEFAULT_REPORT_TIMEZONE: 'America/Cancun',
  REPORT_MAX_DAYS: 366,
  REPORT_TIMEZONE: 'America/Cancun',
  REPORT_TIMEZONES: ['America/Cancun', 'America/Mexico_City'],
  SALES_CHANNELS: ['pos', 'wholesale', 'event'],
  getReportDashboardAnalysis: vi.fn(),
  getReportDashboardSnapshot: vi.fn(),
  isReportUnauthorizedError: (error: unknown) => error instanceof Error && /access denied|unauthorized|forbidden/i.test(error.message),
}))

const posShiftApi = vi.hoisted(() => ({ getCurrent: vi.fn() }))
vi.mock('../api/posShifts', () => ({ getCurrentPosShift: posShiftApi.getCurrent }))

const snapshot: salesApi.ReportSnapshot = {
  from: '2026-08-27',
  to: '2026-08-28',
  timezone: 'America/Cancun',
  utcFrom: '2026-08-27T05:00:00.000Z',
  utcTo: '2026-08-29T05:00:00.000Z',
  scope: { kind: 'all', branchId: null, branchName: null, includesUnassigned: true },
  sales: {
    totalMxn: 172.5,
    count: 3,
    averageTicketMxn: 57.5,
    averageState: 'value',
    channels: [
      { channel: 'pos', saleCount: 2, totalMxn: 100 },
      { channel: 'wholesale', saleCount: 1, totalMxn: 72.5 },
      { channel: 'event', saleCount: 0, totalMxn: 0 },
    ],
    daily: [
      { date: '2026-08-27', saleCount: 2, totalMxn: 100 },
      { date: '2026-08-28', saleCount: 1, totalMxn: 72.5 },
    ],
    products: [
      { lineKind: 'product', productId: 'product-1', productName: 'Mango', categoryId: 'category-1', categoryName: 'Paletas', quantity: 5, totalMxn: 122.5 },
      { lineKind: 'product', productId: 'product-2', productName: 'Cacao', categoryId: 'category-1', categoryName: 'Paletas', quantity: 1, totalMxn: 50 },
      { lineKind: 'category', productId: null, productName: 'Paletas', categoryId: 'category-1', categoryName: 'Paletas', quantity: 1, totalMxn: 20 },
      { lineKind: 'product', productId: 'product-3', productName: 'Fresa', categoryId: 'category-2', categoryName: 'Nieves', quantity: 1, totalMxn: 10 },
      { lineKind: 'product', productId: 'product-4', productName: 'Limón', categoryId: 'category-2', categoryName: 'Nieves', quantity: 1, totalMxn: 9 },
      { lineKind: 'product', productId: 'product-5', productName: 'Vainilla', categoryId: 'category-2', categoryName: 'Nieves', quantity: 1, totalMxn: 8 },
    ],
  },
  operations: {
    wholesale: { scope: 'global', pendingCount: 2, processingCount: 1, workloadCount: 3 },
    event: { scope: 'global', pendingCount: 1, reservedCount: 2, allocatedCount: 2, capacityLimit: 7, availableCount: 12 },
    pos: { scope: 'all', openShiftCount: 1 },
  },
}

function emptySnapshot(): salesApi.ReportSnapshot {
  return {
    ...snapshot,
    sales: {
      ...snapshot.sales,
      totalMxn: 0,
      count: 0,
      averageTicketMxn: 0,
      averageState: 'no-data',
      channels: [],
      daily: [{ date: '2099-01-01', saleCount: 0, totalMxn: 0 }, { date: '2099-01-02', saleCount: 0, totalMxn: 0 }],
      products: [],
    },
  }
}

const analysis: salesApi.ReportAnalysisSnapshot = {
  products: [
    { lineKind: 'product', productId: 'product-1', productName: 'Mango', categoryId: 'category-1', categoryName: 'Paletas', quantity: 5, totalMxn: 122.5 },
    { lineKind: 'product', productId: 'product-2', productName: 'Cacao', categoryId: 'category-1', categoryName: 'Paletas', quantity: 0, totalMxn: 0 },
  ],
  categories: [
    { lineKind: 'category', productId: null, productName: 'Nieves', categoryId: 'category-2', categoryName: 'Nieves', quantity: 0, totalMxn: 0 },
    { lineKind: 'category', productId: null, productName: 'Paletas', categoryId: 'category-1', categoryName: 'Paletas', quantity: 6, totalMxn: 142.5 },
  ],
  employees: [
    { employeeId: 'employee-1', employeeName: 'Ana López', saleCount: 2, totalMxn: 100 },
    { employeeId: 'admin-1', employeeName: 'Admin', saleCount: 1, totalMxn: 72.5 },
  ],
}

function longDateValue(date: Date) {
  return date.toLocaleDateString('es-MX', { dateStyle: 'long' })
}

function selectDate(label: string, date: Date) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}:`) }))
  fireEvent.click(screen.getByRole('button', { name: longDateValue(date) }))
}

function getCalendarFilterLayout() {
  const form = screen.getByRole('form', { name: 'Filtros del reporte de ventas' })
  const startButton = screen.getByRole('button', { name: /^Fecha inicial:/ })
  const endButton = screen.getByRole('button', { name: /^Fecha final:/ })
  const calendarGrid = startButton.closest('div.grid')
  if (!calendarGrid?.parentElement) throw new Error('Calendar layout not found')
  return {
    formClass: form.className,
    filterGridClass: calendarGrid.parentElement.className,
    calendarGridClass: calendarGrid.className,
    startButtonClass: startButton.className,
    endButtonClass: endButton.className,
  }
}

describe('sales report workspace', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    configurationApi.getTimezone.mockResolvedValue({ timezone: 'America/Cancun', scope: 'global', ownerId: 'admin-1', state: 'compatibility-default', effectiveAt: null })
    vi.mocked(salesApi.getReportDashboardSnapshot).mockResolvedValue(snapshot)
    vi.mocked(salesApi.getReportDashboardAnalysis).mockResolvedValue(analysis)
    posShiftApi.getCurrent.mockResolvedValue(null)
  })

  it('renders unique server-authoritative report analysis and accessible catalog tabs without dashboard-removed UI', async () => {
    render(<SalesReportWorkspace />)

    expect(await screen.findByRole('heading', { name: 'Comparación por canal' })).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Reportes' })).not.toBeInTheDocument()
    expect(screen.queryByText('Reportes / análisis de ventas')).not.toBeInTheDocument()
    expect(screen.queryByText('Consulta el desempeño del catálogo, los canales y los empleados sin mezclar análisis con el control de caja.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Explicar el alcance del reporte de ventas' })).not.toBeInTheDocument()
    expect(screen.queryByText('Ventas reconocidas', { exact: true })).not.toBeInTheDocument()
    const filter = screen.getByRole('form', { name: 'Filtros del reporte de ventas' })
    expect(within(filter).queryByText('Ventana de análisis')).not.toBeInTheDocument()
    expect(within(filter).queryByText('Elige un rango de fechas')).not.toBeInTheDocument()
    expect(within(filter).queryByText('Hasta 366 días calendario, inclusivos. Los resultados se actualizan al enviar.')).not.toBeInTheDocument()
    expect(within(filter).queryByText('America/Cancun')).not.toBeInTheDocument()
    expect(within(filter).queryByText('Todas las sucursales')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actualizar reporte' })).not.toBeInTheDocument()
    expect(screen.queryByText('Reporte de ventas cargado.')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Periodo:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Zona horaria aplicada: America/Cancun')).not.toBeInTheDocument()
    expect(screen.queryByText('Alcance aplicado: Todas las sucursales · incluye ventas sin sucursal')).not.toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Rankings de productos y categorías' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Mango')
    expect(screen.queryByRole('heading', { name: 'Resumen de ventas reconocidas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tendencia diaria' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Indicadores operativos' })).not.toBeInTheDocument()
    expect(salesApi.getReportDashboardSnapshot).toHaveBeenCalledWith({ from: expect.any(String), to: expect.any(String), timezone: 'America/Cancun', scope: { kind: 'all' } })
    expect(salesApi.getReportDashboardAnalysis).toHaveBeenCalledWith({ from: expect.any(String), to: expect.any(String), timezone: 'America/Cancun', scope: { kind: 'all' } })
  })

  it('shares the compact two-column calendar filter layout between reports and dashboard', async () => {
    render(<SalesReportWorkspace />)
    await screen.findByRole('heading', { name: 'Comparación por canal' })
    const reportsLayout = getCalendarFilterLayout()

    cleanup()
    render(<DashboardWorkspace />)
    await screen.findByRole('heading', { name: 'Tendencia diaria' })

    expect(getCalendarFilterLayout()).toEqual(reportsLayout)
    expect(reportsLayout.filterGridClass).toContain('sm:grid-cols-2')
    expect(reportsLayout.calendarGridClass).toContain('grid-cols-2')
  })

  it('supports roving keyboard navigation across catalog ranking tabs', async () => {
    render(<SalesReportWorkspace />)
    await screen.findByRole('heading', { name: 'Comparación por canal' })

    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })

    expect(tabs[1]).toHaveFocus()
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Productos menos vendidos')
  })

  it('keeps every channel visible and renders an authorized no-data snapshot as empty content', async () => {
    vi.mocked(salesApi.getReportDashboardSnapshot).mockResolvedValue(emptySnapshot())
    vi.mocked(salesApi.getReportDashboardAnalysis).mockResolvedValue({ products: [], categories: [], employees: [] })
    render(<SalesReportWorkspace />)

    expect(await screen.findByText('No hay productos con ventas reconocidas en el periodo.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Punto de venta' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mayoristas' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Eventos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Análisis del catálogo' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ventas por empleado' })).toBeInTheDocument()
    expect(screen.getAllByText('No hay empleados con ventas reconocidas en el periodo.')).toHaveLength(2)
    expect(screen.queryByRole('heading', { name: 'Indicadores operativos' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('report-trend-chart')).not.toBeInTheDocument()
  })

  it('shows the admin context and explicit external-channel state without requesting a POS shift', async () => {
    render(<SalesReportWorkspace context={{ role: 'admin', userId: 'admin-1', displayName: 'Admin', capabilities: ['reports.view'], branch: null }} />)

    expect(await screen.findByRole('heading', { name: 'Operador y cuenta actual' })).toBeInTheDocument()
    expect(screen.getByText('Sin sucursal asignada y sin turno POS')).toBeInTheDocument()
    expect(screen.getByText(/Las ventas de canales externos/)).toBeInTheDocument()
    expect(posShiftApi.getCurrent).not.toHaveBeenCalled()
  })

  it('shows current cashier shift metrics and reconciled differences', async () => {
    posShiftApi.getCurrent.mockResolvedValue({
      id: 'shift-1', cashierId: 'employee-1', branchId: 'branch-1', branchName: 'Centro', status: 'closed',
      openingCashMxn: 500, usdMxnRate: 17.25, openedAt: '2026-08-21T10:00:00Z', closedAt: '2026-08-21T18:00:00Z',
      cashSalesMxn: 100, cashSalesUsd: 20, cardSalesMxn: 250, closingCashMxn: 590, closingCashUsd: 20, closingCardMxn: 250,
      cashMxnDifference: -10, cashUsdDifference: 0, cardDifference: 0,
    })
    render(<SalesReportWorkspace context={{ role: 'cashier', userId: 'employee-1', displayName: 'Ana López', capabilities: ['reports.view', 'pos.use'], branch: { id: 'branch-1', name: 'Centro' } }} />)

    expect(await screen.findByText('Reconciliado / cerrado')).toBeInTheDocument()
    expect(screen.getByText('$600.00 MXN')).toBeInTheDocument()
    expect(screen.getByText('Diferencia efectivo MXN')).toBeInTheDocument()
    expect(posShiftApi.getCurrent).toHaveBeenCalledOnce()
  })

  it('shows the daily trend and operational indicators on the first-class dashboard', async () => {
    render(<DashboardWorkspace />)

    expect(await screen.findByRole('heading', { name: 'Tendencia diaria' })).toBeInTheDocument()
    const filter = screen.getByRole('form', { name: 'Filtros del reporte de ventas' })
    expect(screen.queryByText('Dashboard / visión operativa')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByText('Observa la tendencia diaria y la carga operativa sin mezclar estados de trabajo con ingresos.')).not.toBeInTheDocument()
    expect(within(filter).queryByText('Ventana de análisis')).not.toBeInTheDocument()
    expect(within(filter).queryByText('Elige un rango de fechas')).not.toBeInTheDocument()
    expect(within(filter).queryByText('Hasta 366 días calendario, inclusivos. Los resultados se actualizan al enviar.')).not.toBeInTheDocument()
    expect(within(filter).queryByText('America/Cancun')).not.toBeInTheDocument()
    expect(within(filter).queryByText('Todas las sucursales')).not.toBeInTheDocument()
    expect(screen.queryByText('Ventas reconocidas', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText('MXN', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actualizar reporte' })).not.toBeInTheDocument()
    expect(screen.queryByText('Reporte de ventas cargado.')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Periodo:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Zona horaria aplicada: America/Cancun')).not.toBeInTheDocument()
    expect(screen.queryByText('Alcance aplicado: Todas las sucursales · incluye ventas sin sucursal')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Fecha inicial:/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Fecha final:/ })).toBeVisible()
    const calendarGrid = screen.getByRole('button', { name: /^Fecha inicial:/ }).closest('div.grid')
    expect(calendarGrid).not.toBeNull()
    expect(calendarGrid).toHaveClass('min-w-0', 'grid-cols-2')
    expect(screen.getByRole('heading', { name: 'Tendencia diaria' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Indicadores operativos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /27-ago: 2 ventas reconocidas\. Total: \$100\.00\./ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Carga mayorista' }).closest('article')).toHaveTextContent('3')
    expect(salesApi.getReportDashboardSnapshot).toHaveBeenCalledWith({
      ...getDefaultReportDateRange('America/Cancun', new Date(), 'dashboard'),
      timezone: 'America/Cancun',
      scope: { kind: 'all' },
    })
  })

  it('keeps the trend explanation in an adjacent accessible tooltip with the configured timezone', async () => {
    render(<DashboardWorkspace />)
    await screen.findByRole('heading', { name: 'Tendencia diaria' })

    const heading = screen.getByRole('heading', { name: 'Tendencia diaria' })
    const info = screen.getByRole('button', { name: 'Explicar la tendencia diaria en America/Cancun' })
    expect(heading.parentElement).not.toHaveTextContent('Ventas reconocidas agrupadas por fecha local')
    fireEvent.click(info)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ventas reconocidas agrupadas por fecha local en America/Cancun; los días sin ventas permanecen visibles.')
  })

  it('uses the selected Mexico City timezone for the request and tooltip', async () => {
    configurationApi.getTimezone.mockResolvedValueOnce({ timezone: 'America/Mexico_City', scope: 'global', ownerId: 'admin-1', state: 'configured', effectiveAt: '2026-08-29T12:00:00.000Z' })
    vi.mocked(salesApi.getReportDashboardSnapshot).mockResolvedValueOnce({ ...snapshot, timezone: 'America/Mexico_City', utcFrom: '2026-08-27T06:00:00.000Z', utcTo: '2026-08-29T06:00:00.000Z' })
    render(<DashboardWorkspace />)
    await screen.findByRole('heading', { name: 'Tendencia diaria' })

    expect(salesApi.getReportDashboardSnapshot).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'America/Mexico_City' }))
    fireEvent.click(screen.getByRole('button', { name: 'Explicar la tendencia diaria en America/Mexico_City' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ventas reconocidas agrupadas por fecha local en America/Mexico_City; los días sin ventas permanecen visibles.')
  })

  it('does not request a report before timezone bootstrap completes', async () => {
    let resolveTimezone!: (value: { timezone: 'America/Cancun'; scope: 'global'; ownerId: string; state: 'compatibility-default'; effectiveAt: null }) => void
    configurationApi.getTimezone.mockReturnValueOnce(new Promise((resolve) => { resolveTimezone = resolve }))
    render(<DashboardWorkspace />)

    expect(salesApi.getReportDashboardSnapshot).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Cargando configuración de zona horaria')
    resolveTimezone({ timezone: 'America/Cancun', scope: 'global', ownerId: 'admin-1', state: 'compatibility-default', effectiveAt: null })
    expect(await screen.findByRole('heading', { name: 'Tendencia diaria' })).toBeInTheDocument()
    expect(salesApi.getReportDashboardSnapshot).toHaveBeenCalledOnce()
  })

  it('shows a recoverable state when timezone bootstrap fails without querying a report', async () => {
    configurationApi.getTimezone.mockRejectedValueOnce(new Error('offline'))
    render(<DashboardWorkspace />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la zona horaria de reportes')
    expect(screen.getByRole('button', { name: 'Reintentar configuración' })).toBeInTheDocument()
    expect(salesApi.getReportDashboardSnapshot).not.toHaveBeenCalled()
  })

  it('refreshes the dashboard snapshot after a valid calendar change', async () => {
    render(<DashboardWorkspace />)
    await screen.findByRole('heading', { name: 'Tendencia diaria' })

    const start = new Date()
    start.setDate(start.getDate() - 2)
    selectDate('Fecha inicial', start)

    const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const defaultRange = getDefaultReportDateRange('America/Cancun', new Date(), 'dashboard')
    await waitFor(() => expect(salesApi.getReportDashboardSnapshot).toHaveBeenLastCalledWith({
      from: dateValue(start),
      to: defaultRange.to,
      timezone: 'America/Cancun',
      scope: { kind: 'all' },
    }))
  })

  it('refreshes reports on valid calendar changes with the explicit timezone and requested scope', async () => {
    render(<SalesReportWorkspace initialScope={{ kind: 'branch', branchId: 'branch-1' }} />)
    await screen.findByRole('heading', { name: 'Comparación por canal' })
    const start = new Date()
    start.setDate(start.getDate() - 2)
    const end = new Date()
    selectDate('Fecha inicial', start)
    await waitFor(() => expect(screen.getByRole('button', { name: /^Fecha inicial:/ })).not.toBeDisabled())
    selectDate('Fecha final', end)

    const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    await waitFor(() => {
      expect(salesApi.getReportDashboardSnapshot).toHaveBeenLastCalledWith({
        from: dateValue(start),
        to: dateValue(end),
        timezone: 'America/Cancun',
        scope: { kind: 'branch', branchId: 'branch-1' },
      })
      expect(salesApi.getReportDashboardAnalysis).toHaveBeenLastCalledWith({
        from: dateValue(start),
        to: dateValue(end),
        timezone: 'America/Cancun',
        scope: { kind: 'branch', branchId: 'branch-1' },
      })
    })
  })

  it('accepts exactly 366 inclusive days and rejects the 367th day', () => {
    expect(validateReportDateRange({ from: '2024-01-01', to: '2024-12-31' })).toBe('')
    expect(validateReportDateRange({ from: '2026-01-01', to: '2027-01-02' })).toContain('366 días')
  })

  it('validates invalid input without replacing the last valid snapshot', async () => {
    render(<SalesReportWorkspace />)
    await screen.findByRole('heading', { name: 'Comparación por canal' })
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    selectDate('Fecha final', yesterday)
    await waitFor(() => expect(salesApi.getReportDashboardSnapshot).toHaveBeenCalledTimes(2))
    const calls = vi.mocked(salesApi.getReportDashboardSnapshot).mock.calls.length
    const analysisCalls = vi.mocked(salesApi.getReportDashboardAnalysis).mock.calls.length
    selectDate('Fecha inicial', today)

    expect(screen.getByRole('alert')).toHaveTextContent('La fecha inicial debe ser anterior o igual')
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Comparación por canal' })).toBeInTheDocument()
    expect(salesApi.getReportDashboardSnapshot).toHaveBeenCalledTimes(calls)
    expect(salesApi.getReportDashboardAnalysis).toHaveBeenCalledTimes(analysisCalls)
  })

  it('disables both calendars while the snapshot is pending without report-only status UI', async () => {
    let resolve!: (value: salesApi.ReportSnapshot) => void
    vi.mocked(salesApi.getReportDashboardSnapshot).mockReturnValue(new Promise((done) => { resolve = done }))
    render(<SalesReportWorkspace />)

    await waitFor(() => expect(salesApi.getReportDashboardSnapshot).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: /^Fecha inicial:/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Fecha final:/ })).toBeDisabled()
    expect(screen.queryByText('Cargando reporte de ventas…')).not.toBeInTheDocument()
    resolve(snapshot)
    expect(await screen.findByRole('heading', { name: 'Comparación por canal' })).toBeInTheDocument()
  })

  it('preserves the last valid snapshot through a retryable error and retries that range', async () => {
    vi.mocked(salesApi.getReportDashboardSnapshot)
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(snapshot)
    render(<SalesReportWorkspace />)
    await screen.findByRole('heading', { name: 'Comparación por canal' })

    const start = new Date()
    start.setDate(start.getDate() - 2)
    selectDate('Fecha inicial', start)
    expect(await screen.findByRole('alert')).toHaveTextContent('Se conservan los últimos resultados válidos.')
    expect(screen.getByRole('heading', { name: 'Comparación por canal' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(salesApi.getReportDashboardSnapshot).toHaveBeenCalledTimes(3))
    expect(screen.getByRole('heading', { name: 'Comparación por canal' })).toBeInTheDocument()
    expect(salesApi.getReportDashboardSnapshot).toHaveBeenCalledTimes(3)
  })

  it('shows an unauthorized state without protected data', async () => {
    vi.mocked(salesApi.getReportDashboardSnapshot).mockRejectedValue(new Error('access denied'))
    render(<SalesReportWorkspace />)

    expect(await screen.findByText('Reporte no disponible para este acceso.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes autorización')
    expect(screen.queryByText('$173', { exact: true })).not.toBeInTheDocument()
  })
})
