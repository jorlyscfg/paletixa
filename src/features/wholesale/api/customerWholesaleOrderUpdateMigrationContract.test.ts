import { describe, expect, it } from 'vitest'
import migration from '../../../../migrations/20260825233448_add-customer-wholesale-order-update.sql?raw'

function updateFunctionSection() {
  const start = migration.indexOf('create or replace function public.update_wholesale_customer_order(')
  return migration.slice(start)
}

describe('customer wholesale order update migration contract', () => {
  it('updates only an owned pending order and preserves the order identity', () => {
    const section = updateFunctionSection()
    expect(section).toContain('public.wholesale_customer_session_id(p_session_token)')
    expect(section).toContain('public.prepare_wholesale_order_items(p_items)')
    expect(section).toContain('public.normalize_wholesale_payment(p_payment_method, p_transfer_ticket_url, p_transfer_ticket_key)')
    expect(section).toContain('where id = p_order_id and customer_id = session_customer_id')
    expect(section).toContain("changed.deleted_at is not null or changed.status <> 'pending'")
    expect(section).toContain('payment_method = payment->>\'payment_method\'')
    expect(section).toContain('transfer_ticket_url = payment->>\'transfer_ticket_url\'')
    expect(section).toContain('transfer_ticket_key = payment->>\'transfer_ticket_key\'')
    expect(section).toContain('total_mxn = total')
    expect(section).toContain('updated_at = now()')
    expect(section).toContain("and status = 'pending' and deleted_at is null")
    expect(section).not.toContain('set created_at')
    expect(section).not.toContain('set source')
    expect(section).not.toContain('set status')
    expect(section).not.toContain('set customer_id')
  })

  it('keeps idempotency, item replacement, audit snapshots, projection, and customer grants', () => {
    const section = updateFunctionSection()
    expect(section).toContain("public.wholesale_mutation_was_replayed('customer.update'")
    expect(section).toContain('insert into public.wholesale_mutation_requests')
    expect(section).toContain('delete from public.wholesale_order_items where order_id = p_order_id')
    expect(section).toContain('public.insert_wholesale_order_items(p_order_id, prepared)')
    expect(section).toContain("'order.updated'")
    expect(section).toContain('before_snapshot')
    expect(section).toContain('public.wholesale_order_projection(p_order_id)')
    expect(migration).toContain('revoke all on function public.update_wholesale_customer_order(text, uuid, uuid, jsonb, text, text, text)')
    expect(migration).toContain('grant execute on function public.update_wholesale_customer_order(text, uuid, uuid, jsonb, text, text, text)')
    expect(migration).toContain('to anon, authenticated')
  })
})
