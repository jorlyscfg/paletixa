import { insforge } from '../../../lib/insforge'

export const SALES_CHANNELS = ['pos', 'wholesale', 'event'] as const
export type SalesChannel = typeof SALES_CHANNELS[number]

export const POS_PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const
export type PosPaymentMethod = typeof POS_PAYMENT_METHODS[number]

export const WHOLESALE_DELIVERY_METHODS = ['delivery', 'pickup'] as const
export type WholesaleDeliveryMethod = typeof WHOLESALE_DELIVERY_METHODS[number]

export const WHOLESALE_PAYMENT_METHODS = ['credit', 'cash', 'transfer'] as const
export type WholesalePaymentMethod = typeof WHOLESALE_PAYMENT_METHODS[number]

export const EVENT_ADVANCE_PAYMENT_METHODS = ['cash', 'card'] as const
export type EventAdvancePaymentMethod = typeof EVENT_ADVANCE_PAYMENT_METHODS[number]

export type SaleItemInput = {
  productId: string
  quantity: number
}

export type PosSaleDetails = {
  channel: 'pos'
  customerName?: string
  paymentMethod: PosPaymentMethod
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
  eventName: string
  eventDate: string
  responsibleName: string
  advanceAmountMxn?: number
  advancePaymentMethod?: EventAdvancePaymentMethod
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
}

export type SalesChannelTotal = {
  channel: SalesChannel
  saleCount: number
  totalMxn: number
}

export type SalesReportDetail = {
  saleId: string
  saleDate: string
  channel: SalesChannel
  totalMxn: number
  productName: string
  quantity: number
  lineTotalMxn: number
  contextLabel: string | null
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
}

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

function isoDate(value: unknown) {
  const normalized = requiredText(value, 'Event date', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error('Event date must be an ISO date')
  const parsed = new Date(`${normalized}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) throw new Error('Event date must be an ISO date')
  return normalized
}

function normalizeDetails(saleChannel: SalesChannel, details: SaleDetails) {
  if (!details || typeof details !== 'object' || details.channel !== saleChannel) throw new Error('Sale details do not match the sales channel')
  if (details.channel === 'pos') {
    knownFields(details, ['channel', 'customerName', 'paymentMethod'])
    const customerName = optionalText(details.customerName, 'Customer name')
    return {
      ...(customerName === undefined ? {} : { customer_name: customerName }),
      payment_method: enumValue(details.paymentMethod, POS_PAYMENT_METHODS, 'POS payment method'),
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
  knownFields(details, ['channel', 'eventName', 'eventDate', 'responsibleName', 'advanceAmountMxn', 'advancePaymentMethod'])
  const advanceAmount = details.advanceAmountMxn
  if (advanceAmount !== undefined && (!Number.isFinite(advanceAmount) || advanceAmount < 0)) throw new Error('Advance amount cannot be negative')
  const advancePaymentMethod = advanceAmount !== undefined && advanceAmount > 0
    ? enumValue(details.advancePaymentMethod, EVENT_ADVANCE_PAYMENT_METHODS, 'Advance payment method')
    : undefined
  return {
    event_name: requiredText(details.eventName, 'Event name'),
    event_date: isoDate(details.eventDate),
    responsible_name: requiredText(details.responsibleName, 'Event responsible name'),
    ...(advanceAmount === undefined ? {} : { advance_amount_mxn: advanceAmount }),
    ...(advancePaymentMethod === undefined ? {} : { advance_payment_method: advancePaymentMethod }),
  }
}

function normalizeItems(items: SaleItemInput[]) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('At least one sale item is required')
  return items.map((item) => {
    const productId = text(item.productId, 'Product ID')
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('Quantity must be a positive integer')
    return { product_id: productId, quantity: item.quantity }
  })
}

function mapReceipt(data: unknown): SaleReceipt {
  const row = (Array.isArray(data) ? data[0] : data) as SaleReceiptRow | undefined
  if (!row) throw new Error('Sale response was empty')
  return {
    id: row.sale_id,
    channel: row.channel,
    totalMxn: Number(row.total_mxn),
    createdAt: row.created_at,
    replayed: row.result_status === 'replayed',
  }
}

export async function recordSale(input: RecordSaleInput): Promise<SaleReceipt> {
  const requestId = text(input.requestId, 'Request ID')
  const saleChannel = channel(input.channel)
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
  }))
}
