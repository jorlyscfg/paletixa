import { insforge } from '../../../lib/insforge'

const PRODUCT_COLUMNS = 'id, name, sku, category, retail_price_mxn, wholesale_price_mxn, active, created_at, updated_at'

export type Product = {
  id: string
  name: string
  sku: string
  category: string
  retailPriceMxn: number
  wholesalePriceMxn: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export type CreateProductInput = {
  name: string
  sku: string
  category: string
  retailPriceMxn: number
  wholesalePriceMxn: number
  active?: boolean
}

export type UpdateProductInput = Partial<CreateProductInput>

type ProductRow = {
  id: string
  name: string
  sku: string
  category: string
  retail_price_mxn: number | string
  wholesale_price_mxn: number | string
  active: boolean
  created_at: string
  updated_at: string
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`)
  return value.trim()
}

function price(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${field} must be a non-negative number`)
  return Math.round(value * 100) / 100
}

function normalizeCreate(input: CreateProductInput) {
  return {
    name: text(input.name, 'Product name'),
    sku: text(input.sku, 'SKU'),
    category: text(input.category, 'Category'),
    retailPriceMxn: price(input.retailPriceMxn, 'Retail price'),
    wholesalePriceMxn: price(input.wholesalePriceMxn, 'Wholesale price'),
    active: input.active ?? true,
  }
}

function normalizeUpdate(input: UpdateProductInput) {
  const result: Record<string, string | number | boolean> = {}
  if (input.name !== undefined) result.name = text(input.name, 'Product name')
  if (input.sku !== undefined) result.sku = text(input.sku, 'SKU')
  if (input.category !== undefined) result.category = text(input.category, 'Category')
  if (input.retailPriceMxn !== undefined) result.retail_price_mxn = price(input.retailPriceMxn, 'Retail price')
  if (input.wholesalePriceMxn !== undefined) result.wholesale_price_mxn = price(input.wholesalePriceMxn, 'Wholesale price')
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') throw new Error('Active state must be boolean')
    result.active = input.active
  }
  if (Object.keys(result).length === 0) throw new Error('At least one product field is required')
  return result
}

function mapProduct(data: unknown): Product {
  const row = (Array.isArray(data) ? data[0] : data) as ProductRow | undefined
  if (!row) throw new Error('Product response was empty')
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    retailPriceMxn: Number(row.retail_price_mxn),
    wholesalePriceMxn: Number(row.wholesale_price_mxn),
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listProducts(): Promise<Product[]> {
  const { data, error } = await insforge.database.from('products').select(PRODUCT_COLUMNS).order('name')
  if (error) throw error
  return (data ?? []).map((row) => mapProduct(row))
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const normalized = normalizeCreate(input)
  const { data, error } = await insforge.database.from('products').insert([{
    name: normalized.name,
    sku: normalized.sku,
    category: normalized.category,
    retail_price_mxn: normalized.retailPriceMxn,
    wholesale_price_mxn: normalized.wholesalePriceMxn,
    active: normalized.active,
  }]).select(PRODUCT_COLUMNS)
  if (error) throw error
  return mapProduct(data)
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const productId = text(id, 'Product ID')
  const { data, error } = await insforge.database.from('products').update(normalizeUpdate(input)).eq('id', productId).select(PRODUCT_COLUMNS)
  if (error) throw error
  return mapProduct(data)
}

export function deactivateProduct(id: string) {
  return updateProduct(id, { active: false })
}
