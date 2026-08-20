import { insforge } from '../../../lib/insforge'

export const SALES_CHANNELS = ['pos', 'wholesale', 'event'] as const
export type SalesChannel = typeof SALES_CHANNELS[number]

export type SaleItemInput = {
  productId: string
  quantity: number
}

export type RecordSaleInput = {
  requestId: string
  channel: SalesChannel
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
  const { data, error } = await insforge.database.rpc('record_sale', {
    p_request_id: requestId,
    p_channel: saleChannel,
    p_items: items,
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
