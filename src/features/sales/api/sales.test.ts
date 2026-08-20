import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { getSalesByChannel, recordSale } from './sales'

describe('sales ledger API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('records a typed sale through the server RPC and maps replay status', async () => {
    sdk.database.rpc.mockResolvedValue({
      data: [{ sale_id: 'sale-1', channel: 'wholesale', total_mxn: '72.50', created_at: '2026-08-20T00:00:00Z', result_status: 'replayed' }],
      error: null,
    })
    await expect(recordSale({ requestId: 'request-1', channel: 'wholesale', items: [{ productId: 'product-1', quantity: 2 }] })).resolves.toEqual({
      id: 'sale-1', channel: 'wholesale', totalMxn: 72.5, createdAt: '2026-08-20T00:00:00Z', replayed: true,
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('record_sale', {
      p_request_id: 'request-1', p_channel: 'wholesale', p_items: [{ product_id: 'product-1', quantity: 2 }],
    })
  })

  it('rejects invalid local sale inputs before requesting the database', async () => {
    await expect(recordSale({ requestId: 'request-1', channel: 'pos', items: [{ productId: 'product-1', quantity: 0 }] })).rejects.toThrow('positive integer')
    await expect(recordSale({ requestId: 'request-1', channel: 'pos', items: [] })).rejects.toThrow('At least one sale item')
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
})
