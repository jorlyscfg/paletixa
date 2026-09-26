import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { cancelWholesaleCustomerOrder, completeWholesaleOrder, createWholesaleAdminOrder, createWholesaleCustomerOrder, deleteWholesaleCustomerOrder, listWholesaleCustomerOrders, markWholesaleOrderSeen, reorderWholesaleCustomerOrder, setWholesaleOrderStatus, updateWholesaleCustomerOrder } from './orders'
import { resolveWholesaleUnitPrice } from './validators'

const orderRow = {
  order_id: 'order-1',
  customer_id: 'customer-1',
  customer_name: 'Tienda La Plaza',
  customer_mobile: '+525512345678',
  customer_email: null,
  status: 'pending',
  payment_method: 'transfer',
  transfer_ticket_url: 'https://example.invalid/ticket',
  transfer_ticket_key: 'orders/1',
  total_mxn: '72.50',
  sale_id: null,
  source: 'customer',
  created_at: '2026-08-23T00:00:00Z',
  updated_at: '2026-08-23T00:00:00Z',
  completed_at: null,
  cancelled_at: null,
  deleted_at: null,
  items: [{ id: 'item-1', line_kind: 'product', product_id: 'product-1', category_id: null, category_name: null, product_name: 'Mango', unit_price_mxn: '72.50', quantity: 1, line_total_mxn: '72.50' }],
}

