import { insforge } from '../../../lib/insforge'
import { DEFAULT_REPORT_TIMEZONE, REPORT_TIMEZONES, validateReportTimezone, type ReportTimezone } from '../../configuration/api/configuration'

export { DEFAULT_REPORT_TIMEZONE, REPORT_TIMEZONES }
export type { ReportTimezone }

export const SALES_CHANNELS = ['pos', 'wholesale', 'event'] as const
export type SalesChannel = typeof SALES_CHANNELS[number]

export const POS_PAYMENT_METHODS = ['cash', 'card'] as const
export type PosPaymentMethod = typeof POS_PAYMENT_METHODS[number]
export const POS_PAYMENT_CURRENCIES = ['mxn', 'usd'] as const
export type PosPaymentCurrency = typeof POS_PAYMENT_CURRENCIES[number]

export const WHOLESALE_DELIVERY_METHODS = ['delivery', 'pickup'] as const
export type WholesaleDeliveryMethod = typeof WHOLESALE_DELIVERY_METHODS[number]

export const WHOLESALE_PAYMENT_METHODS = ['credit', 'cash', 'transfer'] as const
export type WholesalePaymentMethod = typeof WHOLESALE_PAYMENT_METHODS[number]

export type ProductSaleItemInput = {
  lineKind?: 'product'
  productId: string
  quantity: number
}

export type CategorySaleItemInput = {
  lineKind: 'category'
  categoryId: string
  quantity: number
}

export type SaleItemInput = ProductSaleItemInput | CategorySaleItemInput

export type PosSaleDetails = {
  channel: 'pos'
  customerName?: string
  paymentMethod: PosPaymentMethod
  paymentCurrency?: PosPaymentCurrency
  usdMxnRate?: number
  usdPaid?: number
  receivedAmountMxn?: number
}

export type WholesaleSaleDetails = {
  channel: 'wholesale'
  customerName: string
  phone: string
  deliveryMethod: WholesaleDeliveryMethod
  paymentMethod: WholesalePaymentMethod
}

export type EventSaleDetails = {
  channel: 'event'
}

export type SaleDetails = PosSaleDetails | WholesaleSaleDetails | EventSaleDetails

export type RecordSaleInput = {
  requestId: string
  channel: SalesChannel
  details: SaleDetails
  items: SaleItemInput[]
}

export type SaleReceipt = {
  id: string
  channel: SalesChannel
  totalMxn: number
  createdAt: string
  replayed: boolean
  cashierName?: string | null
  branchId?: string | null
  branchName?: string | null
  shiftId?: string | null
  customerName?: string | null
  paymentMethod?: PosPaymentMethod | null
  paymentCurrency?: PosPaymentCurrency | null
  usdMxnRate?: number | null
  usdEquivalent?: number | null
  usdPaid?: number | null
  receivedMxn?: number | null
  changeMxn?: number | null
  items?: SaleReceiptLine[]
}

export type SaleReceiptLine = {
  lineKind: 'product' | 'category'
  productId: string | null
  categoryId: string | null
  categoryName: string | null
  name: string
  quantity: number
  unitPriceMxn: number
  lineTotalMxn: number
}

export type SalesChannelTotal = {
  channel: SalesChannel
  saleCount: number
  totalMxn: number
}

// Kept as a compatibility alias for existing report consumers; the configured
// value is loaded through getReportTimezoneConfiguration before each request.
export const REPORT_TIMEZONE = DEFAULT_REPORT_TIMEZONE
export const REPORT_MAX_DAYS = 366

export type ReportScopeSelection =
  | { kind: 'all'; branchId?: null }
  | { kind: 'branch'; branchId: string }

export type ReportScope = {
  kind: 'all' | 'branch'
  branchId: string | null
  branchName: string | null
  includesUnassigned: boolean
}

export type ReportDailyPoint = {
  date: string
  saleCount: number
  totalMxn: number
}

export type ReportProductAggregate = {
  lineKind: 'product' | 'category'
  productId: string | null
  productName: string
  categoryId: string | null
  categoryName: string | null
  quantity: number
  totalMxn: number
}

export type ReportEmployeeAggregate = {
  employeeId: string
  employeeName: string
  saleCount: number
  totalMxn: number
}

export type ReportAnalysisSnapshot = {
  products: ReportProductAggregate[]
  categories: ReportProductAggregate[]
  employees: ReportEmployeeAggregate[]
}

