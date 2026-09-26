import type { WholesaleOrderItemInput, WholesaleTransferTicket } from './types'

export const WHOLESALE_ORDER_STATES = ['pending', 'processing', 'completed', 'cancelled'] as const
export type WholesaleOrderState = typeof WHOLESALE_ORDER_STATES[number]

export const WHOLESALE_PAYMENT_METHODS = ['cash', 'transfer'] as const
export type WholesalePaymentMethod = typeof WHOLESALE_PAYMENT_METHODS[number]

export const WHOLESALE_PAYMENT_CURRENCIES = ['mxn', 'usd'] as const
export type WholesalePaymentCurrency = typeof WHOLESALE_PAYMENT_CURRENCIES[number]

export const WHOLESALE_DELIVERY_AGREEMENTS = ['delivery', 'pickup'] as const
export type WholesaleDeliveryAgreement = typeof WHOLESALE_DELIVERY_AGREEMENTS[number]

export type WholesaleOrderItemPayload =
  | {
      product_id: string
      quantity: number
    }
  | {
      line_kind: 'category'
      category_id: string
      quantity: number
    }

function requiredText(value: unknown, field: string, maxLength = 160) {
  if (typeof value !== 'string') throw new Error(`${field} is required`)
  const normalized = value.trim()
  if (normalized === '') throw new Error(`${field} is required`)
  if (normalized.length > maxLength) throw new Error(`${field} is too long`)
  return normalized
}

export function normalizeRequestId(value: unknown) {
  return requiredText(value, 'Request ID', 120)
}

export function normalizeReason(value: unknown) {
  return requiredText(value, 'Reason', 500)
}

export function normalizeCustomerName(value: unknown) {
  const normalized = requiredText(value, 'Customer name')
  return normalized.replace(/\s+/g, ' ')
}

export function normalizeCustomerEmail(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  const normalized = requiredText(value, 'Customer email', 254).toLocaleLowerCase('en-US')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Customer email is invalid')
  return normalized
}

export function normalizeMexicoMobile(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '' || !/^[+0-9() .-]+$/.test(value)) {
    throw new Error('Mobile number must be a valid Mexico mobile number')
  }
  const digits = value.replace(/[^0-9]/g, '')
  let national: string
  if (/^521[2-9][0-9]{9}$/.test(digits)) national = digits.slice(3)
  else if (/^52[2-9][0-9]{9}$/.test(digits)) national = digits.slice(2)
  else if (/^[2-9][0-9]{9}$/.test(digits)) national = digits
  else throw new Error('Mobile number must be a valid Mexico mobile number')
  return `+52${national}`
}

export function normalizePin(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}$/.test(value)) throw new Error('PIN must contain exactly 4 digits')
  return value
}

export function normalizeWholesaleOrderState(value: unknown): WholesaleOrderState {
  if (typeof value !== 'string' || !WHOLESALE_ORDER_STATES.includes(value as WholesaleOrderState)) {
    throw new Error('Wholesale order state is invalid')
  }
  return value as WholesaleOrderState
}

export function normalizeWholesalePaymentMethod(value: unknown): WholesalePaymentMethod {
  if (typeof value !== 'string' || !WHOLESALE_PAYMENT_METHODS.includes(value as WholesalePaymentMethod)) {
    throw new Error('Wholesale payment method is invalid')
  }
  return value as WholesalePaymentMethod
}

export function resolveWholesaleUnitPrice(retailPrice: unknown, wholesalePrice: unknown, quantity: unknown) {
  if (typeof retailPrice !== 'number' || !Number.isFinite(retailPrice) || retailPrice <= 0) {
    throw new Error('Retail price must be positive')
  }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) throw new Error('Wholesale quantity must be a positive integer')
  return quantity >= 10 && typeof wholesalePrice === 'number' && Number.isFinite(wholesalePrice) && wholesalePrice > 0
    ? Math.round(wholesalePrice * 100) / 100
    : Math.round(retailPrice * 100) / 100
}

