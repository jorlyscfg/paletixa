import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { getSalesByChannel, getSalesReportDetail, recordSale } from './sales'

describe('sales ledger API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('records POS details through the server RPC and maps replay status', async () => {
    sdk.database.rpc.mockResolvedValue({
      data: [{ sale_id: 'sale-1', channel: 'pos', total_mxn: '72.50', created_at: '2026-08-20T00:00:00Z', result_status: 'replayed' }],
      error: null,
    })
    await expect(recordSale({ requestId: 'request-1', channel: 'pos', details: { channel: 'pos', customerName: 'Ana López', paymentMethod: 'transfer' }, items: [{ productId: 'product-1', quantity: 2 }] })).resolves.toEqual({
      id: 'sale-1', channel: 'pos', totalMxn: 72.5, createdAt: '2026-08-20T00:00:00Z', replayed: true,
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('record_sale', {
      p_request_id: 'request-1', p_channel: 'pos', p_items: [{ product_id: 'product-1', quantity: 2 }],
      p_details: { customer_name: 'Ana López', payment_method: 'transfer' },
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

  it('normalizes an event sale with no advance without a payment method', async () => {
    sdk.database.rpc.mockResolvedValue({
      data: [{ sale_id: 'sale-3', channel: 'event', total_mxn: '72.50', created_at: '2026-08-20T00:00:00Z', result_status: 'created' }],
      error: null,
    })
    await recordSale({
      requestId: 'request-3',
      channel: 'event',
      details: { channel: 'event', eventName: 'Festival de verano', eventDate: '2026-09-12', responsibleName: 'Mariana Torres' },
      items: [{ productId: 'product-1', quantity: 1 }],
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('record_sale', expect.objectContaining({
      p_details: { event_name: 'Festival de verano', event_date: '2026-09-12', responsible_name: 'Mariana Torres' },
    }))
  })

  it('rejects a positive event advance without a payment method before requesting the database', async () => {
    await expect(recordSale({
      requestId: 'request-4',
      channel: 'event',
      details: { channel: 'event', eventName: 'Festival de verano', eventDate: '2026-09-12', responsibleName: 'Mariana Torres', advanceAmountMxn: 250 },
      items: [{ productId: 'product-1', quantity: 1 }],
    })).rejects.toThrow('Advance payment method')
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('normalizes a positive event advance with its payment method', async () => {
    sdk.database.rpc.mockResolvedValue({
      data: [{ sale_id: 'sale-4', channel: 'event', total_mxn: '72.50', created_at: '2026-08-20T00:00:00Z', result_status: 'created' }],
      error: null,
    })
    await recordSale({
      requestId: 'request-5',
      channel: 'event',
      details: { channel: 'event', eventName: '  Festival de verano ', eventDate: '2026-09-12', responsibleName: 'Mariana Torres', advanceAmountMxn: 250, advancePaymentMethod: 'card' },
      items: [{ productId: 'product-1', quantity: 1 }],
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('record_sale', expect.objectContaining({
      p_details: { event_name: 'Festival de verano', event_date: '2026-09-12', responsible_name: 'Mariana Torres', advance_amount_mxn: 250, advance_payment_method: 'card' },
    }))
  })

  it('rejects invalid local sale inputs before requesting the database', async () => {
    const details = { channel: 'pos' as const, paymentMethod: 'cash' as const }
    await expect(recordSale({ requestId: 'request-1', channel: 'pos', details, items: [{ productId: 'product-1', quantity: 0 }] })).rejects.toThrow('positive integer')
    await expect(recordSale({ requestId: 'request-1', channel: 'pos', details, items: [] })).rejects.toThrow('At least one sale item')
    await expect(recordSale({ requestId: 'request-1', channel: 'pos', details: { channel: 'pos', paymentMethod: 'invalid' as never }, items: [{ productId: 'product-1', quantity: 1 }] })).rejects.toThrow('invalid')
    await expect(recordSale({ requestId: 'request-1', channel: 'wholesale', details: { channel: 'wholesale', customerName: '', phone: '55', deliveryMethod: 'delivery', paymentMethod: 'cash' }, items: [{ productId: 'product-1', quantity: 1 }] })).rejects.toThrow('customer name')
    await expect(recordSale({ requestId: 'request-1', channel: 'event', details: { channel: 'event', eventName: 'Evento', eventDate: '2026-02-30', responsibleName: 'Ana', advanceAmountMxn: -1, advancePaymentMethod: 'cash' }, items: [{ productId: 'product-1', quantity: 1 }] })).rejects.toThrow(/ISO date|negative/)
    expect(sdk.database.rpc).not.toHaveBeenCalled()
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

  it('rejects an unbounded detail range before requesting the database', async () => {
    await expect(getSalesReportDetail({ from: '2025-01-01T00:00:00Z', to: '2026-08-21T00:00:00Z' })).rejects.toThrow('limited to 366 days')
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })
})
