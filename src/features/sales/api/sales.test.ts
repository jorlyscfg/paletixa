import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { getReportDashboardSnapshot, getSalesByChannel, getSalesReportDetail, REPORT_TIMEZONE, recordSale } from './sales'

describe('sales ledger API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('records POS details through the server RPC and maps replay status', async () => {
    sdk.database.rpc.mockResolvedValue({
      data: [{ sale_id: 'sale-1', channel: 'pos', total_mxn: '72.50', created_at: '2026-08-20T00:00:00Z', result_status: 'replayed' }],
      error: null,
    })
    await expect(recordSale({ requestId: 'request-1', channel: 'pos', details: { channel: 'pos', customerName: 'Ana López', paymentMethod: 'card' }, items: [{ productId: 'product-1', quantity: 2 }] })).resolves.toEqual({
      id: 'sale-1', channel: 'pos', totalMxn: 72.5, createdAt: '2026-08-20T00:00:00Z', replayed: true,
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('record_sale', {
      p_request_id: 'request-1', p_channel: 'pos', p_items: [{ product_id: 'product-1', quantity: 2 }],
       p_details: { customer_name: 'Ana López', payment_method: 'card' },
    })
  })

  it('normalizes wholesale details into the server payload', async () => {
    sdk.database.rpc.mockResolvedValue({
      data: [{ sale_id: 'sale-2', channel: 'wholesale', total_mxn: '72.50', created_at: '2026-08-20T00:00:00Z', result_status: 'created' }],
      error: null,
    })
    await recordSale({
      requestId: 'request-2',
      channel: 'wholesale',
      details: { channel: 'wholesale', customerName: '  Tienda La Plaza ', phone: ' 55 1234 5678 ', deliveryMethod: 'pickup', paymentMethod: 'credit' },
      items: [{ productId: 'product-1', quantity: 2 }],
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('record_sale', expect.objectContaining({
      p_details: { customer_name: 'Tienda La Plaza', phone: '55 1234 5678', delivery_method: 'pickup', payment_method: 'credit' },
    }))
  })

  it('rejects direct event sales before requesting the database', async () => {
    await expect(recordSale({
      requestId: 'request-3',
      channel: 'event',
      details: { channel: 'event' },
      items: [{ productId: 'product-1', quantity: 1 }],
    })).rejects.toThrow('Event sales must be completed from an event reservation')
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('rejects invalid local sale inputs before requesting the database', async () => {
    const details = { channel: 'pos' as const, paymentMethod: 'cash' as const }
    await expect(recordSale({ requestId: 'request-1', channel: 'pos', details, items: [{ productId: 'product-1', quantity: 0 }] })).rejects.toThrow('positive integer')
    await expect(recordSale({ requestId: 'request-1', channel: 'pos', details, items: [] })).rejects.toThrow('At least one sale item')
    await expect(recordSale({ requestId: 'request-1', channel: 'pos', details: { channel: 'pos', paymentMethod: 'invalid' as never }, items: [{ productId: 'product-1', quantity: 1 }] })).rejects.toThrow('invalid')
    await expect(recordSale({ requestId: 'request-1', channel: 'wholesale', details: { channel: 'wholesale', customerName: '', phone: '55', deliveryMethod: 'delivery', paymentMethod: 'cash' }, items: [{ productId: 'product-1', quantity: 1 }] })).rejects.toThrow('customer name')
    await expect(recordSale({ requestId: 'request-1', channel: 'event', details: { channel: 'event' }, items: [{ productId: 'product-1', quantity: 1 }] })).rejects.toThrow('Event sales must be completed from an event reservation')
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('restricts POS payment methods to cash and card while allowing optional USD cash', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{ sale_id: 'sale-usd', channel: 'pos', total_mxn: '150.00', created_at: '2026-08-20T00:00:00Z', result_status: 'created' }], error: null })
    await expect(recordSale({ requestId: 'request-pos-transfer', channel: 'pos', details: { channel: 'pos', paymentMethod: 'transfer' as never }, items: [{ productId: 'product-1', quantity: 1 }] })).rejects.toThrow('invalid')
    await expect(recordSale({ requestId: 'request-pos-usd', channel: 'pos', details: { channel: 'pos', paymentMethod: 'cash', paymentCurrency: 'usd', usdPaid: 10, usdMxnRate: 15 }, items: [{ productId: 'product-1', quantity: 1 }] })).resolves.toBeDefined()
    expect(sdk.database.rpc).toHaveBeenLastCalledWith('record_sale', expect.objectContaining({ p_details: { payment_method: 'cash', payment_currency: 'usd', usd_mxn_rate: 15, usd_paid: 10 } }))
  })

  it('normalizes generic category lines without inventing a product id', async () => {
    sdk.database.rpc.mockResolvedValue({
      data: [{ sale_id: 'sale-category', channel: 'pos', total_mxn: '42.50', created_at: '2026-08-20T00:00:00Z', result_status: 'created' }],
      error: null,
    })
    await recordSale({ requestId: 'request-category', channel: 'pos', details: { channel: 'pos', paymentMethod: 'cash' }, items: [{ lineKind: 'category', categoryId: 'category-1', quantity: 1 }] })
    expect(sdk.database.rpc).toHaveBeenCalledWith('record_sale', expect.objectContaining({ p_items: [{ line_kind: 'category', category_id: 'category-1', quantity: 1 }] }))
  })

  it('maps all server-provided channel report rows and sends the bounded range', async () => {
    sdk.database.rpc.mockResolvedValue({
      data: [
        { channel: 'pos', sale_count: '2', total_mxn: '100.00' },
        { channel: 'wholesale', sale_count: 1, total_mxn: '72.50' },
        { channel: 'event', sale_count: 0, total_mxn: '0.00' },
      ],
      error: null,
    })
    await expect(getSalesByChannel({ from: '2026-08-20T00:00:00Z', to: '2026-08-21T00:00:00Z' })).resolves.toEqual([
      { channel: 'pos', saleCount: 2, totalMxn: 100 },
      { channel: 'wholesale', saleCount: 1, totalMxn: 72.5 },
      { channel: 'event', saleCount: 0, totalMxn: 0 },
    ])
    expect(sdk.database.rpc).toHaveBeenCalledWith('report_sales_by_channel', {
      p_from: '2026-08-20T00:00:00Z', p_to: '2026-08-21T00:00:00Z',
    })
  })

  it('rejects an unbounded report range before requesting the database', async () => {
    await expect(getSalesByChannel({ from: '2025-01-01T00:00:00Z', to: '2026-08-21T00:00:00Z' })).rejects.toThrow('limited to 366 days')
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('maps server-authoritative detail rows and sends the same bounded range', async () => {
    sdk.database.rpc.mockResolvedValue({
      data: [{
        sale_id: 'sale-1', sale_date: '2026-08-20T12:30:00Z', channel: 'wholesale', total_mxn: '145.00',
        product_name: 'Mango', quantity: '2', line_total_mxn: '145.00', context_label: 'Tienda La Plaza',
      }],
      error: null,
    })
    await expect(getSalesReportDetail({ from: '2026-08-20T00:00:00Z', to: '2026-08-21T00:00:00Z' })).resolves.toEqual([{
      saleId: 'sale-1', saleDate: '2026-08-20T12:30:00Z', channel: 'wholesale', totalMxn: 145,
      productName: 'Mango', quantity: 2, lineTotalMxn: 145, contextLabel: 'Tienda La Plaza',
    }])
    expect(sdk.database.rpc).toHaveBeenCalledWith('report_sales_detail', {
      p_from: '2026-08-20T00:00:00Z', p_to: '2026-08-21T00:00:00Z', p_limit: 100,
    })
  })

  it('maps category sale lines without replacing their category identity with a product id', async () => {
    sdk.database.rpc.mockResolvedValue({
      data: [{ sale_id: 'sale-category', sale_date: '2026-08-20T12:30:00Z', channel: 'pos', total_mxn: '85.00', product_name: 'Paletas', quantity: 2, line_total_mxn: '85.00', context_label: null, line_kind: 'category', category_id: 'category-1', category_name: 'Paletas' }],
      error: null,
    })
    await expect(getSalesReportDetail({ from: '2026-08-20T00:00:00Z', to: '2026-08-21T00:00:00Z' })).resolves.toEqual([{
      saleId: 'sale-category', saleDate: '2026-08-20T12:30:00Z', channel: 'pos', totalMxn: 85,
      productName: 'Paletas', quantity: 2, lineTotalMxn: 85, contextLabel: null,
      lineKind: 'category', categoryId: 'category-1', categoryName: 'Paletas',
    }])
  })

  it('maps event sale context without mixing it into non-event rows', async () => {
    sdk.database.rpc.mockResolvedValue({
      data: [{
        sale_id: 'event-sale', sale_date: '2099-09-12T12:30:00Z', channel: 'event', total_mxn: '250.00', product_name: 'Mango', quantity: '2', line_total_mxn: '250.00', context_label: 'Mariana Torres',
        event_date: '2099-09-12', contact_name: 'Mariana Torres', contact_phone: '+525512345678', contact_email: 'mariana@example.com',
        initial_payment_amount: '100.00', initial_payment_method: 'transfer', final_payment_amount: '150.00', final_payment_method: 'cash', reservation_status: 'completed',
      }],
      error: null,
    })
    await expect(getSalesReportDetail({ from: '2099-09-12T00:00:00Z', to: '2099-09-13T00:00:00Z' })).resolves.toEqual([{
      saleId: 'event-sale', saleDate: '2099-09-12T12:30:00Z', channel: 'event', totalMxn: 250,
      productName: 'Mango', quantity: 2, lineTotalMxn: 250, contextLabel: 'Mariana Torres',
      eventDate: '2099-09-12', contactName: 'Mariana Torres', contactPhone: '+525512345678', contactEmail: 'mariana@example.com',
      initialPaymentAmount: 100, initialPaymentMethod: 'transfer', finalPaymentAmount: 150, finalPaymentMethod: 'cash', reservationStatus: 'completed',
    }])
  })

  it('rejects an unbounded detail range before requesting the database', async () => {
    await expect(getSalesReportDetail({ from: '2025-01-01T00:00:00Z', to: '2026-08-21T00:00:00Z' })).rejects.toThrow('limited to 366 days')
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('keeps the legacy report adapters separate from the complete dashboard snapshot', async () => {
    sdk.database.rpc.mockResolvedValue({
      data: {
        from: '2026-08-20', to: '2026-08-20', timezone: REPORT_TIMEZONE,
        utc_from: '2026-08-20T06:00:00.000Z', utc_to: '2026-08-21T06:00:00.000Z',
        scope: { kind: 'all', branch_id: null, branch_name: null, includes_unassigned: true },
        sales: {
          total_mxn: '42.50', count: 1, average_ticket_mxn: '42.50', average_state: 'value',
          channels: [{ channel: 'pos', sale_count: 1, total_mxn: '42.50' }],
          daily: [{ date: '2026-08-20', sale_count: 1, total_mxn: '42.50' }],
          products: [{ line_kind: 'product', product_id: 'product-1', product_name: 'Mango', category_id: null, category_name: null, quantity: 1, total_mxn: '42.50' }],
        },
        operations: {
          wholesale: { scope: 'global', pending_count: 0, processing_count: 0, workload_count: 0 },
          event: { scope: 'global', pending_count: 0, reserved_count: 0, allocated_count: 0, capacity_limit: 7, available_count: 7 },
          pos: { scope: 'all', open_shift_count: 1 },
        },
      },
      error: null,
    })

    await expect(getReportDashboardSnapshot({ from: '2026-08-20', to: '2026-08-20', timezone: REPORT_TIMEZONE })).resolves.toMatchObject({ sales: { totalMxn: 42.5, count: 1, products: [{ productName: 'Mango', quantity: 1 }] } })
    expect(sdk.database.rpc).toHaveBeenCalledTimes(1)
    expect(sdk.database.rpc).toHaveBeenCalledWith('report_dashboard_snapshot', expect.objectContaining({ p_from: '2026-08-20', p_to: '2026-08-20', p_timezone: REPORT_TIMEZONE }))
  })
})
