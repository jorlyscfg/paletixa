import { insforge } from '../../../lib/insforge'

const PRODUCT_TAG_COLUMNS = 'id, name, normalized_name, created_at, updated_at'

export const MAX_PRODUCT_TAGS = 20
export const MAX_PRODUCT_TAG_LENGTH = 48

export type ProductTag = {
  id: string
  name: string
  normalizedName: string
  createdAt: string
  updatedAt: string
}

type ProductTagRow = {
  id: string
  name: string
  normalized_name: string
  created_at: string
  updated_at: string
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`)
  return value.trim()
}

function mapProductTag(data: unknown): ProductTag {
  const row = (Array.isArray(data) ? data[0] : data) as ProductTagRow | undefined
  if (!row) throw new Error('Product tag response was empty')
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listProductTags(): Promise<ProductTag[]> {
  const { data, error } = await insforge.database.from('product_tags').select(PRODUCT_TAG_COLUMNS).order('name')
  if (error) throw error
  return (data ?? []).map((row) => mapProductTag(row))
}

export async function syncProductTags(productId: string, tags: string[]): Promise<void> {
  const id = text(productId, 'Product ID')
  const { error } = await insforge.database.rpc('sync_product_tags', {
    p_product_id: id,
    p_tags: tags,
  })
  if (error) throw error
}
