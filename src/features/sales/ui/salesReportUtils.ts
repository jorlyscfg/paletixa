import { DEFAULT_REPORT_TIMEZONE, REPORT_MAX_DAYS, REPORT_TIMEZONES, SALES_CHANNELS, type ReportEmployeeAggregate, type ReportProductAggregate, type ReportScope, type ReportTimezone, type SalesChannelTotal, type SalesReportDetail } from '../api/sales'

const DAY_MS = 24 * 60 * 60 * 1000
const REPORT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export type ReportDateFields = { from: string; to: string }
export type ReportDateRangeMode = 'reports' | 'dashboard'

export type SalesProductRanking = {
  productName: string
  quantity: number
  totalMxn: number
}

export function parseReportDate(value: string) {
  const match = REPORT_DATE_PATTERN.exec(value)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
    ? date.getTime()
    : null
}

function reportDateValue(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function localDateParts(value: Date, timezone: ReportTimezone) {
  if (!REPORT_TIMEZONES.includes(timezone)) throw new Error('Reporting timezone is invalid')
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) throw new Error('Unable to determine the report date')
  return { year, month, day }
}

export function getDefaultReportDateRange(timezone: ReportTimezone = DEFAULT_REPORT_TIMEZONE, now = new Date(), mode: ReportDateRangeMode = 'reports'): ReportDateFields {
  const today = localDateParts(now, timezone)
  const to = reportDateValue(today.year, today.month, today.day)
  if (mode === 'dashboard' || mode === 'reports') return { from: reportDateValue(today.year, today.month, 1), to }
  const start = parseReportDate(to)
  if (start === null) throw new Error('Unable to determine the report date')
  const from = new Date(start - 6 * DAY_MS)
  return { from: reportDateValue(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate()), to }
}

export function inclusiveReportDays({ from, to }: ReportDateFields) {
  const start = parseReportDate(from)
  const end = parseReportDate(to)
  if (start === null || end === null || end < start) return null
  return Math.floor((end - start) / DAY_MS) + 1
}

export function validateReportDateRange(fields: ReportDateFields) {
  if (!fields.from || !fields.to) return 'Selecciona una fecha inicial y una fecha final.'
  const start = parseReportDate(fields.from)
  const end = parseReportDate(fields.to)
  if (start === null || end === null) return 'Ingresa fechas inicial y final válidas.'
  if (end < start) return 'La fecha inicial debe ser anterior o igual a la fecha final.'
  if (inclusiveReportDays(fields)! > REPORT_MAX_DAYS) return 'Selecciona un rango de 366 días o menos.'
  return ''
}

export function normalizeReportChannels(rows: readonly SalesChannelTotal[]) {
  return SALES_CHANNELS.map((channel) => rows.find((row) => row.channel === channel) ?? { channel, saleCount: 0, totalMxn: 0 })
}

export function rankReportProducts(rows: readonly ReportProductAggregate[], limit = 5) {
  return [...rows]
    .sort((left, right) => right.quantity - left.quantity || right.totalMxn - left.totalMxn || left.productName.localeCompare(right.productName, 'es-MX') || left.lineKind.localeCompare(right.lineKind))
    .slice(0, limit)
}

export function rankReportAggregates(rows: readonly ReportProductAggregate[], lineKind: ReportProductAggregate['lineKind'], direction: 'asc' | 'desc', limit?: number) {
  const ranked = rows
    .filter((row) => row.lineKind === lineKind)
    .sort((left, right) => {
      const quantity = direction === 'asc' ? left.quantity - right.quantity : right.quantity - left.quantity
      return quantity || (direction === 'asc' ? left.totalMxn - right.totalMxn : right.totalMxn - left.totalMxn) || left.productName.localeCompare(right.productName, 'es-MX') || (left.productId ?? left.categoryId ?? '').localeCompare(right.productId ?? right.categoryId ?? '')
    })
  return limit === undefined ? ranked : ranked.slice(0, limit)
}

export function rankReportEmployees(rows: readonly ReportEmployeeAggregate[], direction: 'asc' | 'desc', limit?: number) {
  const ranked = [...rows].sort((left, right) => {
    const saleCount = direction === 'asc' ? left.saleCount - right.saleCount : right.saleCount - left.saleCount
    return saleCount || (direction === 'asc' ? left.totalMxn - right.totalMxn : right.totalMxn - left.totalMxn) || left.employeeName.localeCompare(right.employeeName, 'es-MX') || left.employeeId.localeCompare(right.employeeId)
  })
  return limit === undefined ? ranked : ranked.slice(0, limit)
}

export function reportScopeLabel(scope: ReportScope) {
  if (scope.kind === 'branch') return scope.branchName ? `Sucursal: ${scope.branchName}` : 'Sucursal seleccionada'
  return scope.includesUnassigned ? 'Todas las sucursales · incluye ventas sin sucursal' : 'Todas las sucursales'
}

export function rankSalesProducts(rows: SalesReportDetail[], limit = 5): SalesProductRanking[] {
  const products = new Map<string, SalesProductRanking>()
  for (const row of rows) {
    const current = products.get(row.productName) ?? { productName: row.productName, quantity: 0, totalMxn: 0 }
    current.quantity += row.quantity
    current.totalMxn += row.lineTotalMxn
    products.set(row.productName, current)
  }
  return [...products.values()]
    .sort((left, right) => right.quantity - left.quantity || right.totalMxn - left.totalMxn || left.productName.localeCompare(right.productName, 'es-MX'))
    .slice(0, limit)
}
