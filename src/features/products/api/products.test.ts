import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { from: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { createProduct, deactivateProduct, listProducts, updateProduct } from './products'

const row = { id: 'product-1', name: 'Mango', sku: ' M-01 ', category: 'Paletas', retail_price_mxn: '42.50', wholesale_price_mxn: '35.00', active: true, image_url: ' https://cdn.example.com/mango.jpg ', created_at: '2026-08-20T00:00:00Z', updated_at: '2026-08-20T00:00:00Z' }

describe('product catalog API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('validates required fields and non-negative prices before requesting the database', async () => {
    await expect(createProduct({ name: ' ', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42, wholesalePriceMxn: 35 })).rejects.toThrow('Product name is required')
    await expect(createProduct({ name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: -1, wholesalePriceMxn: 35 })).rejects.toThrow('Retail price must be a non-negative number')
    await expect(createProduct({ name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42, wholesalePriceMxn: 35, imageUrl: 'javascript:alert(1)' })).rejects.toThrow('Image URL must be a valid HTTP(S) URL')
    expect(sdk.database.from).not.toHaveBeenCalled()
  })

  it('lists only the catalog projection and maps MXN prices to numbers', async () => {
    const query = { select: vi.fn(), order: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.select.mockReturnValue(query); query.order.mockResolvedValue({ data: [row], error: null })
    await expect(listProducts()).resolves.toEqual([{ id: 'product-1', name: 'Mango', sku: ' M-01 ', category: 'Paletas', retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true, imageUrl: row.image_url, createdAt: row.created_at, updatedAt: row.updated_at }])
    expect(query.select).toHaveBeenCalledWith('id, name, sku, category, retail_price_mxn, wholesale_price_mxn, active, image_url, created_at, updated_at')
  })

  it('creates with the SDK array insert shape and trims text fields', async () => {
    const query = { insert: vi.fn(), select: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.insert.mockReturnValue(query); query.select.mockResolvedValue({ data: [row], error: null })
    await createProduct({ name: ' Mango ', sku: 'M-01', category: ' Paletas ', retailPriceMxn: 42.499, wholesalePriceMxn: 35, imageUrl: ' https://cdn.example.com/mango.jpg ' })
    expect(query.insert).toHaveBeenCalledWith([{ name: 'Mango', sku: 'M-01', category: 'Paletas', retail_price_mxn: 42.5, wholesale_price_mxn: 35, image_url: 'https://cdn.example.com/mango.jpg', active: true }])
  })

  it('updates fields through the typed API and deactivates without delete access', async () => {
    const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.update.mockReturnValue(query); query.eq.mockReturnValue(query); query.select.mockResolvedValue({ data: [row], error: null })
    await updateProduct('product-1', { name: 'Mango Grande', retailPriceMxn: 50, imageUrl: '' })
    expect(query.update).toHaveBeenCalledWith({ name: 'Mango Grande', retail_price_mxn: 50, image_url: null }); expect(query.eq).toHaveBeenCalledWith('id', 'product-1')
    await deactivateProduct('product-1')
    expect(query.update).toHaveBeenLastCalledWith({ active: false })
  })
})
