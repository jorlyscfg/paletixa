import { describe, expect, it } from 'vitest'
import { getDefaultReportDateRange, rankReportAggregates, rankReportEmployees } from './salesReportUtils'

describe('sales report date defaults', () => {
  it('uses the first day through today for the dashboard in Cancun time', () => {
    expect(getDefaultReportDateRange('America/Cancun', new Date('2026-08-29T04:30:00.000Z'), 'dashboard')).toEqual({ from: '2026-08-01', to: '2026-08-28' })
  })

  it('uses the configured timezone rather than browser-local time near midnight', () => {
    const now = new Date('2026-08-01T05:30:00.000Z')
    expect(getDefaultReportDateRange('America/Cancun', now, 'dashboard')).toEqual({ from: '2026-08-01', to: '2026-08-01' })
    expect(getDefaultReportDateRange('America/Mexico_City', now, 'dashboard')).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })

  it('uses the same month-to-date default for Reports as the Dashboard', () => {
    expect(getDefaultReportDateRange('America/Cancun', new Date('2026-08-29T12:00:00.000Z'), 'reports')).toEqual({ from: '2026-08-01', to: '2026-08-29' })
  })
})

describe('sales report rankings', () => {
  it('sorts catalog aggregates by quantity and amount without mutating the source', () => {
    const rows = [
      { lineKind: 'product' as const, productId: 'product-b', productName: 'B', categoryId: null, categoryName: null, quantity: 0, totalMxn: 40 },
      { lineKind: 'product' as const, productId: 'product-a', productName: 'A', categoryId: null, categoryName: null, quantity: 0, totalMxn: 10 },
      { lineKind: 'product' as const, productId: 'product-c', productName: 'C', categoryId: null, categoryName: null, quantity: 3, totalMxn: 30 },
      { lineKind: 'category' as const, productId: null, productName: 'Category', categoryId: 'category-1', categoryName: 'Category', quantity: 99, totalMxn: 99 },
    ]

    expect(rankReportAggregates(rows, 'product', 'asc')).toEqual([rows[1], rows[0], rows[2]])
    expect(rankReportAggregates(rows, 'product', 'desc', 1)).toEqual([rows[2]])
    expect(rows.map((row) => row.productName)).toEqual(['B', 'A', 'C', 'Category'])
  })

  it('ranks employees by sale count, then amount, then stable identity', () => {
    const rows = [
      { employeeId: 'employee-b', employeeName: 'B', saleCount: 2, totalMxn: 40 },
      { employeeId: 'employee-a', employeeName: 'A', saleCount: 2, totalMxn: 40 },
      { employeeId: 'employee-c', employeeName: 'C', saleCount: 0, totalMxn: 0 },
    ]

    expect(rankReportEmployees(rows, 'desc')).toEqual([rows[1], rows[0], rows[2]])
    expect(rankReportEmployees(rows, 'asc', 1)).toEqual([rows[2]])
  })
})
