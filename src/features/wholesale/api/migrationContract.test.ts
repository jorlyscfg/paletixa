import { describe, expect, it } from 'vitest'
import migration from '../../../../migrations/20260823205104_add-native-wholesale-foundation.sql?raw'

describe('native wholesale foundation migration contract', () => {
  it('creates the additive tables and exact order state contract', () => {
    expect(migration).toContain('create table public.wholesale_customers')
    expect(migration).toContain('create table public.wholesale_customer_sessions')
    expect(migration).toContain('create table public.wholesale_orders')
    expect(migration).toContain('create table public.wholesale_order_items')
    expect(migration).toContain('create table public.wholesale_audit_events')
    expect(migration).toContain("status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled'))")
    expect(migration).toContain("payment_method text not null check (payment_method in ('cash', 'transfer'))")
  })

  it('keeps credentials private and audit history append-only', () => {
    expect(migration).toContain('pin_hash text not null')
    expect(migration).toContain('wholesale_audit_events_append_only')
    expect(migration).toContain('wholesale_orders_no_physical_delete')
    expect(migration).toContain('revoke all on public.wholesale_customers')
    expect(migration).toContain('revoke all on function public.normalize_wholesale_mobile')
    expect(migration).toContain('public.append_wholesale_audit_event(text, uuid, uuid, text, text, jsonb, jsonb, uuid, uuid)')
  })

  it('does not replace existing sales or reporting functions', () => {
    expect(migration).toContain('from public.record_sale(')
    expect(migration).not.toContain('create or replace function public.record_sale')
    expect(migration).not.toContain('create or replace function public.report_sales_by_channel')
    expect(migration).not.toContain('alter table public.sales')
    expect(migration).not.toMatch(/drop\s+(table|function)\s+public\./i)
  })
})
