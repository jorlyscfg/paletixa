import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { listProductTags, syncProductTags } from './productTags'

describe('product tag API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('lists the normalized global tag catalog for autocomplete', async () => {
    const query = { select: vi.fn(), order: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.select.mockReturnValue(query); query.order.mockResolvedValue({ data: [{ id: 'tag-1', name: 'Mango', normalized_name: 'mango', created_at: '2026-08-20T00:00:00Z', updated_at: '2026-08-20T00:00:00Z' }], error: null })
    await expect(listProductTags()).resolves.toEqual([{ id: 'tag-1', name: 'Mango', normalizedName: 'mango', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }])
    expect(query.select).toHaveBeenCalledWith('id, name, normalized_name, created_at, updated_at')
    expect(query.order).toHaveBeenCalledWith('name')
  })

  it('syncs tags through the authenticated RPC without a CRUD insert path', async () => {
    sdk.database.rpc.mockResolvedValue({ data: null, error: null })
    await syncProductTags('product-1', ['Mango', 'con chile'])
    expect(sdk.database.rpc).toHaveBeenCalledWith('sync_product_tags', { p_product_id: 'product-1', p_tags: ['Mango', 'con chile'] })
  })
})
