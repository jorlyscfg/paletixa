import { describe, expect, it } from 'vitest'
import type { WholesaleOrder } from '../api/types'
import { createWholesaleRequestId, draftFromWholesaleOrder, getWholesaleCategoryUnitPrice, getWholesaleDraftCategoryQuantity, getWholesaleDraftTotal, getWholesaleWhatsAppUrl, normalizeWholesaleWhatsAppDigits, toWholesaleOrderItems, wholesaleCategoryKey } from './wholesaleUiUtils'

describe('createWholesaleRequestId', () => {
  it('returns a UUID accepted by the wholesale RPCs', () => {
    expect(createWholesaleRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
})

describe('wholesale WhatsApp links', () => {
  it('prefixes Mexican ten-digit numbers with the country code', () => {
    expect(normalizeWholesaleWhatsAppDigits('55 1234 5678')).toBe('525512345678')
    expect(getWholesaleWhatsAppUrl('55 1234 5678')).toBe('https://wa.me/525512345678')
  })

  it('preserves an existing country code', () => {
    expect(normalizeWholesaleWhatsAppDigits('+52 55 1234 5678')).toBe('525512345678')
    expect(getWholesaleWhatsAppUrl('+1 (555) 123-4567')).toBe('https://wa.me/15551234567')
  })
})

const catalog = [
  { id: 'product-1', name: 'Mango', sku: 'M-01', categoryId: 'category-1', category: 'Paletas', retailPriceMxn: 12.5, wholesalePriceMxn: 10, imageUrl: null },
  { id: 'product-2', name: 'Fresa', sku: 'F-01', categoryId: 'category-1', category: 'Paletas', retailPriceMxn: 12.5, wholesalePriceMxn: 10, imageUrl: null },
]

describe('wholesale category draft lines', () => {
  it('serializes product and category keys without losing their line kind', () => {
    expect(toWholesaleOrderItems({ 'product-1': 2, [wholesaleCategoryKey('category-1')]: 10 })).toEqual([
      { productId: 'product-1', quantity: 2 },
      { lineKind: 'category', categoryId: 'category-1', quantity: 10 },
    ])
  })

  it('uses uniform retail pricing below ten and uniform wholesale pricing at ten', () => {
    expect(getWholesaleCategoryUnitPrice(catalog, 'category-1', 9)).toBe(12.5)
    expect(getWholesaleCategoryUnitPrice(catalog, 'category-1', 10)).toBe(10)
    expect(getWholesaleDraftTotal({ reorderFromOrderId: null, items: { [wholesaleCategoryKey('category-1')]: 10 }, paymentMethod: 'cash', transferTicket: null }, catalog)).toBe(100)
  })

  it('uses the POS-style category quantity across product and category lines', () => {
    const draft = { reorderFromOrderId: null, items: { [wholesaleCategoryKey('category-1')]: 1, 'product-1': 9 }, paymentMethod: 'cash' as const, transferTicket: null }
    expect(getWholesaleDraftCategoryQuantity(draft, catalog, 'category-1')).toBe(10)
    expect(getWholesaleDraftTotal(draft, catalog)).toBe(100)
  })

  it('round-trips category lines when a customer repeats an order', () => {
    const order = {
      id: 'order-1',
      paymentMethod: 'cash',
      items: [
        { id: 'item-1', lineKind: 'category', productId: null, categoryId: 'category-1', categoryName: 'Paletas', productName: 'Paletas', unitPriceMxn: 10, quantity: 10, lineTotalMxn: 100 },
        { id: 'item-2', lineKind: 'product', productId: 'product-1', categoryId: null, categoryName: null, productName: 'Mango', unitPriceMxn: 12.5, quantity: 2, lineTotalMxn: 25 },
      ],
    } as unknown as WholesaleOrder
    const draft = draftFromWholesaleOrder(order)
    expect(draft.draftAction).toBe('reorder')
    expect(draft.items).toEqual({ [wholesaleCategoryKey('category-1')]: 10, 'product-1': 2 })
    expect(toWholesaleOrderItems(draft.items)).toEqual([
      { lineKind: 'category', categoryId: 'category-1', quantity: 10 },
      { productId: 'product-1', quantity: 2 },
    ])
  })

  it('marks an order draft as edit mode when requested', () => {
    const order = { id: 'order-1', items: [], paymentMethod: 'cash', transferTicket: null } as unknown as WholesaleOrder
    expect(draftFromWholesaleOrder(order, 'edit')).toMatchObject({ reorderFromOrderId: 'order-1', draftAction: 'edit', transferTicket: null })
  })

  it('keeps a refreshed transfer ticket only for in-place edits', () => {
    const order = { id: 'order-1', items: [], paymentMethod: 'transfer', transferTicket: { url: 'https://example.invalid/ticket', key: 'customers/customer-1/ticket.webp' } } as unknown as WholesaleOrder
    expect(draftFromWholesaleOrder(order, 'edit').transferTicket).toEqual(order.transferTicket)
    expect(draftFromWholesaleOrder(order, 'reorder').transferTicket).toBeNull()
  })
})