export type ReportSalesSnapshot = {
  totalMxn: number
  count: number
  averageTicketMxn: number
  averageState: 'value' | 'no-data'
  channels: SalesChannelTotal[]
  daily: ReportDailyPoint[]
  products: ReportProductAggregate[]
}

export type ReportOperationsSnapshot = {
  wholesale: {
    scope: 'global'
    pendingCount: number
    processingCount: number
    workloadCount: number
  }
  event: {
    scope: 'global'
    pendingCount: number
    reservedCount: number
    allocatedCount: number
    capacityLimit: number
    availableCount: number
  }
  pos: {
    scope: 'all' | 'branch'
    openShiftCount: number
  }
}

export type ReportSnapshot = {
  from: string
  to: string
  timezone: ReportTimezone
  utcFrom: string
  utcTo: string
  scope: ReportScope
  sales: ReportSalesSnapshot
  operations: ReportOperationsSnapshot
}

export type ReportDashboardRange = {
  from: string
  to: string
  timezone?: ReportTimezone
  scope?: ReportScopeSelection
}

export type ReportDashboardSnapshot = ReportSnapshot

export type SalesReportDetail = {
  saleId: string
  saleDate: string
  channel: SalesChannel
  totalMxn: number
  productName: string
  quantity: number
  lineTotalMxn: number
  contextLabel: string | null
  lineKind?: 'product' | 'category'
  categoryId?: string | null
  categoryName?: string | null
  eventDate?: string | null
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  initialPaymentAmount?: number | null
  initialPaymentMethod?: string | null
  finalPaymentAmount?: number | null
  finalPaymentMethod?: string | null
  reservationStatus?: string | null
}

export type SalesReportRange = {
  from: string
  to: string
}

type SaleReceiptRow = {
  sale_id: string
  channel: SalesChannel
  total_mxn: number | string
  created_at: string
  result_status: 'created' | 'replayed'
  cashier_name?: string | null
  branch_id?: string | null
  branch_name?: string | null
  shift_id?: string | null
  customer_name?: string | null
  payment_method?: string | null
  payment_currency?: string | null
  usd_mxn_rate?: number | string | null
  usd_equivalent?: number | string | null
  usd_paid?: number | string | null
  received_mxn?: number | string | null
  change_mxn?: number | string | null
  items?: unknown
}

type SalesChannelTotalRow = {
  channel: SalesChannel
  sale_count: number | string
  total_mxn: number | string
}

type SalesReportDetailRow = {
  sale_id: string
  sale_date: string
  channel: SalesChannel
  total_mxn: number | string
  product_name: string
  quantity: number | string
  line_total_mxn: number | string
  context_label: string | null
  line_kind?: 'product' | 'category'
  category_id?: string | null
  category_name?: string | null
  event_date?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  initial_payment_amount?: number | string | null
  initial_payment_method?: string | null
  final_payment_amount?: number | string | null
  final_payment_method?: string | null
  reservation_status?: string | null
}

