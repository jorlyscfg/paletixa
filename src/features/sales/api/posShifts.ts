import { insforge } from '../../../lib/insforge'

export const DEFAULT_POS_USD_MXN_RATE = 15

export type PosShift = {
  id: string
  cashierId: string
  branchId: string
  branchName: string
  status: 'open' | 'closed'
  openingCashMxn: number
  usdMxnRate: number
  openedAt: string
  closedAt: string | null
  cashSalesMxn: number
  cashSalesUsd: number
  cardSalesMxn: number
  closingCashMxn: number | null
  closingCashUsd: number | null
  closingCardMxn: number | null
  cashMxnDifference: number | null
  cashUsdDifference: number | null
  cardDifference: number | null
}

export type OpenPosShiftInput = {
  initialCashMxn: number
  usdMxnRate?: number
}

export type ClosePosShiftInput = {
  shiftId: string
  closingCashMxn: number
  closingCashUsd: number
  closingCardMxn: number
}

export type PosDailySaleLine = {
  name: string
  category: string | null
  quantity: number
  unitTotalMxn: number
}

export type PosDailySale = {
  id: string
  createdAt: string
  totalMxn: number
  paymentMethod: 'cash' | 'card' | null
  paymentCurrency: 'mxn' | 'usd' | null
  items: PosDailySaleLine[]
}

type PosShiftRow = {
  shift_id: string
  cashier_id: string
  branch_id: string
  branch_name: string
  status: 'open' | 'closed'
  opening_cash_mxn: number | string
  usd_mxn_rate: number | string
  opened_at: string
  closed_at: string | null
  cash_sales_mxn: number | string
  cash_sales_usd: number | string
  card_sales_mxn: number | string
  closing_cash_mxn: number | string | null
  closing_cash_usd: number | string | null
  closing_card_mxn: number | string | null
  cash_mxn_difference: number | string | null
  cash_usd_difference: number | string | null
  card_difference: number | string | null
}

type PosDailySaleRow = {
  sale_id: string
  created_at: string
  total_mxn: number | string
  payment_method: string | null
  payment_currency: string | null
  line_items: unknown
}

function number(value: number | string | null) {
  return value === null ? null : Number(value)
}

function mapShift(data: unknown): PosShift | null {
  const row = (Array.isArray(data) ? data[0] : data) as PosShiftRow | undefined
  if (!row) return null
  return {
    id: row.shift_id,
    cashierId: row.cashier_id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    status: row.status,
    openingCashMxn: Number(row.opening_cash_mxn),
    usdMxnRate: Number(row.usd_mxn_rate),
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    cashSalesMxn: Number(row.cash_sales_mxn),
    cashSalesUsd: Number(row.cash_sales_usd),
    cardSalesMxn: Number(row.card_sales_mxn),
    closingCashMxn: number(row.closing_cash_mxn),
    closingCashUsd: number(row.closing_cash_usd),
    closingCardMxn: number(row.closing_card_mxn),
    cashMxnDifference: number(row.cash_mxn_difference),
    cashUsdDifference: number(row.cash_usd_difference),
    cardDifference: number(row.card_difference),
  }
}

function mapDailySaleLine(value: unknown): PosDailySaleLine {
  const row = (value ?? {}) as Record<string, unknown>
  return {
    name: typeof row.name === 'string' ? row.name : 'Venta',
    category: typeof row.category === 'string' ? row.category : null,
    quantity: Number(row.quantity),
    unitTotalMxn: Number(row.unit_total_mxn),
  }
}

function mapDailySale(row: PosDailySaleRow): PosDailySale {
  return {
    id: row.sale_id,
    createdAt: row.created_at,
    totalMxn: Number(row.total_mxn),
    paymentMethod: row.payment_method === 'cash' || row.payment_method === 'card' ? row.payment_method : null,
    paymentCurrency: row.payment_currency === 'mxn' || row.payment_currency === 'usd' ? row.payment_currency : null,
    items: Array.isArray(row.line_items) ? row.line_items.map(mapDailySaleLine) : [],
  }
}

function nonNegative(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${field} must be a non-negative number`)
  return Math.round(value * 100) / 100
}

function positiveRate(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('El tipo de cambio debe ser un número positivo.')
  return Math.round(value * 10000) / 10000
}

export async function getActivePosShift(): Promise<PosShift | null> {
  const { data, error } = await insforge.database.rpc('get_active_pos_shift')
  if (error) throw error
  return mapShift(data)
}

export async function getCurrentPosShift(): Promise<PosShift | null> {
  const { data, error } = await insforge.database.rpc('get_current_pos_shift')
  if (error) throw error
  return mapShift(data)
}

export async function getPosDailySales(limit = 100): Promise<PosDailySale[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Daily sales limit must be between 1 and 100')
  const { data, error } = await insforge.database.rpc('get_pos_daily_sales', { p_limit: limit })
  if (error) throw error
  return ((data ?? []) as PosDailySaleRow[]).map(mapDailySale)
}

export async function openPosShift(input: OpenPosShiftInput): Promise<PosShift> {
  const initialCashMxn = nonNegative(input.initialCashMxn, 'Initial cash')
  const usdMxnRate = positiveRate(input.usdMxnRate ?? DEFAULT_POS_USD_MXN_RATE)
  const { data, error } = await insforge.database.rpc('open_pos_shift', {
    p_initial_cash_mxn: initialCashMxn,
    p_usd_mxn_rate: usdMxnRate,
  })
  if (error) throw error
  const shift = mapShift(data)
  if (!shift) throw new Error('La apertura de turno no devolvió información.')
  return shift
}

export async function closePosShift(input: ClosePosShiftInput): Promise<PosShift> {
  if (typeof input.shiftId !== 'string' || input.shiftId.trim() === '') throw new Error('Shift ID is required')
  const values = {
    p_shift_id: input.shiftId.trim(),
    p_closing_cash_mxn: nonNegative(input.closingCashMxn, 'Closing cash MXN'),
    p_closing_cash_usd: nonNegative(input.closingCashUsd, 'Closing cash USD'),
    p_closing_card_mxn: nonNegative(input.closingCardMxn, 'Closing card MXN'),
  }
  const { data, error } = await insforge.database.rpc('close_pos_shift', values)
  if (error) throw error
  const shift = mapShift(data)
  if (!shift) throw new Error('El cierre de turno no devolvió información.')
  return shift
}