describe('wholesale order API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('creates a customer order with a session-derived customer and transfer ticket pair', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [orderRow], error: null })
    await expect(createWholesaleCustomerOrder('session-token', {
      requestId: 'request-1',
      items: [{ productId: 'product-1', quantity: 1 }],
      paymentMethod: 'transfer',
      transferTicket: { url: 'https://example.invalid/ticket', key: 'orders/1' },
    })).resolves.toMatchObject({ id: 'order-1', totalMxn: 72.5, status: 'pending' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('create_wholesale_customer_order', {
      p_session_token: 'session-token',
      p_request_id: 'request-1',
      p_items: [{ product_id: 'product-1', quantity: 1 }],
      p_payment_method: 'transfer',
      p_transfer_ticket_url: 'https://example.invalid/ticket',
      p_transfer_ticket_key: 'orders/1',
    })
  })

  it('sends category lines through the customer order payload', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [orderRow], error: null })
    await createWholesaleCustomerOrder('session-token', {
      requestId: 'request-category',
      items: [{ lineKind: 'category', categoryId: 'category-1', quantity: 10 }],
      paymentMethod: 'cash',
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('create_wholesale_customer_order', expect.objectContaining({
      p_items: [{ line_kind: 'category', category_id: 'category-1', quantity: 10 }],
    }))
  })

  it('lists only server-projected customer orders and cancels through a reasoned RPC', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [orderRow], error: null })
    await expect(listWholesaleCustomerOrders('session-token')).resolves.toHaveLength(1)
    expect(sdk.database.rpc).toHaveBeenCalledWith('list_wholesale_customer_orders', { p_session_token: 'session-token' })

    sdk.database.rpc.mockResolvedValue({ data: [{ ...orderRow, status: 'cancelled', cancelled_at: '2026-08-23T01:00:00Z' }], error: null })
    await expect(cancelWholesaleCustomerOrder('session-token', {
      requestId: 'request-2', orderId: 'order-1', reason: 'Customer changed the order',
    })).resolves.toMatchObject({ status: 'cancelled' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('cancel_wholesale_customer_order', {
      p_session_token: 'session-token', p_request_id: 'request-2', p_order_id: 'order-1', p_reason: 'Customer changed the order',
    })
  })

  it('requires a customer reference and sends the admin initial-state selector', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{ ...orderRow, source: 'admin', status: 'processing' }], error: null })
    await expect(createWholesaleAdminOrder({
      requestId: 'request-3', customerId: 'customer-1', initialStatus: 'processing',
      items: [{ productId: 'product-1', quantity: 2 }], paymentMethod: 'cash',
    })).resolves.toMatchObject({ source: 'admin', status: 'processing' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('create_wholesale_admin_order', {
      p_request_id: 'request-3', p_customer_id: 'customer-1',
      p_items: [{ product_id: 'product-1', quantity: 2 }], p_payment_method: 'cash',
      p_transfer_ticket_url: null, p_transfer_ticket_key: null, p_initial_status: 'processing',
      p_completion: null, p_reason: null,
    })
  })

  it('uses retail below ten and positive wholesale pricing at ten or more', () => {
    expect(resolveWholesaleUnitPrice(12.5, 10, 1)).toBe(12.5)
    expect(resolveWholesaleUnitPrice(12.5, 10, 9)).toBe(12.5)
    expect(resolveWholesaleUnitPrice(12.5, 10, 10)).toBe(10)
    expect(resolveWholesaleUnitPrice(12.5, 0, 10)).toBe(12.5)
  })

  it('requires completion data and routes completion through the dedicated RPC', async () => {
    await expect(createWholesaleAdminOrder({
      requestId: 'request-completed-missing-data', customerId: 'customer-1', initialStatus: 'completed',
      items: [{ productId: 'product-1', quantity: 1 }], paymentMethod: 'cash',
    })).rejects.toThrow('Completion data is required')
    expect(sdk.database.rpc).not.toHaveBeenCalled()

    sdk.database.rpc.mockResolvedValue({ data: [{ ...orderRow, status: 'completed', sale_id: 'sale-2', payment_amount: '72.50', payment_currency: 'mxn', payment_confirmed_at: '2026-08-23T01:00:00Z', payment_confirmed_by: 'admin-1', delivery_agreement: 'pickup' }], error: null })
    await expect(completeWholesaleOrder({
      requestId: 'request-complete', orderId: 'order-1',
      completion: { paymentAmount: 72.5, paymentCurrency: 'mxn', deliveryAgreement: 'pickup' },
      reason: 'Pago confirmado por administración',
    })).resolves.toMatchObject({ status: 'completed', paymentAmount: 72.5, deliveryAgreement: 'pickup' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('complete_wholesale_order', {
      p_request_id: 'request-complete', p_order_id: 'order-1',
      p_completion: { payment_amount: 72.5, payment_currency: 'mxn', payment_reference: null, payment_note: null, delivery_agreement: 'pickup' },
      p_reason: 'Pago confirmado por administración',
    })
  })

  it('does not let the status API bypass completed-order validation', async () => {
    await expect(setWholesaleOrderStatus({ requestId: 'request-status-completed', orderId: 'order-1', status: 'completed', reason: 'Complete' })).rejects.toThrow('completion data')
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('supports reorder, customer delete, and admin seen request contracts', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [orderRow], error: null })
    await reorderWholesaleCustomerOrder('session-token', {
      requestId: 'request-reorder', orderId: 'order-1', items: [{ productId: 'product-1', quantity: 10 }], paymentMethod: 'transfer',
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('reorder_wholesale_customer_order', expect.objectContaining({ p_order_id: 'order-1', p_items: [{ product_id: 'product-1', quantity: 10 }] }))

    await deleteWholesaleCustomerOrder('session-token', { requestId: 'request-customer-delete', orderId: 'order-1', reason: 'No longer needed' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('delete_wholesale_customer_order', expect.objectContaining({ p_order_id: 'order-1', p_reason: 'No longer needed' }))

    await markWholesaleOrderSeen({ requestId: 'request-seen', orderId: 'order-1' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('mark_wholesale_order_seen', { p_request_id: 'request-seen', p_order_id: 'order-1' })
  })

  it('updates the original customer order through the customer update RPC', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [orderRow], error: null })

    await updateWholesaleCustomerOrder('session-token', {
      requestId: 'request-update',
      orderId: 'order-1',
      items: [{ productId: 'product-1', quantity: 3 }],
      paymentMethod: 'transfer',
      transferTicket: { url: 'https://example.invalid/refreshed-ticket', key: 'customers/customer-1/file.webp' },
    })

    expect(sdk.database.rpc).toHaveBeenCalledWith('update_wholesale_customer_order', {
      p_session_token: 'session-token',
      p_request_id: 'request-update',
      p_order_id: 'order-1',
      p_items: [{ product_id: 'product-1', quantity: 3 }],
      p_payment_method: 'transfer',
      p_transfer_ticket_url: 'https://example.invalid/refreshed-ticket',
      p_transfer_ticket_key: 'customers/customer-1/file.webp',
    })
  })
})
