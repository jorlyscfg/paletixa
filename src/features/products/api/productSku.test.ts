import { describe, expect, it } from 'vitest'
import { normalizeSku, suggestProductSku, suggestUniqueProductSku } from './productSku'

describe('product SKU conventions', () => {
  it.each([
    [' nieve con mango / chile ', 'NIEVE-CON-MANGO-CHILE'],
    ['Árbol__de limón', 'ARBOL-DE-LIMON'],
    ['sku ñ 01', 'SKU-N-01'],
  ])('normalizes %j to %j', (value, expected) => {
    expect(normalizeSku(value)).toBe(expected)
  })

  it('bounds canonical SKUs to the database field length', () => {
    expect(normalizeSku('a'.repeat(90))).toHaveLength(80)
    expect(normalizeSku(`${'a'.repeat(78)}-01`)).toBe(`${'A'.repeat(78)}-0`)
  })

  it('suggests short meaningful tokens from category, name, and tags', () => {
    expect(suggestProductSku({ category: 'Nieves', name: 'Mango con chile', tags: ['Fruta'] })).toBe('NIE-MAN-CHI-FRU')
  })

  it('adds deterministic two-digit suffixes for collisions', () => {
    const fields = { category: 'Nieves', name: 'Mango', tags: ['Chile'] }
    expect(suggestUniqueProductSku(fields, ['NIE-MAN-CHI'])).toBe('NIE-MAN-CHI-02')
    expect(suggestUniqueProductSku(fields, ['NIE-MAN-CHI', 'nie man chi 02'])).toBe('NIE-MAN-CHI-03')
  })

  it('returns an empty suggestion when no useful field is filled', () => {
    expect(suggestProductSku({ category: 'de', name: 'con', tags: ['y'] })).toBe('')
  })
})
