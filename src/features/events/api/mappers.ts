import { normalizeEventOrigin, normalizeEventPaymentMethod, normalizeEventPaymentPlan, normalizeEventState } from './validators'
import type { EventAvailability, EventReservation, EventReservationItem } from './types'

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordValue : null
}

function firstRow(data: unknown): RecordValue {
  const row = Array.isArray(data) ? data[0] : data
  const result = record(row)
  if (!result) throw new Error('Event reservation response was empty')
  return result
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || value === '') throw new Error(`Event reservation response is missing ${field}`)
  return value
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value !== '' ? value : null
}

function nullableEnum<T extends string>(value: unknown, values: readonly T[], field: string): T | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`Event reservation response has an invalid ${field}`)
  return value as T
}

export function mapEventReservationItem(value: unknown): EventReservationItem {
  const row = record(value)
  if (!row) throw new Error('Event reservation item response is invalid')
  const lineKind = row.line_kind === undefined || row.line_kind === null || row.line_kind === '' ? 'product' : row.line_kind
  if (lineKind !== 'product' && lineKind !== 'category') throw new Error('Event reservation response has an invalid line kind')
  const productId = nullableString(row.product_id)
  const categoryId = nullableString(row.category_id)
  if (lineKind === 'product' && productId === null) throw new Error('Event reservation response is missing product ID')
  if (lineKind === 'category' && categoryId === null) throw new Error('Event reservation response is missing category ID')
  return {
    id: requiredString(row.id, 'item ID'),
    lineKind,
    productId,
    categoryId,
    categoryName: nullableString(row.category_name),
    productName: requiredString(row.product_name, 'item name'),
    unitPriceMxn: Number(row.unit_price_mxn),
    quantity: Number(row.quantity),
    lineTotalMxn: Number(row.line_total_mxn),
  }
}

export function mapEventReservation(data: unknown): EventReservation {
  const row = firstRow(data)
  const remainingTransferTicket = nullableString(row.remaining_transfer_ticket_url) && nullableString(row.remaining_transfer_ticket_key)
    ? { url: nullableString(row.remaining_transfer_ticket_url) as string, key: nullableString(row.remaining_transfer_ticket_key) as string }
    : null
  return {
    id: requiredString(row.reservation_id, 'reservation ID'),
    requestId: requiredString(row.request_id, 'request ID'),
    customerName: requiredString(row.customer_name, 'customer name'),
    customerPhone: requiredString(row.customer_phone, 'customer phone'),
    customerEmail: nullableString(row.customer_email),
    eventDate: requiredString(row.event_date, 'event date'),
    cartAllocated: row.cart_allocated === true,
    status: normalizeEventState(row.status),
    origin: normalizeEventOrigin(row.origin),
    paymentPlan: normalizeEventPaymentPlan(row.payment_plan),
    totalMxn: Number(row.total_mxn),
    declaredPaymentAmount: Number(row.declared_payment_amount),
    declaredPaymentMethod: normalizeEventPaymentMethod(row.declared_payment_method, 'Declared payment method'),
    declaredPaymentReference: nullableString(row.declared_payment_reference),
    transferTicket: nullableString(row.transfer_ticket_url) && nullableString(row.transfer_ticket_key)
      ? { url: nullableString(row.transfer_ticket_url) as string, key: nullableString(row.transfer_ticket_key) as string }
      : null,
    confirmedPaymentAmount: row.confirmed_payment_amount === undefined || row.confirmed_payment_amount === null ? null : Number(row.confirmed_payment_amount),
    confirmedPaymentMethod: nullableEnum(row.confirmed_payment_method, ['cash', 'transfer'], 'confirmed payment method'),
    confirmedPaymentReference: nullableString(row.confirmed_payment_reference),
    confirmedPaymentNote: nullableString(row.confirmed_payment_note),
    paymentConfirmedAt: nullableString(row.payment_confirmed_at),
    paymentConfirmedBy: nullableString(row.payment_confirmed_by),
    remainingPaymentAmount: Number(row.remaining_payment_amount ?? 0),
    remainingPaymentMethod: nullableEnum(row.remaining_payment_method, ['cash', 'transfer'], 'remaining payment method'),
    remainingPaymentNote: nullableString(row.remaining_payment_note),
    ...(remainingTransferTicket ? { remainingTransferTicket } : {}),
    reservedAt: nullableString(row.reserved_at),
    reservedBy: nullableString(row.reserved_by),
    completedAt: nullableString(row.completed_at),
    cancelledAt: nullableString(row.cancelled_at),
    cancelledBy: nullableString(row.cancelled_by),
    cancellationReason: nullableString(row.cancellation_reason),
    saleId: nullableString(row.sale_id),
    createdBy: nullableString(row.created_by),
    createdAt: requiredString(row.created_at, 'creation time'),
    updatedAt: requiredString(row.updated_at, 'update time'),
    adminSeenAt: nullableString(row.admin_seen_at),
    adminSeenBy: nullableString(row.admin_seen_by),
    items: Array.isArray(row.items) ? row.items.map(mapEventReservationItem) : [],
  }
}

export function mapEventReservationList(data: unknown): EventReservation[] {
  if (!Array.isArray(data)) return []
  return data.map(mapEventReservation)
}

export function mapEventAvailability(data: unknown): EventAvailability {
  const row = firstRow(data)
  return {
    eventDate: requiredString(row.event_date, 'event date'),
    capacityLimit: Number(row.capacity_limit),
    allocatedCount: Number(row.allocated_count),
    availableCount: Number(row.available_count),
  }
}
