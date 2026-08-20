import { insforge } from '../../../lib/insforge'
import { normalizeCapitalizedText } from '../../../lib/textNormalization'

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

export function normalizeProductTags(value: unknown, field = 'Tags') {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`)
  if (value.length > MAX_PRODUCT_TAGS) throw new Error(`${field} cannot contain more than ${MAX_PRODUCT_TAGS} tags`)

  const seen = new Set<string>()
  const normalized: string[] = []
  for (const tag of value) {
    if (typeof tag !== 'string') throw new Error(`${field} must contain only strings`)
    const normalizedTag = normalizeCapitalizedText(tag)
    if (normalizedTag === '') continue
    if (normalizedTag.length > MAX_PRODUCT_TAG_LENGTH) throw new Error(`${field} cannot contain tags longer than ${MAX_PRODUCT_TAG_LENGTH} characters`)
    const identity = normalizedTag.toLocaleLowerCase()
    if (!seen.has(identity)) {
      seen.add(identity)
      normalized.push(normalizedTag)
    }
  }
  return normalized
}

function mapProductTag(data: unknown): ProductTag {
  const row = (Array.isArray(data) ? data[0] : data) as ProductTagRow | undefined
  if (!row) throw new Error('Product tag response was empty')
  return {
    id: row.id,
    name: normalizeCapitalizedText(row.name),
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
  const normalizedTags = normalizeProductTags(tags)
  const { error } = await insforge.database.rpc('sync_product_tags', {
    p_product_id: id,
    p_tags: normalizedTags,
  })
  if (error) throw error
}
