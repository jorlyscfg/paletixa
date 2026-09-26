import { insforge } from '../../../lib/insforge'

export type WholesaleCatalogProduct = {
  id: string
  name: string
  sku: string
  categoryId: string
  category: string
  retailPriceMxn: number
  wholesalePriceMxn: number
  imageUrl: string | null
}

type WholesaleCatalogRow = {
  product_id?: unknown
  product_name?: unknown
  product_sku?: unknown
  category_id?: unknown
  category_name?: unknown
  retail_price_mxn?: unknown
  wholesale_price_mxn?: unknown
  image_url?: unknown
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Public catalog response is missing ${field}`)
  return value.trim()
}

function price(value: unknown, field: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Public catalog response has an invalid ${field}`)
  return Math.round(parsed * 100) / 100
}

function publicImageUrl(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

function mapCatalogRow(value: unknown): WholesaleCatalogProduct {
  const row = value as WholesaleCatalogRow
  return {
    id: requiredString(row.product_id, 'product ID'),
    name: requiredString(row.product_name, 'product name'),
    sku: requiredString(row.product_sku, 'product SKU'),
    categoryId: requiredString(row.category_id, 'category ID'),
    category: requiredString(row.category_name, 'category name'),
    retailPriceMxn: price(row.retail_price_mxn, 'retail price'),
    wholesalePriceMxn: Number(row.wholesale_price_mxn) > 0 ? Math.round(Number(row.wholesale_price_mxn) * 100) / 100 : 0,
    imageUrl: publicImageUrl(row.image_url),
  }
}

export async function listPublicWholesaleCatalog(): Promise<WholesaleCatalogProduct[]> {
  const { data, error } = await insforge.database.rpc('list_public_wholesale_catalog')
  if (error) throw error
  if (!Array.isArray(data)) return []
  return data.map(mapCatalogRow)
}
