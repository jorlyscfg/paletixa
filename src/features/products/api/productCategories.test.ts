import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { from: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import {
  createProductCategory,
  deleteProductCategory,
  getProductCategoryErrorMessage,
  isDuplicateProductCategoryError,
  listProductCategories,
  normalizeProductCategoryIdentity,
  normalizeProductCategoryName,
  updateProductCategory,
} from './productCategories'

const row = { id: 'category-1', name: 'Paletas con chile', normalized_name: 'paletas con chile', created_at: '2026-08-20T00:00:00Z', updated_at: '2026-08-20T00:00:00Z' }

describe('product category API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('canonicalizes display names and identities by trimming and collapsing whitespace', () => {
    expect(normalizeProductCategoryName('  Paletas   con   chile  ')).toBe('Paletas con chile')
    expect(normalizeProductCategoryIdentity('  Paletas   CON chile  ')).toBe('paletas con chile')
    expect(() => normalizeProductCategoryName('   ')).toThrow('Category name is required')
  })

  it('lists the category projection in name order and maps database fields', async () => {
    const query = { select: vi.fn(), order: vi.fn() }
    sdk.database.from.mockReturnValue(query)
    query.select.mockReturnValue(query)
    query.order.mockResolvedValue({ data: [row], error: null })

    await expect(listProductCategories()).resolves.toEqual([{ id: row.id, name: row.name, normalizedName: row.normalized_name, createdAt: row.created_at, updatedAt: row.updated_at }])
    expect(sdk.database.from).toHaveBeenCalledWith('product_categories')
    expect(query.select).toHaveBeenCalledWith('id, name, normalized_name, created_at, updated_at')
    expect(query.order).toHaveBeenCalledWith('name')
  })

  it('creates and updates with array inserts and canonical names', async () => {
    const insertQuery = { insert: vi.fn(), select: vi.fn() }
    sdk.database.from.mockReturnValue(insertQuery)
    insertQuery.insert.mockReturnValue(insertQuery)
    insertQuery.select.mockResolvedValue({ data: [row], error: null })
    await createProductCategory('  Paletas   con chile ')
    expect(insertQuery.insert).toHaveBeenCalledWith([{ name: 'Paletas con chile' }])

    const updateQuery = { update: vi.fn(), eq: vi.fn(), select: vi.fn() }
    sdk.database.from.mockReturnValue(updateQuery)
    updateQuery.update.mockReturnValue(updateQuery)
    updateQuery.eq.mockReturnValue(updateQuery)
    updateQuery.select.mockResolvedValue({ data: [row], error: null })
    await updateProductCategory(' category-1 ', ' Helados   cremosos ')
    expect(updateQuery.update).toHaveBeenCalledWith({ name: 'Helados cremosos' })
    expect(updateQuery.eq).toHaveBeenCalledWith('id', 'category-1')
  })

  it('deletes by id and identifies duplicate names with actionable copy', async () => {
    const query = { delete: vi.fn(), eq: vi.fn() }
    sdk.database.from.mockReturnValue(query)
    query.delete.mockReturnValue(query)
    query.eq.mockResolvedValue({ error: null })
    await deleteProductCategory('category-1')
    expect(query.delete).toHaveBeenCalledOnce()
    expect(query.eq).toHaveBeenCalledWith('id', 'category-1')

    const duplicate = { code: '23505', message: 'product_categories_normalized_name' }
    expect(isDuplicateProductCategoryError(duplicate)).toBe(true)
    expect(getProductCategoryErrorMessage(duplicate, 'create')).toContain('mayúsculas y los espacios')
    expect(getProductCategoryErrorMessage({ code: '23503' }, 'delete')).toContain('asignada a uno o más productos')
  })
})
