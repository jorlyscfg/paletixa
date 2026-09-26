import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { DEFAULT_REPORT_TIMEZONE, getReportDashboardAnalysis, getReportDashboardSnapshot, isReportUnauthorizedError, mapReportDashboardAnalysis, mapReportDashboardSnapshot, REPORT_TIMEZONE } from './sales'

const dashboardRow = {
  from: '2026-08-27',
  to: '2026-08-28',
  timezone: REPORT_TIMEZONE,
  utc_from: '2026-08-27T05:00:00.000Z',
  utc_to: '2026-08-29T05:00:00.000Z',
  scope: { kind: 'all', branch_id: null, branch_name: null, includes_unassigned: true },
  sales: {
    total_mxn: '172.50',
    count: '3',
    average_ticket_mxn: '57.50',
    average_state: 'value',
    channels: [
      { channel: 'pos', sale_count: '2', total_mxn: '100.00' },
      { channel: 'wholesale', sale_count: 1, total_mxn: '72.50' },
      { channel: 'event', sale_count: 0, total_mxn: '0.00' },
    ],
    daily: [
      { date: '2026-08-27', sale_count: '2', total_mxn: '100.00' },
      { date: '2026-08-28', sale_count: 1, total_mxn: '72.50' },
    ],
    products: [{ line_kind: 'product', product_id: 'product-1', product_name: 'Mango', category_id: 'category-1', category_name: 'Paletas', quantity: '5', total_mxn: '122.50' }],
  },
  operations: {
    wholesale: { scope: 'global', pending_count: '2', processing_count: 1, workload_count: 3 },
    event: { scope: 'global', pending_count: 1, reserved_count: '2', allocated_count: 2, capacity_limit: 7, available_count: 12 },
    pos: { scope: 'all', open_shift_count: '1' },
  },
}

