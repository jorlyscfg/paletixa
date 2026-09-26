import type { Product } from '../../products/api/products'

export const POS_WHOLESALE_THRESHOLD = 10

export function createRequestId() {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID === 'function') return randomUUID.call(globalThis.crypto)

  const bytes = new Uint8Array(16)
  const getRandomValues = globalThis.crypto?.getRandomValues
  if (typeof getRandomValues === 'function') {
    getRandomValues.call(globalThis.crypto, bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hexadecimal = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`
}

export type PosCatalogCategory = {
  id: string
  name: string
  products: Product[]
}

export type PosQuantityLine = {
  categoryId: string
  quantity: number
}

export function buildPosCatalogCategories(products: Product[]): PosCatalogCategory[] {
  const categories = new Map<string, PosCatalogCategory>()
  for (const product of products) {
    const current = categories.get(product.categoryId) ?? { id: product.categoryId, name: product.category, products: [] }
    current.products.push(product)
    categories.set(product.categoryId, current)
  }
  return [...categories.values()].sort((left, right) => left.name.localeCompare(right.name, 'es-MX'))
}

function isPositivePrice(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function getValidatedCategoryPrice(products: Product[], categoryId: string, wholesale: boolean) {
  const categoryProducts = products.filter((product) => product.active && product.categoryId === categoryId)
  if (categoryProducts.length === 0) return null
  const prices = categoryProducts.map((product) => wholesale ? product.wholesalePriceMxn : product.retailPriceMxn)
  if (prices.some((price) => !isPositivePrice(price))) return null
  if (new Set(prices).size !== 1) return null
  return prices[0]
}

export function isPosWholesaleQuantity(categoryQuantity: number, threshold = POS_WHOLESALE_THRESHOLD) {
  return categoryQuantity >= threshold
}

export function getPosCategoryQuantityById(lines: readonly PosQuantityLine[]) {
  const quantities = new Map<string, number>()
  for (const line of lines) {
    quantities.set(line.categoryId, (quantities.get(line.categoryId) ?? 0) + line.quantity)
  }
  return quantities
}

export function getPosCategoryUnitPrice(products: Product[], categoryId: string, categoryQuantity: number, threshold = POS_WHOLESALE_THRESHOLD) {
  const retailPrice = getValidatedCategoryPrice(products, categoryId, false)
  if (!isPosWholesaleQuantity(categoryQuantity, threshold)) return retailPrice
  return getValidatedCategoryPrice(products, categoryId, true) ?? retailPrice
}

export function getPosUnitPrice(product: Product, categoryQuantity: number, threshold = POS_WHOLESALE_THRESHOLD) {
  return isPosWholesaleQuantity(categoryQuantity, threshold) && isPositivePrice(product.wholesalePriceMxn)
    ? product.wholesalePriceMxn
    : product.retailPriceMxn
}

export function getPosPriceLabel(categoryQuantity: number, wholesalePriceMxn?: number | null, threshold = POS_WHOLESALE_THRESHOLD) {
  const wholesaleAvailable = wholesalePriceMxn === undefined || isPositivePrice(wholesalePriceMxn)
  return isPosWholesaleQuantity(categoryQuantity, threshold) && wholesaleAvailable ? 'Precio de mayoreo' : 'Precio de menudeo'
}

export function getPosCategoryPriceLabel(products: Product[], categoryId: string, categoryQuantity: number, threshold = POS_WHOLESALE_THRESHOLD) {
  const wholesalePrice = isPosWholesaleQuantity(categoryQuantity, threshold) ? getValidatedCategoryPrice(products, categoryId, true) : undefined
  return getPosPriceLabel(categoryQuantity, wholesalePrice, threshold)
}

export function getPosUsdReceivedMxn(usdPaid: number, usdMxnRate: number) {
  if (!Number.isFinite(usdPaid) || usdPaid < 0 || !Number.isFinite(usdMxnRate) || usdMxnRate <= 0) return null
  return Math.round(usdPaid * usdMxnRate * 100) / 100
}

export function getPosCashChange(received: number, totalMxn: number, currency: 'mxn' | 'usd', usdMxnRate: number) {
  if (!Number.isFinite(totalMxn) || totalMxn < 0) return null
  const receivedMxn = currency === 'usd' ? getPosUsdReceivedMxn(received, usdMxnRate) : Number.isFinite(received) && received >= 0 ? Math.round(received * 100) / 100 : null
  if (receivedMxn === null) return null
  return Math.round((receivedMxn - totalMxn) * 100) / 100
}
