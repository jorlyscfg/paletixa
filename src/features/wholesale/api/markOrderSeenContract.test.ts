import { describe, expect, it } from 'vitest'
import migration from '../../../../migrations/20260824220000_fix-wholesale-order-seen-ambiguity.sql?raw'

describe('wholesale order seen corrective migration contract', () => {
  it('keeps the existing function contract and qualifies the updated order row', () => {
    expect(migration).toContain('create or replace function public.mark_wholesale_order_seen(p_request_id uuid, p_order_id uuid)')
    expect(migration).toContain('returns table(')
    expect(migration).toContain('security definer')
    expect(migration).toContain('set search_path = pg_catalog, public, pg_temp')
    expect(migration).toContain('if not public.wholesale_admin_allowed() then raise exception \'access denied\'; end if;')
    expect(migration).toContain("public.wholesale_mutation_was_replayed('admin.seen'")
    expect(migration).toContain('update public.wholesale_orders as order_row')
    expect(migration).toContain('coalesce(order_row.admin_seen_at, now())')
    expect(migration).toContain('coalesce(order_row.admin_seen_by, actor)')
    expect(migration).toContain('where order_row.id = p_order_id')
    expect(migration).toContain("'order.seen'")
  })
})
