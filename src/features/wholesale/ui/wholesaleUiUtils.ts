import { resolveWholesaleUnitPrice } from '../api/validators'
import type { WholesaleCatalogProduct } from '../api/catalog'
import type { WholesaleOrder, WholesaleOrderItemInput, WholesalePaymentMethod } from '../api/types'

export type WholesaleDraftAction = 'edit' | 'reorder' | null

export type WholesaleDraft = {
  reorderFromOrderId: string | null
  draftAction?: WholesaleDraftAction
  items: Record<string, number>
  paymentMethod: WholesalePaymentMethod
  transferTicket: { url: string; key: string } | null
}

export function wholesaleCategoryKey(categoryId: string) {
  return `category:${categoryId}`
}

function formatWholesaleUuid(bytes: Uint8Array) {
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createWholesaleRequestId() {
  const cryptoObject = globalThis.crypto
  if (typeof cryptoObject?.randomUUID === 'function') return cryptoObject.randomUUID()
  if (typeof cryptoObject?.getRandomValues === 'function') return formatWholesaleUuid(cryptoObject.getRandomValues(new Uint8Array(16)))
  return formatWholesaleUuid(Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)))
}

export function normalizeWholesaleWhatsAppDigits(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length === 10 ? `52${digits}` : digits
}

export function getWholesaleWhatsAppUrl(value: string) {
  return `https://wa.me/${normalizeWholesaleWhatsAppDigits(value)}`
}

export function createEmptyWholesaleDraft(): WholesaleDraft {
  return { reorderFromOrderId: null, draftAction: null, items: {}, paymentMethod: 'cash', transferTicket: null }
}

export function draftFromWholesaleOrder(order: WholesaleOrder, draftAction: Exclude<WholesaleDraftAction, null> = 'reorder'): WholesaleDraft {
  return {
    reorderFromOrderId: order.id,
    draftAction,
    items: Object.fromEntries(order.items.flatMap((item) => {
      const key = item.lineKind === 'category' ? (item.categoryId ? wholesaleCategoryKey(item.categoryId) : null) : item.productId
      return key ? [[key, item.quantity]] : []
    })),
    paymentMethod: order.paymentMethod,
    transferTicket: draftAction === 'edit' ? order.transferTicket : null,
  }
}

export function getWholesaleDraftAction(draft: WholesaleDraft): WholesaleDraftAction {
  if (draft.draftAction === 'edit' || draft.draftAction === 'reorder') return draft.draftAction
  return draft.reorderFromOrderId ? 'reorder' : null
}

export function toWholesaleOrderItems(items: Record<string, number>): WholesaleOrderItemInput[] {
  return Object.entries(items)
    .filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0)
    .map(([key, quantity]) => key.startsWith('category:')
      ? { lineKind: 'category' as const, categoryId: key.slice('category:'.length), quantity }
      : { productId: key, quantity })
}

export function getWholesaleDraftCategoryQuantity(draft: WholesaleDraft, catalog: WholesaleCatalogProduct[], categoryId: string) {
  return toWholesaleOrderItems(draft.items).reduce((total, item) => {
    if (item.lineKind === 'category') return item.categoryId === categoryId ? total + item.quantity : total
    const product = catalog.find(({ id }) => id === item.productId)
    return product?.categoryId === categoryId ? total + item.quantity : total
  }, 0)
}

export function getWholesaleCatalogPrice(product: WholesaleCatalogProduct, quantity: number) {
  return resolveWholesaleUnitPrice(product.retailPriceMxn, product.wholesalePriceMxn, quantity)
}

function positivePrice(value: number) {
  return Number.isFinite(value) && value > 0
}

export function getWholesaleCategoryPrices(catalog: WholesaleCatalogProduct[], categoryId: string) {
  const products = catalog.filter((product) => product.categoryId === categoryId)
  if (products.length === 0) return { retailPriceMxn: null, wholesalePriceMxn: null }
  const retailPrices = products.map((product) => product.retailPriceMxn)
  const wholesalePrices = products.map((product) => product.wholesalePriceMxn)
  const retailPriceMxn = retailPrices.every(positivePrice) && new Set(retailPrices).size === 1 ? retailPrices[0] : null
  const wholesalePriceMxn = wholesalePrices.every(positivePrice) && new Set(wholesalePrices).size === 1 ? wholesalePrices[0] : null
  return { retailPriceMxn, wholesalePriceMxn }
}

export function getWholesaleCategoryUnitPrice(catalog: WholesaleCatalogProduct[], categoryId: string, quantity: number) {
  const { retailPriceMxn, wholesalePriceMxn } = getWholesaleCategoryPrices(catalog, categoryId)
  if (retailPriceMxn === null) return null
  return quantity >= 10 && wholesalePriceMxn !== null ? wholesalePriceMxn : retailPriceMxn
}

export function getWholesaleDraftTotal(draft: WholesaleDraft, catalog: WholesaleCatalogProduct[]) {
  const items = toWholesaleOrderItems(draft.items)
  return items.reduce((total, item) => {
    if (item.lineKind === 'category') {
      const categoryQuantity = getWholesaleDraftCategoryQuantity(draft, catalog, item.categoryId)
      const unitPrice = getWholesaleCategoryUnitPrice(catalog, item.categoryId, categoryQuantity)
      return unitPrice === null ? total : total + unitPrice * item.quantity
    }
    const product = catalog.find(({ id }) => id === item.productId)
    if (!product) return total
    const categoryQuantity = getWholesaleDraftCategoryQuantity(draft, catalog, product.categoryId)
    return total + getWholesaleCatalogPrice(product, categoryQuantity) * item.quantity
  }, 0)
}

export const WHOLESALE_STATUS_LABELS = {
  pending: 'Pendiente',
  processing: 'En proceso',
  completed: 'Completado',
  cancelled: 'Cancelado',
} as const

export function formatWholesaleMoney(value: number) {
  return `$${value.toFixed(2)} MXN`
}

export function formatWholesaleDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
