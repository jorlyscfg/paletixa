import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { listPublicWholesaleCatalog } from './catalog'

describe('public wholesale catalog API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('uses the sanitized catalog RPC and does not map image or admin fields', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{
       product_id: 'product-1', product_name: 'Mango', product_sku: 'M-01', category_id: 'category-1', category_name: 'Paletas',
       retail_price_mxn: '12.50', wholesale_price_mxn: '10.00', image_url: 'https://cdn.example.com/mango.jpg', image_key: 'should-not-be-read', active: true,
    }], error: null })

    await expect(listPublicWholesaleCatalog()).resolves.toEqual([{
       id: 'product-1', name: 'Mango', sku: 'M-01', categoryId: 'category-1', category: 'Paletas', retailPriceMxn: 12.5, wholesalePriceMxn: 10, imageUrl: 'https://cdn.example.com/mango.jpg',
    }])
    expect(sdk.database.rpc).toHaveBeenCalledWith('list_public_wholesale_catalog')
  })
})
