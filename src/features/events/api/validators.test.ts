import { describe, expect, it } from 'vitest'
import { normalizeEventDate, normalizeEventItems, normalizeEventMoney, normalizeEventPhone } from './validators'

describe('event validators', () => {
  it('normalizes Mexican mobile numbers and rejects malformed dates', () => {
    expect(normalizeEventPhone('55 1234 5678')).toBe('+525512345678')
    expect(() => normalizeEventDate('2026-02-30')).toThrow('ISO date')
    expect(() => normalizeEventDate('2026-08-01T00:00:00Z')).toThrow('too long')
  })

  it('normalizes distinct product and category reservation lines', () => {
    expect(normalizeEventItems([
      { productId: 'product-1', quantity: 2 },
      { lineKind: 'category', categoryId: 'category-1', quantity: 1 },
    ])).toEqual([
      { line_kind: 'product', product_id: 'product-1', quantity: 2 },
      { line_kind: 'category', category_id: 'category-1', quantity: 1 },
    ])
    expect(() => normalizeEventItems([{ productId: 'product-1', quantity: 1 }, { productId: 'product-1', quantity: 1 }])).toThrow('Duplicate event reservation product')
  })

  it('requires integer event money while preserving the non-negative completion rule', () => {
    expect(normalizeEventMoney(12, 'Amount')).toBe(12)
    expect(() => normalizeEventMoney(12.345, 'Amount')).toThrow('positive integer')
    expect(normalizeEventMoney(0, 'Amount', true)).toBe(0)
    expect(() => normalizeEventMoney(-1, 'Amount', true)).toThrow('non-negative')
  })
})
