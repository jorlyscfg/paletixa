import { describe, expect, it } from 'vitest'
import migration from '../../../../migrations/20260823233000_add-native-wholesale-public-catalog.sql?raw'

describe('public wholesale catalog migration contract', () => {
  it('exposes only the sanitized catalog projection', () => {
    expect(migration).toContain('create function public.list_public_wholesale_catalog()')
    expect(migration).toContain('grant execute on function public.list_public_wholesale_catalog() to anon, authenticated')
    expect(migration).toContain('product.retail_price_mxn')
    expect(migration).not.toContain('image_key')
    expect(migration).not.toMatch(/warehouse|inventory|erpnext|payment_entries|delivery_note/i)
  })
})
