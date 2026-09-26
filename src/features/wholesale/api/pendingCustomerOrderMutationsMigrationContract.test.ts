import { describe, expect, it } from 'vitest'
import migration from '../../../../migrations/20260825000000_allow-pending-customer-order-mutations.sql?raw'

function customerMutationSection(functionName: string) {
  const start = migration.indexOf(`create or replace function public.${functionName}(`)
  const nextFunction = migration.indexOf('create or replace function public.', start + 1)
  return migration.slice(start, nextFunction === -1 ? undefined : nextFunction)
}

describe('pending customer order mutation migration contract', () => {
  it('replaces both customer mutation functions while preserving pending and deletion guards', () => {
    expect(migration).toContain('create or replace function public.cancel_wholesale_customer_order(')
    expect(migration).toContain('create or replace function public.delete_wholesale_customer_order(')

    for (const functionName of ['cancel_wholesale_customer_order', 'delete_wholesale_customer_order']) {
      const section = customerMutationSection(functionName)
      expect(section).toContain("changed.deleted_at is not null or changed.status <> 'pending'")
      expect(section).toContain("where id = p_order_id and status = 'pending' and deleted_at is null")
      expect(section).not.toContain('admin_seen_at is null')
      expect(section).not.toContain('changed.admin_seen_at is not null')
    }
  })

  it('keeps customer ownership, idempotency, session updates, and audit events', () => {
    for (const functionName of ['cancel_wholesale_customer_order', 'delete_wholesale_customer_order']) {
      const section = customerMutationSection(functionName)
      expect(section).toContain('customer_id = session_customer_id')
      expect(section).toContain('public.wholesale_mutation_was_replayed')
      expect(section).toContain('update public.wholesale_customer_sessions set last_seen_at = now()')
      expect(section).toContain('public.append_wholesale_audit_event')
    }
  })
})