describe('report dashboard API adapter', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps the complete typed snapshot and sends explicit timezone and scope', async () => {
    sdk.database.rpc.mockResolvedValue({ data: dashboardRow, error: null })

    await expect(getReportDashboardSnapshot({ from: '2026-08-27', to: '2026-08-28', timezone: DEFAULT_REPORT_TIMEZONE, scope: { kind: 'all' } })).resolves.toEqual({
      from: '2026-08-27',
      to: '2026-08-28',
      timezone: REPORT_TIMEZONE,
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
        products: [{ lineKind: 'product', productId: 'product-1', productName: 'Mango', categoryId: 'category-1', categoryName: 'Paletas', quantity: 5, totalMxn: 122.5 }],
      },
      operations: {
        wholesale: { scope: 'global', pendingCount: 2, processingCount: 1, workloadCount: 3 },
        event: { scope: 'global', pendingCount: 1, reservedCount: 2, allocatedCount: 2, capacityLimit: 7, availableCount: 12 },
        pos: { scope: 'all', openShiftCount: 1 },
      },
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('report_dashboard_snapshot', {
      p_from: '2026-08-27',
      p_to: '2026-08-28',
      p_timezone: REPORT_TIMEZONE,
      p_scope: 'all',
      p_branch_id: null,
    })
  })

  it('sends a selected branch without changing the typed response mapping', async () => {
    sdk.database.rpc.mockResolvedValue({ data: { ...dashboardRow, scope: { kind: 'branch', branch_id: 'branch-1', branch_name: 'Centro', includes_unassigned: false } }, error: null })

    await expect(getReportDashboardSnapshot({ from: '2026-08-27', to: '2026-08-28', timezone: REPORT_TIMEZONE, scope: { kind: 'branch', branchId: 'branch-1' } })).resolves.toMatchObject({ scope: { kind: 'branch', branchId: 'branch-1', branchName: 'Centro', includesUnassigned: false } })
    expect(sdk.database.rpc).toHaveBeenCalledWith('report_dashboard_snapshot', expect.objectContaining({ p_scope: 'branch', p_branch_id: 'branch-1' }))
  })

  it('accepts Mexico City as a whitelisted timezone and maps the server response dynamically', async () => {
    sdk.database.rpc.mockResolvedValue({ data: { ...dashboardRow, timezone: 'America/Mexico_City', utc_from: '2026-08-27T06:00:00.000Z', utc_to: '2026-08-29T06:00:00.000Z' }, error: null })

    await expect(getReportDashboardSnapshot({ from: '2026-08-27', to: '2026-08-28', timezone: 'America/Mexico_City' })).resolves.toMatchObject({ timezone: 'America/Mexico_City', utcFrom: '2026-08-27T06:00:00.000Z' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('report_dashboard_snapshot', expect.objectContaining({ p_timezone: 'America/Mexico_City' }))
  })

  it('accepts exactly 366 inclusive calendar days and rejects 367 before the RPC', async () => {
    sdk.database.rpc.mockResolvedValue({ data: dashboardRow, error: null })

    await expect(getReportDashboardSnapshot({ from: '2024-01-01', to: '2024-12-31', timezone: REPORT_TIMEZONE })).resolves.toBeDefined()
    await expect(getReportDashboardSnapshot({ from: '2026-01-01', to: '2027-01-02', timezone: REPORT_TIMEZONE })).rejects.toThrow('limited to 366 calendar days')
    expect(sdk.database.rpc).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed dates, reversed ranges, and unsupported timezones locally', async () => {
    await expect(getReportDashboardSnapshot({ from: '2026-02-30', to: '2026-03-01', timezone: REPORT_TIMEZONE })).rejects.toThrow('invalid')
    await expect(getReportDashboardSnapshot({ from: '2026-03-02', to: '2026-03-01', timezone: REPORT_TIMEZONE })).rejects.toThrow('invalid')
    await expect(getReportDashboardSnapshot({ from: '2026-03-01', to: '2026-03-01', timezone: 'UTC' as typeof REPORT_TIMEZONE })).rejects.toThrow('timezone')
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('maps no-data snapshots without inventing an average value', () => {
    const mapped = mapReportDashboardSnapshot({
      ...dashboardRow,
      sales: { ...dashboardRow.sales, total_mxn: 0, count: 0, average_ticket_mxn: 0, average_state: 'no-data', channels: [], daily: [], products: [] },
    })
    expect(mapped.sales).toMatchObject({ totalMxn: 0, count: 0, averageTicketMxn: 0, averageState: 'no-data', channels: [], daily: [], products: [] })
  })

  it('maps complete catalog and employee analysis without client-side detail aggregation', async () => {
    sdk.database.rpc.mockResolvedValue({ data: {
      products: [{ line_kind: 'product', product_id: 'product-1', product_name: 'Mango', category_id: 'category-1', category_name: 'Paletas', quantity: '0', total_mxn: '0' }],
      categories: [{ line_kind: 'category', product_id: null, product_name: 'Paletas', category_id: 'category-1', category_name: 'Paletas', quantity: '4', total_mxn: '40' }],
      employees: [{ employee_id: 'admin-1', employee_name: 'Admin', sale_count: '2', total_mxn: '40' }],
    }, error: null })

    await expect(getReportDashboardAnalysis({ from: '2026-08-27', to: '2026-08-28', timezone: REPORT_TIMEZONE, scope: { kind: 'all' } })).resolves.toEqual({
      products: [{ lineKind: 'product', productId: 'product-1', productName: 'Mango', categoryId: 'category-1', categoryName: 'Paletas', quantity: 0, totalMxn: 0 }],
      categories: [{ lineKind: 'category', productId: null, productName: 'Paletas', categoryId: 'category-1', categoryName: 'Paletas', quantity: 4, totalMxn: 40 }],
      employees: [{ employeeId: 'admin-1', employeeName: 'Admin', saleCount: 2, totalMxn: 40 }],
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('report_dashboard_analysis', {
      p_from: '2026-08-27', p_to: '2026-08-28', p_timezone: REPORT_TIMEZONE, p_scope: 'all', p_branch_id: null,
    })
  })

  it('uses a safe fallback when an employee display name is absent', () => {
    expect(mapReportDashboardAnalysis({ products: [], categories: [], employees: [{ employee_id: 'employee-1', employee_name: null, sale_count: 1, total_mxn: 10 }] })).toMatchObject({ employees: [{ employeeId: 'employee-1', employeeName: 'Empleado sin nombre' }] })
  })

  it('recognizes authorization failures without classifying ordinary errors', () => {
    expect(isReportUnauthorizedError(new Error('access denied'))).toBe(true)
    expect(isReportUnauthorizedError({ statusCode: 403, message: 'forbidden' })).toBe(true)
    expect(isReportUnauthorizedError(new Error('network offline'))).toBe(false)
  })
})
