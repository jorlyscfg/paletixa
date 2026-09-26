import { describe, expect, it } from 'vitest'
import migration from '../../../../migrations/20260823220000_add-native-wholesale-lifecycle.sql?raw'

describe('native wholesale lifecycle migration contract', () => {
  it('keeps the exact native lifecycle and adds completion data without logistics tables', () => {
    expect(migration).toContain("wanted_status not in ('pending', 'processing', 'completed', 'cancelled')")
    expect(migration).toContain('payment_amount numeric(14,2)')
    expect(migration).toContain("payment_currency in ('mxn', 'usd')")
    expect(migration).toContain("delivery_agreement in ('delivery', 'pickup')")
    expect(migration).toContain('admin_seen_at timestamptz')
    expect(migration).not.toMatch(/warehouse|inventory|erpnext|delivery_note|payment_entries|address/i)
  })

  it('uses the order price snapshot and preserves one sale per completion generation', () => {
    expect(migration).toContain('wholesale_unit_price_for_quantity')
    expect(migration).toContain('public.wholesale_unit_price_for_quantity(product.retail_price_mxn, product.wholesale_price_mxn, quantity)')
    expect(migration).toContain('create table public.sale_reversals')
    expect(migration).toContain('create table public.wholesale_order_sales')
    expect(migration).toContain('prior_reversal_id')
    expect(migration).toContain('sale_items')
    expect(migration).toContain('item.unit_price_mxn')
    expect(migration).toContain('not exists (select 1 from public.sale_reversals')
  })

  it('keeps record_sale untouched and makes completion/status operations atomic', () => {
    expect(migration).not.toContain('create or replace function public.record_sale')
    expect(migration).not.toContain('drop function public.record_sale')
    expect(migration).toContain('create function public.complete_wholesale_order(')
    expect(migration).toContain("raise exception 'completed orders require the completion RPC'")
    expect(migration).toContain('perform public.reverse_wholesale_order_sale')
    expect(migration).toContain('wholesale_mutation_requests')
  })

  it('publishes credential-free order events and protects customer cancellation races', () => {
    expect(migration).toContain('create table public.wholesale_order_events')
    expect(migration).toContain("realtime.publish('wholesale:orders'")
    expect(migration).toContain('admin_seen_at is null')
    expect(migration).toContain('status = \'pending\' and admin_seen_at is null and deleted_at is null')
    expect(migration).toContain('wholesale_order_events_no_credentials')
  })
})
