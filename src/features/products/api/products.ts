import { insforge } from '../../../lib/insforge'
import { MAX_PRODUCT_TAG_LENGTH, MAX_PRODUCT_TAGS, syncProductTags } from './productTags'

export { MAX_PRODUCT_TAG_LENGTH, MAX_PRODUCT_TAGS } from './productTags'

const PRODUCT_COLUMNS = 'id, name, sku, category_id, category:product_categories(id, name), retail_price_mxn, wholesale_price_mxn, active, tag_assignments:product_tag_assignments(tag:product_tags(name)), image_url, image_key, created_at, updated_at'

export const PRODUCT_IMAGE_BUCKET = 'product-images'
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const PRODUCT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type Product = {
  id: string
  name: string
  sku: string
  category: string
  categoryId: string
  retailPriceMxn: number
  wholesalePriceMxn: number
  active: boolean
  tags: string[]
  imageUrl: string | null
  imageKey: string | null
  createdAt: string
  updatedAt: string
}

export type CreateProductInput = {
  name: string
  sku: string
  categoryId: string
  retailPriceMxn: number
  wholesalePriceMxn: number
  tags?: string[]
  active?: boolean
}

export type UpdateProductInput = Partial<CreateProductInput>

export type ProductImageReference = Pick<Product, 'imageUrl' | 'imageKey'>

export type ProductImage = {
  url: string
  key: string
}

type ProductImageAssociation = {
  url: string | null
  key: string | null
}

