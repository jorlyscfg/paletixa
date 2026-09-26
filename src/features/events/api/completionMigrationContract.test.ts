import { describe, expect, it } from 'vitest'
import migration from '../../../../migrations/20260828000000_clarify-event-completion-workflow.sql?raw'

describe('event completion workflow migration', () => {
  it('adds server-maintained cart allocation and separate remaining receipt fields', () => {
    expect(migration).toContain('add column cart_allocated boolean not null default false')
    expect(migration).toContain("where status in ('reserved', 'completed')")
    expect(migration).toContain('add column remaining_transfer_ticket_url text')
    expect(migration).toContain('add column remaining_transfer_ticket_key text')
    expect(migration).toContain('event_reservations_remaining_transfer_ticket_pair_check')
    expect(migration).toContain('alter type public.event_reservation_projection_row_v2 add attribute cart_allocated boolean')
    expect(migration).toContain('create type public.event_reservation_admin_projection_row_v3')
    expect(migration).toContain('remaining_transfer_ticket_key text')

    const publicProjection = migration.slice(migration.indexOf('create or replace function public.event_reservation_projection'), migration.indexOf('create type public.event_reservation_admin_projection_row_v3'))
    expect(publicProjection).not.toContain('remaining_transfer_ticket_url')
    expect(publicProjection).not.toContain('remaining_transfer_ticket_key')
  })

  it('counts only allocated carts and makes the completion contract date-authoritative', () => {
    expect(migration).toContain('and reservation.cart_allocated = true')
    expect(migration).toContain('actual_date date := current_date')
    expect(migration).toContain('p_confirm_date_change boolean')
    expect(migration).toContain('p_allow_without_cart boolean')
    expect(migration).toContain('for update')
    expect(migration).toContain("capacity_result := 'available'")
    expect(migration).toContain("capacity_result := 'full'")
    expect(migration).toContain('cart_allocated_after := false')
    expect(migration).toContain('original_event_date')
    expect(migration).toContain('actual_event_date')
  })

  it('removes the old callable completion signature and grants only the new admin contract', () => {
    expect(migration).toContain('drop function if exists public.complete_event_reservation(uuid, uuid, text, numeric, text, text, text)')
    expect(migration).toContain('complete_event_reservation(uuid, uuid, text, numeric, text, text, text, text, boolean, boolean)')
    expect(migration).toContain("if not public.event_admin_allowed() then raise exception 'access denied'; end if;")
    expect(migration).toContain("public.event_reservation_mutation_replayed(p_request_id, 'complete'")
    expect(migration).toContain('grant execute on function public.list_event_reservations(boolean),')
    expect(migration).not.toContain('p_remaining_payment_reference')
  })
})
