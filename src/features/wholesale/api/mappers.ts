import { normalizePin, normalizeWholesaleOrderState, normalizeWholesalePaymentMethod, WHOLESALE_DELIVERY_AGREEMENTS, WHOLESALE_PAYMENT_CURRENCIES } from './validators'
import type { WholesaleCustomer, WholesaleCustomerPin, WholesaleOrder, WholesaleOrderItem } from './types'

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordValue : null
}

function firstRow(data: unknown): RecordValue {
  const row = Array.isArray(data) ? data[0] : data
  const result = record(row)
  if (!result) throw new Error('Wholesale response was empty')
  return result
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || value === '') throw new Error(`Wholesale response is missing ${field}`)
  return value
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value !== '' ? value : null
}

function customerPin(row: RecordValue) {
  return normalizePin(row.current_pin ?? row.generated_pin)
}

function nullableEnum<T extends string>(value: unknown, values: readonly T[], field: string): T | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`Wholesale response has an invalid ${field}`)
  return value as T
}

export function mapWholesaleCustomer(data: unknown): WholesaleCustomer {
  const row = firstRow(data)
  if (row.status !== 'active' && row.status !== 'inactive') throw new Error('Wholesale response has an invalid customer status')
  return {
    id: requiredString(row.customer_id, 'customer ID'),
    name: requiredString(row.name, 'customer name'),
    mobile: requiredString(row.mobile, 'customer mobile'),
    email: nullableString(row.email),
    status: row.status,
    currentPin: customerPin(row),
    ...(typeof row.failed_login_attempts === 'number' || typeof row.failed_login_attempts === 'string'
      ? { failedLoginAttempts: Number(row.failed_login_attempts) }
      : {}),
    createdAt: requiredString(row.created_at, 'customer creation time'),
    updatedAt: requiredString(row.updated_at, 'customer update time'),
  }
}

export function mapWholesaleCustomerList(data: unknown): WholesaleCustomer[] {
  if (!Array.isArray(data)) return []
  return data.map((row) => mapWholesaleCustomer(row))
}

export function mapWholesaleCustomerPin(data: unknown): WholesaleCustomerPin {
  return mapWholesaleCustomer(data)
}

export function mapWholesaleOrderItem(value: unknown): WholesaleOrderItem {
  const row = record(value)
  if (!row) throw new Error('Wholesale order item response is invalid')
  const lineKind = row.line_kind === undefined || row.line_kind === null || row.line_kind === '' ? 'product' : row.line_kind
  if (lineKind !== 'product' && lineKind !== 'category') throw new Error('Wholesale response has an invalid order item line kind')
  const productId = nullableString(row.product_id)
  const categoryId = nullableString(row.category_id)
  if (lineKind === 'product' && productId === null) throw new Error('Wholesale response is missing order item product ID')
  if (lineKind === 'category' && categoryId === null) throw new Error('Wholesale response is missing order item category ID')
  return {
    id: requiredString(row.id, 'order item ID'),
    lineKind,
    productId,
    categoryId,
    categoryName: nullableString(row.category_name),
    productName: requiredString(row.product_name, 'order item product name'),
    unitPriceMxn: Number(row.unit_price_mxn),
    quantity: Number(row.quantity),
    lineTotalMxn: Number(row.line_total_mxn),
  }
}

export function mapWholesaleOrder(data: unknown): WholesaleOrder {
  const row = firstRow(data)
  const ticketUrl = nullableString(row.transfer_ticket_url)
  const ticketKey = nullableString(row.transfer_ticket_key)
  if ((ticketUrl === null) !== (ticketKey === null)) throw new Error('Wholesale order transfer ticket is incomplete')
  if (row.source !== 'customer' && row.source !== 'admin') throw new Error('Wholesale response has an invalid order source')
  return {
    id: requiredString(row.order_id, 'order ID'),
    customerId: requiredString(row.customer_id, 'order customer ID'),
    customerName: requiredString(row.customer_name, 'order customer name'),
    customerMobile: requiredString(row.customer_mobile, 'order customer mobile'),
    customerEmail: nullableString(row.customer_email),
    status: normalizeWholesaleOrderState(row.status),
    paymentMethod: normalizeWholesalePaymentMethod(row.payment_method),
    transferTicket: ticketUrl === null || ticketKey === null ? null : { url: ticketUrl, key: ticketKey },
    totalMxn: Number(row.total_mxn),
    saleId: nullableString(row.sale_id),
    source: row.source,
    createdAt: requiredString(row.created_at, 'order creation time'),
    updatedAt: requiredString(row.updated_at, 'order update time'),
    completedAt: nullableString(row.completed_at),
    cancelledAt: nullableString(row.cancelled_at),
    deletedAt: nullableString(row.deleted_at),
    paymentAmount: row.payment_amount === undefined || row.payment_amount === null ? null : Number(row.payment_amount),
    paymentCurrency: nullableEnum(row.payment_currency, WHOLESALE_PAYMENT_CURRENCIES, 'payment currency'),
    paymentConfirmedAt: nullableString(row.payment_confirmed_at),
    paymentConfirmedBy: nullableString(row.payment_confirmed_by),
    paymentReference: nullableString(row.payment_reference),
    paymentNote: nullableString(row.payment_note),
    deliveryAgreement: nullableEnum(row.delivery_agreement, WHOLESALE_DELIVERY_AGREEMENTS, 'delivery agreement'),
    adminSeenAt: nullableString(row.admin_seen_at),
    adminSeenBy: nullableString(row.admin_seen_by),
    reorderedFromOrderId: nullableString(row.reordered_from_order_id),
    saleGeneration: row.sale_generation === undefined || row.sale_generation === null ? null : Number(row.sale_generation),
    items: Array.isArray(row.items) ? row.items.map(mapWholesaleOrderItem) : [],
  }
}

export function mapWholesaleOrderList(data: unknown): WholesaleOrder[] {
  if (!Array.isArray(data)) return []
  return data.map((row) => mapWholesaleOrder(row))
}

export function mapWholesaleOrderMutation(data: unknown) {
  const row = firstRow(data)
  return {
    id: requiredString(row.order_id, 'order ID'),
    customerId: requiredString(row.customer_id, 'customer ID'),
    status: normalizeWholesaleOrderState(row.status),
    deleted: row.deleted === true,
  }
}

export function mapWholesaleCustomerLogin(data: unknown) {
  const row = firstRow(data)
  if (row.authenticated !== true) {
    return {
      authenticated: false as const,
      failedLoginAttempts: Number(row.failed_login_attempts ?? 0),
      contactAdmin: row.contact_admin === true,
    }
  }
  return {
    authenticated: true as const,
    sessionToken: requiredString(row.session_token, 'customer session token'),
    customer: {
      id: requiredString(row.customer_id, 'customer ID'),
      name: requiredString(row.customer_name, 'customer name'),
      email: nullableString(row.customer_email),
    },
    expiresAt: requiredString(row.expires_at, 'customer session expiration'),
  }
}