type ProductRow = {
  id: string
  name: string
  sku: string
  category_id: string
  category: { id: string; name: string } | null
  retail_price_mxn: number | string
  wholesale_price_mxn: number | string
  active: boolean
  tag_assignments: Array<{ tag: { name: string } | Array<{ name: string }> | null }> | null
  image_url: string | null
  image_key: string | null
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

export function normalizeProductTags(value: unknown, field = 'Tags') {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`)
  if (value.length > MAX_PRODUCT_TAGS) throw new Error(`${field} cannot contain more than ${MAX_PRODUCT_TAGS} tags`)

  const seen = new Set<string>()
  const normalized: string[] = []
  for (const tag of value) {
    if (typeof tag !== 'string') throw new Error(`${field} must contain only strings`)
    const trimmed = tag.trim().replace(/\s+/g, ' ')
    if (trimmed === '') continue
    if (trimmed.length > MAX_PRODUCT_TAG_LENGTH) throw new Error(`${field} cannot contain tags longer than ${MAX_PRODUCT_TAG_LENGTH} characters`)
    const identity = trimmed.toLocaleLowerCase()
    if (!seen.has(identity)) {
      seen.add(identity)
      normalized.push(trimmed)
    }
  }
  return normalized
}

function normalizeCreate(input: CreateProductInput) {
  return {
    name: text(input.name, 'Product name'),
    sku: text(input.sku, 'SKU'),
    categoryId: text(input.categoryId, 'Category ID'),
    retailPriceMxn: price(input.retailPriceMxn, 'Retail price'),
    wholesalePriceMxn: price(input.wholesalePriceMxn, 'Wholesale price'),
    tags: normalizeProductTags(input.tags),
    active: input.active ?? true,
  }
}

function normalizeUpdate(input: UpdateProductInput) {
  const result: Record<string, string | number | boolean> = {}
  if (input.name !== undefined) result.name = text(input.name, 'Product name')
  if (input.sku !== undefined) result.sku = text(input.sku, 'SKU')
  if (input.categoryId !== undefined) result.category_id = text(input.categoryId, 'Category ID')
  if (input.retailPriceMxn !== undefined) result.retail_price_mxn = price(input.retailPriceMxn, 'Retail price')
  if (input.wholesalePriceMxn !== undefined) result.wholesale_price_mxn = price(input.wholesalePriceMxn, 'Wholesale price')
  if (input.tags !== undefined) normalizeProductTags(input.tags)
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') throw new Error('Active state must be boolean')
    result.active = input.active
  }
  if (Object.keys(result).length === 0 && input.tags === undefined) throw new Error('At least one product field is required')
  return result
}

function mapProduct(data: unknown): Product {
  const row = (Array.isArray(data) ? data[0] : data) as ProductRow | undefined
  if (!row) throw new Error('Product response was empty')
  const category = Array.isArray(row.category) ? row.category[0] : row.category
  if (!row.category_id || !category?.id || !category.name) throw new Error('Product response is missing its category relation')
  const tags = (row.tag_assignments ?? []).flatMap(({ tag }) => Array.isArray(tag) ? tag : tag ? [tag] : []).map(({ name }) => name)
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: category.name,
    categoryId: row.category_id,
    retailPriceMxn: Number(row.retail_price_mxn),
    wholesalePriceMxn: Number(row.wholesale_price_mxn),
    active: row.active,
    tags: normalizeProductTags(tags),
    imageUrl: row.image_url ?? null,
    imageKey: row.image_key ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function readProduct(productId: string): Promise<Product> {
  const { data, error } = await insforge.database.from('products').select(PRODUCT_COLUMNS).eq('id', productId)
  if (error) throw error
  return mapProduct(data)
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
    category_id: normalized.categoryId,
    retail_price_mxn: normalized.retailPriceMxn,
    wholesale_price_mxn: normalized.wholesalePriceMxn,
    active: normalized.active,
  }]).select(PRODUCT_COLUMNS)
  if (error) throw error
  const created = mapProduct(data)
  if (input.tags === undefined) return created
  await syncProductTags(created.id, normalized.tags)
  return readProduct(created.id)
}

function operationError(message: string, errors: unknown[]) {
  const details = errors
    .map((error) => error instanceof Error ? error.message : String(error))
    .filter(Boolean)
  return new Error(details.length > 0 ? `${message}: ${details.join('; ')}` : message)
}

function imageFileExtension(file: File) {
  if (file.type === 'image/jpeg') return '.jpg'
  if (file.type === 'image/png') return '.png'
  return '.webp'
}

function validateProductImageFile(file: File) {
  if (!file || typeof file.type !== 'string' || !PRODUCT_IMAGE_MIME_TYPES.includes(file.type as typeof PRODUCT_IMAGE_MIME_TYPES[number])) {
    throw new Error('Product image must be a JPEG, PNG, or WebP file')
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) throw new Error('Product image exceeds the 5 MB limit')
}

function createProductImageKey(productId: string, file: File) {
  const randomUUID = globalThis.crypto?.randomUUID
  const suffix = typeof randomUUID === 'function'
    ? randomUUID.call(globalThis.crypto)
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `products/${productId}/${suffix}${imageFileExtension(file)}`
}

async function removeStorageObject(key: string) {
  const { error } = await insforge.storage.from(PRODUCT_IMAGE_BUCKET).remove(key)
  if (error) throw error
}

async function updateProductImageReference(productId: string, image: ProductImageAssociation | null): Promise<Product> {
  const id = text(productId, 'Product ID')
  const { data, error } = await insforge.database.from('products').update({
    image_url: image?.url ?? null,
    image_key: image?.key ?? null,
  }).eq('id', id).select(PRODUCT_COLUMNS)
  if (error) throw error
  return mapProduct(data)
}

export async function uploadProductImage(productId: string, file: File): Promise<ProductImage> {
  const id = text(productId, 'Product ID')
  validateProductImageFile(file)
  const key = createProductImageKey(id, file)
  const { data, error } = await insforge.storage.from(PRODUCT_IMAGE_BUCKET).upload(key, file)

  if (error) {
    if (data?.key) {
      try {
        await removeStorageObject(data.key)
      } catch (cleanupError) {
        throw operationError('Product image upload failed and its partial object could not be cleaned up', [error, cleanupError])
      }
    }
    throw error
  }
  if (!data?.url || !data.key) {
    if (data?.key) {
      try {
        await removeStorageObject(data.key)
      } catch (cleanupError) {
        throw operationError('Product image upload returned incomplete metadata and its partial object could not be cleaned up', [cleanupError])
      }
    }
    throw new Error('Product image upload returned incomplete storage metadata')
  }
  return { url: data.url, key: data.key }
}

export async function replaceProductImage(productId: string, currentImage: ProductImageReference, file: File): Promise<Product> {
  const id = text(productId, 'Product ID')
  const uploaded = await uploadProductImage(id, file)
  let updated: Product

  try {
    updated = await updateProductImageReference(id, uploaded)
  } catch (databaseError) {
    try {
      await removeStorageObject(uploaded.key)
    } catch (cleanupError) {
      throw operationError('Product image association failed and the new object could not be cleaned up', [databaseError, cleanupError])
    }
    throw databaseError
  }

  if (!currentImage.imageKey || currentImage.imageKey === uploaded.key) return updated

  try {
    await removeStorageObject(currentImage.imageKey)
  } catch (deleteError) {
    const compensationErrors: unknown[] = []
    try {
      await updateProductImageReference(id, { url: currentImage.imageUrl, key: currentImage.imageKey })
    } catch (rollbackError) {
      compensationErrors.push(rollbackError)
    }
    try {
      await removeStorageObject(uploaded.key)
    } catch (cleanupError) {
      compensationErrors.push(cleanupError)
    }
    throw operationError('Product image replacement failed while cleaning up the previous object', [deleteError, ...compensationErrors])
  }

  return updated
}

export async function removeProductImage(productId: string, currentImage: ProductImageReference): Promise<Product> {
  const id = text(productId, 'Product ID')
  let cleared: Product
  try {
    cleared = await updateProductImageReference(id, null)
  } catch (databaseError) {
    throw operationError('Product image references could not be cleared; the existing object was kept', [databaseError])
  }

  if (currentImage.imageKey) {
    try {
      await removeStorageObject(currentImage.imageKey)
    } catch (storageError) {
      const compensationErrors: unknown[] = []
      try {
        await updateProductImageReference(id, { url: currentImage.imageUrl, key: currentImage.imageKey })
      } catch (rollbackError) {
        compensationErrors.push(rollbackError)
      }
      throw operationError('Product image removal failed; the existing object was kept', [storageError, ...compensationErrors])
    }
  }
  return cleared
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const productId = text(id, 'Product ID')
  const normalized = normalizeUpdate(input)
  let updated: Product | null = null
  if (Object.keys(normalized).length > 0) {
    const { data, error } = await insforge.database.from('products').update(normalized).eq('id', productId).select(PRODUCT_COLUMNS)
    if (error) throw error
    updated = mapProduct(data)
  }
  if (input.tags === undefined) {
    if (!updated) throw new Error('Product update returned no product')
    return updated
  }
  await syncProductTags(productId, normalizeProductTags(input.tags))
  return readProduct(productId)
}

export function deactivateProduct(id: string) {
  return updateProduct(id, { active: false })
}