type ReportDashboardRow = Record<string, unknown>

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`)
  return value.trim()
}

function channel(value: unknown): SalesChannel {
  if (typeof value !== 'string' || !SALES_CHANNELS.includes(value as SalesChannel)) {
    throw new Error('Sales channel is invalid')
  }
  return value as SalesChannel
}

function knownFields(value: unknown, allowed: readonly string[]) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Sale details must be an object')
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) throw new Error('Sale details contain unknown fields')
}

function requiredText(value: unknown, field: string, maxLength = 160) {
  const normalized = text(value, field)
  if (normalized.length > maxLength) throw new Error(`${field} is too long`)
  return normalized
}

function optionalText(value: unknown, field: string, maxLength = 160) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const normalized = value.trim()
  if (normalized === '') return undefined
  if (normalized.length > maxLength) throw new Error(`${field} is too long`)
  return normalized
}

function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`${field} is invalid`)
  return value as T
}

function optionalMoney(value: unknown, field: string, positive = false) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive ? value <= 0 : value < 0)) throw new Error(`${field} must be ${positive ? 'positive' : 'non-negative'}`)
  return Math.round(value * 100) / 100
}

function normalizeDetails(saleChannel: SalesChannel, details: SaleDetails) {
  if (!details || typeof details !== 'object' || details.channel !== saleChannel) throw new Error('Sale details do not match the sales channel')
  if (details.channel === 'pos') {
    knownFields(details, ['channel', 'customerName', 'paymentMethod', 'paymentCurrency', 'usdMxnRate', 'usdPaid', 'receivedAmountMxn'])
    const customerName = optionalText(details.customerName, 'Customer name')
    const paymentCurrency = enumValue(details.paymentCurrency ?? 'mxn', POS_PAYMENT_CURRENCIES, 'POS payment currency')
    if (paymentCurrency === 'usd' && details.paymentMethod !== 'cash') throw new Error('USD payment is only available for cash')
    const usdMxnRate = optionalMoney(details.usdMxnRate, 'USD/MXN rate', true)
    const usdPaid = optionalMoney(details.usdPaid, 'USD paid', true)
    const receivedAmountMxn = optionalMoney(details.receivedAmountMxn, 'Received MXN')
    if (paymentCurrency === 'usd' && usdPaid === undefined) throw new Error('USD paid is required when USD is selected')
    return {
      ...(customerName === undefined ? {} : { customer_name: customerName }),
      payment_method: enumValue(details.paymentMethod, POS_PAYMENT_METHODS, 'POS payment method'),
      ...(paymentCurrency === 'usd' ? { payment_currency: 'usd' } : {}),
      ...(usdMxnRate === undefined ? {} : { usd_mxn_rate: usdMxnRate }),
      ...(usdPaid === undefined ? {} : { usd_paid: usdPaid }),
      ...(receivedAmountMxn === undefined ? {} : { received_amount_mxn: receivedAmountMxn }),
    }
  }
  if (details.channel === 'wholesale') {
    knownFields(details, ['channel', 'customerName', 'phone', 'deliveryMethod', 'paymentMethod'])
    return {
      customer_name: requiredText(details.customerName, 'Wholesale customer name'),
      phone: requiredText(details.phone, 'Wholesale customer phone', 40),
      delivery_method: enumValue(details.deliveryMethod, WHOLESALE_DELIVERY_METHODS, 'Wholesale delivery method'),
      payment_method: enumValue(details.paymentMethod, WHOLESALE_PAYMENT_METHODS, 'Wholesale payment method'),
    }
  }
  knownFields(details, ['channel'])
  return {}
}

function normalizeItems(items: SaleItemInput[]) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('At least one sale item is required')
  return items.map((item) => {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('Quantity must be a positive integer')
    if (item.lineKind === 'category') {
      return { line_kind: 'category', category_id: text(item.categoryId, 'Category ID'), quantity: item.quantity }
    }
    return { product_id: text(item.productId, 'Product ID'), quantity: item.quantity }
  })
}

function mapReceiptItems(value: unknown): SaleReceiptLine[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((item) => {
    const row = item as Record<string, unknown>
    return {
      lineKind: row.line_kind === 'category' ? 'category' : 'product',
      productId: typeof row.product_id === 'string' ? row.product_id : null,
      categoryId: typeof row.category_id === 'string' ? row.category_id : null,
      categoryName: typeof row.category_name === 'string' ? row.category_name : null,
      name: typeof row.product_name === 'string' ? row.product_name : '',
      quantity: Number(row.quantity),
      unitPriceMxn: Number(row.unit_price_mxn),
      lineTotalMxn: Number(row.line_total_mxn),
    }
  })
}

function mapReceipt(data: unknown): SaleReceipt {
  const row = (Array.isArray(data) ? data[0] : data) as SaleReceiptRow | undefined
  if (!row) throw new Error('Sale response was empty')
  const receipt: SaleReceipt = {
    id: row.sale_id,
    channel: row.channel,
    totalMxn: Number(row.total_mxn),
    createdAt: row.created_at,
    replayed: row.result_status === 'replayed',
  }
  if (row.cashier_name !== undefined) receipt.cashierName = row.cashier_name
  if (row.branch_id !== undefined) receipt.branchId = row.branch_id
  if (row.branch_name !== undefined) receipt.branchName = row.branch_name
  if (row.shift_id !== undefined) receipt.shiftId = row.shift_id
  if (row.customer_name !== undefined) receipt.customerName = row.customer_name
  if (row.payment_method !== undefined) receipt.paymentMethod = row.payment_method as PosPaymentMethod | null
  if (row.payment_currency !== undefined) receipt.paymentCurrency = row.payment_currency as PosPaymentCurrency | null
  if (row.usd_mxn_rate !== undefined) receipt.usdMxnRate = row.usd_mxn_rate === null ? null : Number(row.usd_mxn_rate)
  if (row.usd_equivalent !== undefined) receipt.usdEquivalent = row.usd_equivalent === null ? null : Number(row.usd_equivalent)
  if (row.usd_paid !== undefined) receipt.usdPaid = row.usd_paid === null ? null : Number(row.usd_paid)
  if (row.received_mxn !== undefined) receipt.receivedMxn = row.received_mxn === null ? null : Number(row.received_mxn)
  if (row.change_mxn !== undefined) receipt.changeMxn = row.change_mxn === null ? null : Number(row.change_mxn)
  const items = mapReceiptItems(row.items)
  if (items !== undefined) receipt.items = items
  return receipt
}

export async function recordSale(input: RecordSaleInput): Promise<SaleReceipt> {
  const requestId = text(input.requestId, 'Request ID')
  const saleChannel = channel(input.channel)
  if (saleChannel === 'event') throw new Error('Event sales must be completed from an event reservation')
  const items = normalizeItems(input.items)
  const details = normalizeDetails(saleChannel, input.details)
  const { data, error } = await insforge.database.rpc('record_sale', {
    p_request_id: requestId,
    p_channel: saleChannel,
    p_items: items,
    p_details: details,
  })
  if (error) throw error
  return mapReceipt(data)
}

function normalizeRange(range: SalesReportRange) {
  const from = text(range.from, 'Report start')
  const to = text(range.to, 'Report end')
  const start = Date.parse(from)
  const end = Date.parse(to)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Report date range is invalid')
  if (end - start > 366 * 24 * 60 * 60 * 1000) throw new Error('Report date range is limited to 366 days')
  return { from, to }
}

export async function getSalesByChannel(range: SalesReportRange): Promise<SalesChannelTotal[]> {
  const normalized = normalizeRange(range)
  const { data, error } = await insforge.database.rpc('report_sales_by_channel', {
    p_from: normalized.from,
    p_to: normalized.to,
  })
  if (error) throw error
  return ((data ?? []) as SalesChannelTotalRow[]).map((row) => ({
    channel: row.channel,
    saleCount: Number(row.sale_count),
    totalMxn: Number(row.total_mxn),
  }))
}

export async function getSalesReportDetail(range: SalesReportRange): Promise<SalesReportDetail[]> {
  const normalized = normalizeRange(range)
  const { data, error } = await insforge.database.rpc('report_sales_detail', {
    p_from: normalized.from,
    p_to: normalized.to,
    p_limit: 100,
  })
  if (error) throw error
  return ((data ?? []) as SalesReportDetailRow[]).map((row) => ({
    saleId: row.sale_id,
    saleDate: row.sale_date,
    channel: row.channel,
    totalMxn: Number(row.total_mxn),
    productName: row.product_name,
    quantity: Number(row.quantity),
    lineTotalMxn: Number(row.line_total_mxn),
    contextLabel: row.context_label ?? null,
    ...(row.line_kind === undefined ? {} : { lineKind: row.line_kind, categoryId: row.category_id ?? null, categoryName: row.category_name ?? null }),
    ...(row.event_date === undefined ? {} : {
      eventDate: row.event_date ?? null,
      contactName: row.contact_name ?? null,
      contactPhone: row.contact_phone ?? null,
      contactEmail: row.contact_email ?? null,
      initialPaymentAmount: row.initial_payment_amount === null || row.initial_payment_amount === undefined ? null : Number(row.initial_payment_amount),
      initialPaymentMethod: row.initial_payment_method ?? null,
      finalPaymentAmount: row.final_payment_amount === null || row.final_payment_amount === undefined ? null : Number(row.final_payment_amount),
      finalPaymentMethod: row.final_payment_method ?? null,
      reservationStatus: row.reservation_status ?? null,
    }),
  }))
}

const REPORT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 24 * 60 * 60 * 1000

function reportDateTimestamp(value: unknown) {
  if (typeof value !== 'string') return null
  const match = REPORT_DATE_PATTERN.exec(value)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
    ? date.getTime()
    : null
}

function normalizeDashboardRange(range: ReportDashboardRange) {
  const from = range?.from
  const to = range?.to
  const fromTimestamp = reportDateTimestamp(from)
  const toTimestamp = reportDateTimestamp(to)
  if (fromTimestamp === null || toTimestamp === null || toTimestamp < fromTimestamp) {
    throw new Error('Report date range is invalid')
  }
  if ((toTimestamp - fromTimestamp) / DAY_MS + 1 > REPORT_MAX_DAYS) {
    throw new Error('Report date range is limited to 366 calendar days')
  }
  const timezone = validateReportTimezone(range.timezone ?? DEFAULT_REPORT_TIMEZONE)

  const scope = range.scope ?? { kind: 'all' as const }
  if (scope.kind === 'all') return { from, to, timezone, scope: 'all' as const, branchId: null }
  if (scope.kind !== 'branch' || typeof scope.branchId !== 'string' || scope.branchId.trim() === '') {
    throw new Error('Report scope is invalid')
  }
  return { from, to, timezone, scope: 'branch' as const, branchId: scope.branchId.trim() }
}

function dashboardObject(value: unknown, field: string): ReportDashboardRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${field} is invalid`)
  return value as ReportDashboardRow
}

