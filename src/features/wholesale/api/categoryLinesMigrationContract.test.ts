import { describe, expect, it } from 'vitest'
import migration from '../../../../migrations/20260824013913_wholesale-category-lines.sql?raw'

describe('wholesale category lines migration contract', () => {
  it('extends wholesale order items and snapshots without rewriting POS migrations', () => {
    expect(migration).toContain('alter column product_id drop not null')
    expect(migration).toContain("add column if not exists line_kind text not null default 'product'")
    expect(migration).toContain('add column if not exists category_id uuid')
    expect(migration).toContain('wholesale_order_items_line_identity_valid')
    expect(migration).toContain('wholesale_order_items_line_key')
    expect(migration).toContain("'line_kind', item.line_kind")
    expect(migration).toContain("'category_id', item.category_id")
  })

  it('uses category totals for wholesale product pricing while preserving POS pricing', () => {
    const prepareWholesaleItems = migration.slice(
      migration.indexOf('create or replace function public.prepare_wholesale_order_items'),
      migration.indexOf('create or replace function public.insert_wholesale_order_items'),
    )
    const recordSale = migration.slice(migration.indexOf('create or replace function public.record_sale'))

    expect(prepareWholesaleItems).toContain("where coalesce(value->>'line_kind', 'product') = 'product'")
    expect(prepareWholesaleItems).toContain('public.wholesale_unit_price_for_quantity(product.retail_price_mxn, product.wholesale_price_mxn, category_quantity)')
    expect(recordSale).toContain('when wanted_channel = \'wholesale\' then public.wholesale_unit_price_for_quantity(product.retail_price_mxn, product.wholesale_price_mxn, category_quantity)')
    expect(recordSale).toContain("when wanted_channel = 'pos' and category_quantity >= 10 and product.wholesale_price_mxn > 0 then product.wholesale_price_mxn")
    expect(migration).toContain("category_wholesale_invalid_count = 0")
    expect(migration).toContain("wanted_channel not in ('pos', 'wholesale')")
    expect(migration).toContain('insert into public.sale_items')
    expect(migration).toContain('item.line_kind, item.product_id, item.category_id, item.category_name')
    expect(migration).not.toContain('drop function public.record_sale')
  })
})