export function normalizeWholesaleCompletion(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Completion data must be an object')
  const candidate = value as Record<string, unknown>
  const allowed = ['paymentAmount', 'paymentCurrency', 'paymentReference', 'paymentNote', 'deliveryAgreement']
  if (Object.keys(candidate).some((key) => !allowed.includes(key))) throw new Error('Completion data contains unknown fields')
  if (typeof candidate.paymentAmount !== 'number' || !Number.isFinite(candidate.paymentAmount) || candidate.paymentAmount <= 0) {
    throw new Error('Payment amount must be positive')
  }
  const paymentCurrency = candidate.paymentCurrency === undefined || candidate.paymentCurrency === null || candidate.paymentCurrency === ''
    ? 'mxn'
    : candidate.paymentCurrency
  if (!WHOLESALE_PAYMENT_CURRENCIES.includes(paymentCurrency as WholesalePaymentCurrency)) throw new Error('Payment currency is invalid')
  const deliveryAgreement = candidate.deliveryAgreement
  if (!WHOLESALE_DELIVERY_AGREEMENTS.includes(deliveryAgreement as WholesaleDeliveryAgreement)) throw new Error('Delivery agreement is invalid')
  const optionalText = (input: unknown, field: string, maxLength: number) => {
    if (input === undefined || input === null || input === '') return null
    return requiredText(input, field, maxLength)
  }
  return {
    payment_amount: Math.round(candidate.paymentAmount * 100) / 100,
    payment_currency: paymentCurrency as WholesalePaymentCurrency,
    payment_reference: optionalText(candidate.paymentReference, 'Payment reference', 160),
    payment_note: optionalText(candidate.paymentNote, 'Payment note', 500),
    delivery_agreement: deliveryAgreement as WholesaleDeliveryAgreement,
  }
}

export function normalizeTransferTicket(
  paymentMethod: unknown,
  ticket?: Partial<WholesaleTransferTicket> | null,
): WholesaleTransferTicket | null {
  const normalizedPaymentMethod = normalizeWholesalePaymentMethod(paymentMethod)
  const ticketText = (value: unknown, field: string, maxLength: number) => {
    if (value === undefined || value === null || value === '') return null
    return requiredText(value, field, maxLength)
  }
  const url = ticketText(ticket?.url, 'Transfer ticket URL', 2048)
  const key = ticketText(ticket?.key, 'Transfer ticket key', 512)
  if ((url === null) !== (key === null)) throw new Error('Transfer ticket URL and key must be provided together')
  if (normalizedPaymentMethod === 'cash' && (url !== null || key !== null)) throw new Error('Transfer ticket is only available for transfer payments')
  return url === null || key === null ? null : { url, key }
}

export function normalizeWholesaleOrderItems(value: unknown): WholesaleOrderItemPayload[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('At least one wholesale order item is required')
  const seen = new Set<string>()
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Wholesale order item must be an object')
    const candidate = item as WholesaleOrderItemInput
    const lineKind = candidate.lineKind ?? 'product'
    if (!Number.isInteger(candidate.quantity) || candidate.quantity <= 0) throw new Error('Wholesale order quantity must be a positive integer')
    if (lineKind === 'category') {
      const categoryId = requiredText('categoryId' in candidate ? candidate.categoryId : undefined, 'Category ID', 120)
      if (seen.has(`category:${categoryId}`)) throw new Error('Duplicate wholesale order category')
      seen.add(`category:${categoryId}`)
      return { line_kind: 'category', category_id: categoryId, quantity: candidate.quantity }
    }
    if (lineKind !== 'product') throw new Error('Wholesale order line kind is invalid')
    const productId = requiredText('productId' in candidate ? candidate.productId : undefined, 'Product ID', 120)
    if (seen.has(`product:${productId}`)) throw new Error('Duplicate wholesale order product')
    seen.add(`product:${productId}`)
    return { product_id: productId, quantity: candidate.quantity }
  })
}
