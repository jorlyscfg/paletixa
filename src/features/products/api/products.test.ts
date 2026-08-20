import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { from: vi.fn(), rpc: vi.fn() }, storage: { from: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { createProduct, deactivateProduct, listProducts, removeProductImage, replaceProductImage, updateProduct } from './products'

const row = { id: 'product-1', name: 'Mango', sku: ' M-01 ', category_id: 'category-1', category: { id: 'category-1', name: 'Paletas' }, retail_price_mxn: '42.50', wholesale_price_mxn: '35.00', active: true, tag_assignments: [{ tag: { name: ' sabor ' } }, { tag: { name: 'fruta' } }], image_url: ' https://cdn.example.com/mango.jpg ', image_key: 'products/product-1/mango.jpg', created_at: '2026-08-20T00:00:00Z', updated_at: '2026-08-20T00:00:00Z' }

describe('product catalog API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('validates required fields and non-negative prices before requesting the database', async () => {
    await expect(createProduct({ name: ' ', sku: 'M-01', categoryId: 'category-1', retailPriceMxn: 42, wholesalePriceMxn: 35 })).rejects.toThrow('Product name is required')
    await expect(createProduct({ name: 'Mango', sku: 'M-01', categoryId: 'category-1', retailPriceMxn: -1, wholesalePriceMxn: 35 })).rejects.toThrow('Retail price must be a non-negative number')
    await expect(createProduct({ name: 'Mango', sku: 'M-01', categoryId: 'category-1', retailPriceMxn: 42, wholesalePriceMxn: 35, tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`) })).rejects.toThrow('Tags cannot contain more than 20 tags')
    expect(sdk.database.from).not.toHaveBeenCalled()
  })

  it('lists only the catalog projection and maps MXN prices to numbers', async () => {
    const query = { select: vi.fn(), order: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.select.mockReturnValue(query); query.order.mockResolvedValue({ data: [row], error: null })
    await expect(listProducts()).resolves.toEqual([{ id: 'product-1', name: 'Mango', sku: 'M-01', category: 'Paletas', categoryId: 'category-1', retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true, tags: ['Sabor', 'Fruta'], imageUrl: row.image_url, imageKey: row.image_key, createdAt: row.created_at, updatedAt: row.updated_at }])
    expect(query.select).toHaveBeenCalledWith('id, name, sku, category_id, category:product_categories(id, name), retail_price_mxn, wholesale_price_mxn, active, tag_assignments:product_tag_assignments(tag:product_tags(name)), image_url, image_key, created_at, updated_at')
  })

  it('maps relation tags, syncs them after create, and re-reads the product', async () => {
    const insertQuery = { insert: vi.fn(), select: vi.fn() }
    const readQuery = { select: vi.fn(), eq: vi.fn() }
    sdk.database.from.mockReturnValueOnce(insertQuery).mockReturnValueOnce(readQuery)
    insertQuery.insert.mockReturnValue(insertQuery); insertQuery.select.mockResolvedValue({ data: [row], error: null })
    readQuery.select.mockReturnValue(readQuery); readQuery.eq.mockResolvedValue({ data: [row], error: null }); sdk.database.rpc.mockResolvedValue({ data: null, error: null })
    await createProduct({ name: ' nIEVE  dE  fRESA ', sku: 'SKU-01', categoryId: ' category-1 ', retailPriceMxn: 42.499, wholesalePriceMxn: 35, tags: [' mANGO  CON   CHILE ', 'MANGO CON CHILE', ' fruta '] })
    expect(insertQuery.insert).toHaveBeenCalledWith([{ name: 'Nieve de fresa', sku: 'Sku-01', category_id: 'category-1', retail_price_mxn: 42.5, wholesale_price_mxn: 35, active: true }])
    expect(sdk.database.rpc).toHaveBeenCalledWith('sync_product_tags', { p_product_id: 'product-1', p_tags: ['Mango con chile', 'Fruta'] })
    expect(readQuery.eq).toHaveBeenCalledWith('id', 'product-1')
  })

  it('updates fields without a legacy tags column and syncs the normalized assignments', async () => {
    const updateQuery = { update: vi.fn(), eq: vi.fn(), select: vi.fn() }
    const readQuery = { select: vi.fn(), eq: vi.fn() }
    sdk.database.from.mockReturnValueOnce(updateQuery).mockReturnValueOnce(readQuery)
    updateQuery.update.mockReturnValue(updateQuery); updateQuery.eq.mockReturnValue(updateQuery); updateQuery.select.mockResolvedValue({ data: [row], error: null })
    readQuery.select.mockReturnValue(readQuery); readQuery.eq.mockResolvedValue({ data: [row], error: null }); sdk.database.rpc.mockResolvedValue({ data: null, error: null })
    await updateProduct('product-1', { name: 'nIEVE  dE  fRESA', sku: 'SKU-01', categoryId: ' category-2 ', retailPriceMxn: 50, tags: [' mANGO  CON   CHILE ', 'MANGO CON CHILE'] })
    expect(updateQuery.update).toHaveBeenCalledWith({ name: 'Nieve de fresa', sku: 'Sku-01', category_id: 'category-2', retail_price_mxn: 50 }); expect(updateQuery.eq).toHaveBeenCalledWith('id', 'product-1')
    expect(sdk.database.rpc).toHaveBeenCalledWith('sync_product_tags', { p_product_id: 'product-1', p_tags: ['Mango con chile'] })
  })

  it('clears all tag assignments when updating with an empty tag list', async () => {
    const readQuery = { select: vi.fn(), eq: vi.fn() }
    sdk.database.from.mockReturnValue(readQuery); readQuery.select.mockReturnValue(readQuery); readQuery.eq.mockResolvedValue({ data: [row], error: null }); sdk.database.rpc.mockResolvedValue({ data: null, error: null })
    await updateProduct('product-1', { tags: [] })
    expect(readQuery.select).toHaveBeenCalledWith(expect.stringContaining('tag_assignments:product_tag_assignments'))
    expect(sdk.database.rpc).toHaveBeenCalledWith('sync_product_tags', { p_product_id: 'product-1', p_tags: [] })
    expect(readQuery.eq).toHaveBeenCalledWith('id', 'product-1')
  })

  it('deactivates a product through the regular product update path', async () => {
    const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.update.mockReturnValue(query); query.eq.mockReturnValue(query); query.select.mockResolvedValue({ data: [row], error: null })
    await deactivateProduct('product-1')
    expect(query.update).toHaveBeenCalledWith({ active: false })
    expect(query.eq).toHaveBeenCalledWith('id', 'product-1')
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