function dashboardText(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is invalid`)
  return value
}

function dashboardNullableText(value: unknown, field: string) {
  if (value === null || value === undefined) return null
  return dashboardText(value, field)
}

function dashboardNumber(value: unknown, field: string) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(number)) throw new Error(`${field} is invalid`)
  return number
}

function dashboardCount(value: unknown, field: string) {
  const number = dashboardNumber(value, field)
  if (!Number.isInteger(number) || number < 0) throw new Error(`${field} is invalid`)
  return number
}

function dashboardArray(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new Error(`${field} is invalid`)
  return value
}

function mapDashboardScope(value: unknown): ReportScope {
  const row = dashboardObject(value, 'Report scope')
  const kind = row.kind
  if (kind !== 'all' && kind !== 'branch') throw new Error('Report scope is invalid')
  const branchId = dashboardNullableText(row.branch_id, 'Report scope branch ID')
  const branchName = dashboardNullableText(row.branch_name, 'Report scope branch name')
  if (kind === 'branch' && branchId === null) throw new Error('Report scope branch ID is invalid')
  if (typeof row.includes_unassigned !== 'boolean') throw new Error('Report scope assignment flag is invalid')
  return { kind, branchId, branchName, includesUnassigned: row.includes_unassigned }
}

function mapDashboardChannels(value: unknown): SalesChannelTotal[] {
  return dashboardArray(value, 'Report channels').map((entry) => {
    const row = dashboardObject(entry, 'Report channel')
    return {
      channel: channel(row.channel),
      saleCount: dashboardCount(row.sale_count, 'Report channel count'),
      totalMxn: dashboardNumber(row.total_mxn, 'Report channel total'),
    }
  })
}

function mapDashboardDaily(value: unknown): ReportDailyPoint[] {
  return dashboardArray(value, 'Report daily series').map((entry) => {
    const row = dashboardObject(entry, 'Report daily point')
    const date = dashboardText(row.date, 'Report daily date')
    if (reportDateTimestamp(date) === null) throw new Error('Report daily date is invalid')
    return {
      date,
      saleCount: dashboardCount(row.sale_count, 'Report daily count'),
      totalMxn: dashboardNumber(row.total_mxn, 'Report daily total'),
    }
  })
}

function mapDashboardProducts(value: unknown, field = 'Report product aggregates'): ReportProductAggregate[] {
  return dashboardArray(value, field).map((entry) => {
    const row = dashboardObject(entry, 'Report product aggregate')
    if (row.line_kind !== 'product' && row.line_kind !== 'category') throw new Error('Report product line kind is invalid')
    return {
      lineKind: row.line_kind,
      productId: dashboardNullableText(row.product_id, 'Report product ID'),
      productName: dashboardText(row.product_name, 'Report product name'),
      categoryId: dashboardNullableText(row.category_id, 'Report category ID'),
      categoryName: dashboardNullableText(row.category_name, 'Report category name'),
      quantity: dashboardCount(row.quantity, 'Report product quantity'),
      totalMxn: dashboardNumber(row.total_mxn, 'Report product total'),
    }
  })
}

function mapDashboardEmployees(value: unknown): ReportEmployeeAggregate[] {
  return dashboardArray(value, 'Report employee aggregates').map((entry) => {
    const row = dashboardObject(entry, 'Report employee aggregate')
    return {
      employeeId: dashboardText(row.employee_id, 'Report employee ID'),
      employeeName: dashboardNullableText(row.employee_name, 'Report employee name') ?? 'Empleado sin nombre',
      saleCount: dashboardCount(row.sale_count, 'Report employee count'),
      totalMxn: dashboardNumber(row.total_mxn, 'Report employee total'),
    }
  })
}

export function mapReportDashboardAnalysis(data: unknown): ReportAnalysisSnapshot {
  const row = dashboardObject(Array.isArray(data) ? data[0] : data, 'Report dashboard analysis')
  return {
    products: mapDashboardProducts(row.products, 'Report catalog products'),
    categories: mapDashboardProducts(row.categories, 'Report catalog categories'),
    employees: mapDashboardEmployees(row.employees),
  }
}

function mapDashboardOperations(value: unknown): ReportOperationsSnapshot {
  const operations = dashboardObject(value, 'Report operations')
  const wholesale = dashboardObject(operations.wholesale, 'Wholesale operations')
  const event = dashboardObject(operations.event, 'Event operations')
  const pos = dashboardObject(operations.pos, 'POS operations')
  if (wholesale.scope !== 'global' || event.scope !== 'global') throw new Error('Global operation scope is invalid')
  if (pos.scope !== 'all' && pos.scope !== 'branch') throw new Error('POS operation scope is invalid')
  return {
    wholesale: {
      scope: 'global',
      pendingCount: dashboardCount(wholesale.pending_count, 'Wholesale pending count'),
      processingCount: dashboardCount(wholesale.processing_count, 'Wholesale processing count'),
      workloadCount: dashboardCount(wholesale.workload_count, 'Wholesale workload count'),
    },
    event: {
      scope: 'global',
      pendingCount: dashboardCount(event.pending_count, 'Event pending count'),
      reservedCount: dashboardCount(event.reserved_count, 'Event reserved count'),
      allocatedCount: dashboardCount(event.allocated_count, 'Event allocated count'),
      capacityLimit: dashboardCount(event.capacity_limit, 'Event capacity limit'),
      availableCount: dashboardCount(event.available_count, 'Event available count'),
    },
    pos: {
      scope: pos.scope,
      openShiftCount: dashboardCount(pos.open_shift_count, 'POS open shift count'),
    },
  }
}

export function mapReportDashboardSnapshot(data: unknown): ReportSnapshot {
  const row = dashboardObject(Array.isArray(data) ? data[0] : data, 'Report dashboard snapshot')
  const timezone = validateReportTimezone(row.timezone)
  const sales = dashboardObject(row.sales, 'Report sales')
  const averageState = sales.average_state
  if (averageState !== 'value' && averageState !== 'no-data') throw new Error('Report average state is invalid')
  return {
    from: dashboardText(row.from, 'Report start date'),
    to: dashboardText(row.to, 'Report end date'),
    timezone,
    utcFrom: dashboardText(row.utc_from, 'Report UTC start'),
    utcTo: dashboardText(row.utc_to, 'Report UTC end'),
    scope: mapDashboardScope(row.scope),
    sales: {
      totalMxn: dashboardNumber(sales.total_mxn, 'Report total'),
      count: dashboardCount(sales.count, 'Report count'),
      averageTicketMxn: dashboardNumber(sales.average_ticket_mxn, 'Report average ticket'),
      averageState,
      channels: mapDashboardChannels(sales.channels),
      daily: mapDashboardDaily(sales.daily),
      products: mapDashboardProducts(sales.products),
    },
    operations: mapDashboardOperations(row.operations),
  }
}

export function isReportUnauthorizedError(error: unknown) {
  if (typeof error !== 'object' || error === null) return error instanceof Error && /access denied|unauthorized|forbidden|permission/i.test(error.message)
  const details = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown }
  const statuses = [details.status, details.statusCode].map((value) => Number(value))
  if (statuses.includes(401) || statuses.includes(403)) return true
  return [details.code, details.message].some((value) => typeof value === 'string' && /access denied|unauthorized|forbidden|permission/i.test(value))
}

export async function getReportDashboardSnapshot(range: ReportDashboardRange): Promise<ReportSnapshot> {
  const normalized = normalizeDashboardRange(range)
  const { data, error } = await insforge.database.rpc('report_dashboard_snapshot', {
    p_from: normalized.from,
    p_to: normalized.to,
    p_timezone: normalized.timezone,
    p_scope: normalized.scope,
    p_branch_id: normalized.branchId,
  })
  if (error) throw error
  return mapReportDashboardSnapshot(data)
}

export async function getReportDashboardAnalysis(range: ReportDashboardRange): Promise<ReportAnalysisSnapshot> {
  const normalized = normalizeDashboardRange(range)
  const { data, error } = await insforge.database.rpc('report_dashboard_analysis', {
    p_from: normalized.from,
    p_to: normalized.to,
    p_timezone: normalized.timezone,
    p_scope: normalized.scope,
    p_branch_id: normalized.branchId,
  })
  if (error) throw error
  return mapReportDashboardAnalysis(data)
}
