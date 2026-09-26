import { describe, expect, it } from 'vitest'
import migration from '../../../../migrations/20260823234500_correct-native-wholesale-gate-review.sql?raw'

describe('native wholesale corrective migration contract', () => {
  it('stores the visible PIN while keeping it out of snapshots and non-admin paths', () => {
    expect(migration).toContain('current_pin text')
    expect(migration).toContain('SECURITY TRADE-OFF')
    expect(migration).toContain('current_pin = generated.pin')
    expect(migration).toContain('customer.current_pin')
    expect(migration).toContain('current_pin|session_token')
    expect(migration).not.toContain('create or replace function public.wholesale_customer_snapshot')
    expect(migration).not.toContain('create or replace function public.wholesale_customer_login')
  })

  it('replaces the public catalog with POS-compatible safe fields and no image keys', () => {
    expect(migration).toContain('drop function if exists public.list_public_wholesale_catalog()')
    expect(migration).toContain('product.sku')
    expect(migration).toContain('product.image_url')
    expect(migration).toContain("'^https://[^[:space:]]+$'")
    expect(migration).not.toContain('image_key')
    expect(migration).not.toMatch(/warehouse|inventory|erpnext|payment_entries|delivery_note/i)
  })

  it('requires and audits the completion reason through the new admin RPC signature', () => {
    expect(migration).toContain('public.complete_wholesale_order(uuid, uuid, jsonb, text)')
    expect(migration).toContain('p_reason text')
    expect(migration).toContain("'order.completed', normalized_reason")
    expect(migration).toContain("if normalized_reason is null or length(normalized_reason) > 500 then raise exception 'a reason is required'; end if;")
  })
})
