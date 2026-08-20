import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { from: vi.fn() }, storage: { from: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { createProduct, deactivateProduct, listProducts, removeProductImage, replaceProductImage, updateProduct } from './products'

const row = { id: 'product-1', name: 'Mango', sku: ' M-01 ', category: 'Paletas', retail_price_mxn: '42.50', wholesale_price_mxn: '35.00', active: true, tags: [' sabor ', 'fruta'], image_url: ' https://cdn.example.com/mango.jpg ', image_key: 'products/product-1/mango.jpg', created_at: '2026-08-20T00:00:00Z', updated_at: '2026-08-20T00:00:00Z' }

describe('product catalog API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('validates required fields and non-negative prices before requesting the database', async () => {
    await expect(createProduct({ name: ' ', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42, wholesalePriceMxn: 35 })).rejects.toThrow('Product name is required')
    await expect(createProduct({ name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: -1, wholesalePriceMxn: 35 })).rejects.toThrow('Retail price must be a non-negative number')
    await expect(createProduct({ name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42, wholesalePriceMxn: 35, tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`) })).rejects.toThrow('Tags cannot contain more than 20 tags')
    expect(sdk.database.from).not.toHaveBeenCalled()
  })

  it('lists only the catalog projection and maps MXN prices to numbers', async () => {
    const query = { select: vi.fn(), order: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.select.mockReturnValue(query); query.order.mockResolvedValue({ data: [row], error: null })
    await expect(listProducts()).resolves.toEqual([{ id: 'product-1', name: 'Mango', sku: ' M-01 ', category: 'Paletas', retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true, tags: ['sabor', 'fruta'], imageUrl: row.image_url, imageKey: row.image_key, createdAt: row.created_at, updatedAt: row.updated_at }])
    expect(query.select).toHaveBeenCalledWith('id, name, sku, category, retail_price_mxn, wholesale_price_mxn, active, tags, image_url, image_key, created_at, updated_at')
  })

  it('creates with the SDK array insert shape and trims text fields', async () => {
    const query = { insert: vi.fn(), select: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.insert.mockReturnValue(query); query.select.mockResolvedValue({ data: [row], error: null })
    await createProduct({ name: ' Mango ', sku: 'M-01', category: ' Paletas ', retailPriceMxn: 42.499, wholesalePriceMxn: 35, tags: [' sabor ', 'SABOR', ' fruta '] })
    expect(query.insert).toHaveBeenCalledWith([{ name: 'Mango', sku: 'M-01', category: 'Paletas', retail_price_mxn: 42.5, wholesale_price_mxn: 35, tags: ['sabor', 'fruta'], active: true }])
  })

  it('updates fields through the typed API and deactivates without delete access', async () => {
    const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.update.mockReturnValue(query); query.eq.mockReturnValue(query); query.select.mockResolvedValue({ data: [row], error: null })
    await updateProduct('product-1', { name: 'Mango Grande', retailPriceMxn: 50, tags: [' con chile ', 'CON CHILE'] })
    expect(query.update).toHaveBeenCalledWith({ name: 'Mango Grande', retail_price_mxn: 50, tags: ['con chile'] }); expect(query.eq).toHaveBeenCalledWith('id', 'product-1')
    await deactivateProduct('product-1')
    expect(query.update).toHaveBeenLastCalledWith({ active: false })
  })

  it('replaces an image, persists both storage references, and removes the old object', async () => {
    const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn() }
    const bucket = { upload: vi.fn(), remove: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.update.mockReturnValue(query); query.eq.mockReturnValue(query); query.select.mockResolvedValue({ data: [row], error: null })
    sdk.storage.from.mockReturnValue(bucket); bucket.upload.mockResolvedValue({ data: { key: 'products/product-1/new.webp', url: 'https://storage.example.com/new.webp' }, error: null }); bucket.remove.mockResolvedValue({ data: { message: 'Object deleted successfully' }, error: null })

    const file = new File(['image'], 'mango.webp', { type: 'image/webp' })
    await replaceProductImage('product-1', { imageUrl: row.image_url, imageKey: row.image_key }, file)
    expect(bucket.upload).toHaveBeenCalledWith(expect.stringMatching(/^products\/product-1\//), file)
    expect(query.update).toHaveBeenCalledWith({ image_url: 'https://storage.example.com/new.webp', image_key: 'products/product-1/new.webp' })
    expect(bucket.remove).toHaveBeenCalledWith(row.image_key)
  })

  it('does not update the database when image upload fails', async () => {
    const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn() }
    const bucket = { upload: vi.fn(), remove: vi.fn() }
    sdk.database.from.mockReturnValue(query); sdk.storage.from.mockReturnValue(bucket); bucket.upload.mockResolvedValue({ data: null, error: new Error('storage unavailable') })

    await expect(replaceProductImage('product-1', { imageUrl: row.image_url, imageKey: row.image_key }, new File(['image'], 'mango.webp', { type: 'image/webp' }))).rejects.toThrow('storage unavailable')
    expect(query.update).not.toHaveBeenCalled()
  })

  it('cleans up a newly uploaded object when the image association fails', async () => {
    const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn() }
    const bucket = { upload: vi.fn(), remove: vi.fn() }
    const databaseError = new Error('database unavailable')
    sdk.database.from.mockReturnValue(query); query.update.mockReturnValue(query); query.eq.mockReturnValue(query); query.select.mockResolvedValue({ data: null, error: databaseError })
    sdk.storage.from.mockReturnValue(bucket); bucket.upload.mockResolvedValue({ data: { key: 'products/product-1/new.webp', url: 'https://storage.example.com/new.webp' }, error: null }); bucket.remove.mockResolvedValue({ data: { message: 'Object deleted successfully' }, error: null })

    await expect(replaceProductImage('product-1', { imageUrl: row.image_url, imageKey: row.image_key }, new File(['image'], 'mango.webp', { type: 'image/webp' }))).rejects.toThrow('database unavailable')
    expect(bucket.remove).toHaveBeenCalledWith('products/product-1/new.webp')
  })

  it('does not touch storage when removing a legacy URL without a key', async () => {
    const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.update.mockReturnValue(query); query.eq.mockReturnValue(query); query.select.mockResolvedValue({ data: [row], error: null })
    await removeProductImage('product-1', { imageUrl: 'https://legacy.example.com/mango.jpg', imageKey: null })
    expect(sdk.storage.from).not.toHaveBeenCalled()
    expect(query.update).toHaveBeenCalledWith({ image_url: null, image_key: null })
  })

  it('keeps the database association untouched when storage removal fails', async () => {
    const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn() }
    const bucket = { remove: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.update.mockReturnValue(query); query.eq.mockReturnValue(query); query.select.mockResolvedValue({ data: [row], error: null }); sdk.storage.from.mockReturnValue(bucket); bucket.remove.mockResolvedValue({ data: null, error: new Error('storage unavailable') })
    await expect(removeProductImage('product-1', { imageUrl: row.image_url, imageKey: row.image_key })).rejects.toThrow('existing object was kept')
    expect(query.update).toHaveBeenNthCalledWith(1, { image_url: null, image_key: null })
    expect(query.update).toHaveBeenNthCalledWith(2, { image_url: row.image_url, image_key: row.image_key })
  })
})
