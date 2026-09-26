import type { EventReservationItemInput, EventPaymentMethod, EventPaymentPlan, EventReservationOrigin, EventReservationState, EventTransferTicket } from './types'

export const EVENT_RESERVATION_STATES = ['pending', 'reserved', 'completed', 'cancelled'] as const
export const EVENT_PAYMENT_PLANS = ['advance', 'full'] as const
export const EVENT_PAYMENT_METHODS = ['cash', 'transfer'] as const
export const EVENT_RESERVATION_ORIGINS = ['public', 'whatsapp', 'phone', 'other'] as const

function requiredText(value: unknown, field: string, maxLength = 160) {
  if (typeof value !== 'string') throw new Error(`${field} is required`)
  const normalized = value.trim()
  if (normalized === '') throw new Error(`${field} is required`)
  if (normalized.length > maxLength) throw new Error(`${field} is too long`)
  return normalized
}

export function normalizeEventRequestId(value: unknown) {
  return requiredText(value, 'Request ID', 120)
}

export function normalizeEventReason(value: unknown) {
  return requiredText(value, 'Reason', 500)
}

export function normalizeEventCustomerName(value: unknown) {
  return requiredText(value, 'Customer name').replace(/\s+/g, ' ')
}

export function normalizeEventPhone(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '' || !/^[+0-9() .-]+$/.test(value)) {
    throw new Error('Mobile number must be a valid Mexico mobile number')
  }
  const digits = value.replace(/[^0-9]/g, '')
  if (/^521[2-9][0-9]{9}$/.test(digits)) return `+52${digits.slice(3)}`
  if (/^52[2-9][0-9]{9}$/.test(digits)) return `+52${digits.slice(2)}`
  if (/^[2-9][0-9]{9}$/.test(digits)) return `+52${digits}`
  throw new Error('Mobile number must be a valid Mexico mobile number')
}

export function normalizeEventEmail(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  const normalized = requiredText(value, 'Customer email', 254).toLocaleLowerCase('en-US')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Customer email is invalid')
  return normalized
}

export function normalizeEventDate(value: unknown) {
  const normalized = requiredText(value, 'Event date', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error('Event date must be an ISO date')
  const parsed = new Date(`${normalized}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) throw new Error('Event date must be an ISO date')
  return normalized
}

export function normalizeEventPaymentPlan(value: unknown): EventPaymentPlan {
  if (typeof value !== 'string' || !EVENT_PAYMENT_PLANS.includes(value as EventPaymentPlan)) throw new Error('Event payment plan is invalid')
  return value as EventPaymentPlan
}

export function normalizeEventPaymentMethod(value: unknown, field = 'Payment method'): EventPaymentMethod {
  if (typeof value !== 'string' || !EVENT_PAYMENT_METHODS.includes(value as EventPaymentMethod)) throw new Error(`${field} is invalid`)
  return value as EventPaymentMethod
}

export function normalizeEventOrigin(value: unknown): EventReservationOrigin {
  if (typeof value !== 'string' || !EVENT_RESERVATION_ORIGINS.includes(value as EventReservationOrigin)) throw new Error('Reservation origin is invalid')
  return value as EventReservationOrigin
}

export function normalizeEventState(value: unknown): EventReservationState {
  if (typeof value !== 'string' || !EVENT_RESERVATION_STATES.includes(value as EventReservationState)) throw new Error('Event reservation state is invalid')
  return value as EventReservationState
}

export function normalizeEventMoney(value: unknown, field: string, allowZero = false) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${field} must be a ${allowZero ? 'non-negative' : 'positive'} integer`)
  }
  return value
}

export function normalizeEventOptionalText(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null || value === '') return null
  return requiredText(value, field, maxLength)
}

export function normalizeEventTransferTicket(requestId: string, paymentMethod: EventPaymentMethod, value: EventTransferTicket | null | undefined) {
  if (value === undefined || value === null) return { url: null, key: null }
  if (paymentMethod !== 'transfer') throw new Error('Transfer ticket is only valid for transfer payments')
  const url = normalizeEventOptionalText(value.url, 'Transfer ticket URL', 4096)
  const key = normalizeEventOptionalText(value.key, 'Transfer ticket key', 512)
  if ((url === null) !== (key === null)) throw new Error('Transfer ticket URL and key must be provided together')
  if (key !== null && !key.startsWith(`events/${requestId}/`)) throw new Error('Transfer ticket key does not belong to this event request')
  return { url, key }
}

export function normalizeEventItems(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('At least one event reservation item is required')
  const seen = new Set<string>()
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Event reservation item must be an object')
    const candidate = item as EventReservationItemInput
    if (!Number.isInteger(candidate.quantity) || candidate.quantity <= 0) throw new Error('Event reservation quantity must be a positive integer')
    const lineKind = candidate.lineKind ?? 'product'
    if (lineKind === 'category') {
      const categoryId = requiredText('categoryId' in candidate ? candidate.categoryId : undefined, 'Category ID', 120)
      const key = `category:${categoryId}`
      if (seen.has(key)) throw new Error('Duplicate event reservation category')
      seen.add(key)
      return { line_kind: 'category' as const, category_id: categoryId, quantity: candidate.quantity }
    }
    if (lineKind !== 'product') throw new Error('Event reservation line kind is invalid')
    const productId = requiredText('productId' in candidate ? candidate.productId : undefined, 'Product ID', 120)
    const key = `product:${productId}`
    if (seen.has(key)) throw new Error('Duplicate event reservation product')
    seen.add(key)
    return { line_kind: 'product' as const, product_id: productId, quantity: candidate.quantity }
  })
}
