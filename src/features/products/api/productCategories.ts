import { insforge } from '../../../lib/insforge'

const PRODUCT_CATEGORY_COLUMNS = 'id, name, normalized_name, created_at, updated_at'
export const PRODUCT_CATEGORY_MAX_LENGTH = 120

export type ProductCategory = {
  id: string
  name: string
  normalizedName: string
  createdAt: string
  updatedAt: string
}

type ProductCategoryRow = {
  id: string
  name: string
  normalized_name: string
  created_at: string
  updated_at: string
}

export function normalizeProductCategoryName(value: unknown, field = 'Category name') {
  if (typeof value !== 'string') throw new Error(`${field} is required`)
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized === '') throw new Error(`${field} is required`)
  if (normalized.length > PRODUCT_CATEGORY_MAX_LENGTH) {
    throw new Error(`${field} cannot exceed ${PRODUCT_CATEGORY_MAX_LENGTH} characters`)
  }
  return normalized
}

export function normalizeProductCategoryIdentity(value: unknown) {
  return normalizeProductCategoryName(value).toLocaleLowerCase()
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`)
  return value.trim()
}

function mapProductCategory(data: unknown): ProductCategory {
  const row = (Array.isArray(data) ? data[0] : data) as ProductCategoryRow | undefined
  if (!row) throw new Error('Category response was empty')
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function isDuplicateProductCategoryError(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown } | null
  const text = [candidate?.code, candidate?.message, candidate?.details].filter(Boolean).join(' ').toLocaleLowerCase()
  return candidate?.code === '23505' || text.includes('product_categories_normalized_name') || text.includes('duplicate key')
}

export function isProductCategoryInUseError(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown } | null
  const text = [candidate?.code, candidate?.message, candidate?.details].filter(Boolean).join(' ').toLocaleLowerCase()
  return candidate?.code === '23503' || text.includes('foreign key') || text.includes('category_id')
}

export function getProductCategoryErrorMessage(error: unknown, operation: 'create' | 'update' | 'delete' = 'create') {
  if (isDuplicateProductCategoryError(error)) {
    return 'Ya existe una categoría con ese nombre. Las mayúsculas y los espacios no crean categorías distintas.'
  }
  if (operation === 'delete' && isProductCategoryInUseError(error)) {
    return 'No se puede eliminar esta categoría porque está asignada a uno o más productos.'
  }
  if (error instanceof Error && error.message) return error.message
  if (operation === 'delete') return 'No se pudo eliminar la categoría.'
  if (operation === 'update') return 'No se pudo actualizar la categoría.'
  return 'No se pudo crear la categoría.'
}

export async function listProductCategories(): Promise<ProductCategory[]> {
  const { data, error } = await insforge.database.from('product_categories').select(PRODUCT_CATEGORY_COLUMNS).order('name')
  if (error) throw error
  return (data ?? []).map((row) => mapProductCategory(row))
}

export async function createProductCategory(name: string): Promise<ProductCategory> {
  const normalizedName = normalizeProductCategoryName(name)
  const { data, error } = await insforge.database.from('product_categories').insert([{ name: normalizedName }]).select(PRODUCT_CATEGORY_COLUMNS)
  if (error) throw error
  return mapProductCategory(data)
}

export async function updateProductCategory(id: string, name: string): Promise<ProductCategory> {
  const categoryId = text(id, 'Category ID')
  const normalizedName = normalizeProductCategoryName(name)
  const { data, error } = await insforge.database.from('product_categories').update({ name: normalizedName }).eq('id', categoryId).select(PRODUCT_CATEGORY_COLUMNS)
  if (error) throw error
  return mapProductCategory(data)
}

export async function deleteProductCategory(id: string): Promise<void> {
  const categoryId = text(id, 'Category ID')
  const { error } = await insforge.database.from('product_categories').delete().eq('id', categoryId)
  if (error) throw error
}
