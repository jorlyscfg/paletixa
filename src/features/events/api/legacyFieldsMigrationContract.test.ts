import { describe, expect, it } from 'vitest'
import migration from '../../../../migrations/20260826192807_remove-event-reservation-legacy-fields.sql?raw'

describe('event reservation contract migration', () => {
  it('adapts the applied schema without requiring legacy identity fields', () => {
    expect(migration).toContain('alter column event_name drop not null')
    expect(migration).toContain('alter column responsible_name drop not null')
    expect(migration).toContain('drop constraint if exists event_reservations_event_name_check')
    expect(migration).toContain('create type public.event_reservation_projection_row_v2')
    expect(migration).toContain('drop function if exists public.create_event_reservation_public')
    expect(migration).toContain('p_event_date text, p_items jsonb')
    expect(migration).not.toContain('p_event_name')
    expect(migration).not.toContain('p_responsible_name')
  })

  it('keeps event safeguards and reports the customer as event context', () => {
    expect(migration).toContain("public.prepare_wholesale_order_items(p_items)")
    expect(migration).toContain("public.event_reservation_mutation_replayed(p_request_id, 'reserve'")
    expect(migration).toContain("public.event_reservation_mutation_replayed(p_request_id, 'complete'")
    expect(migration).toContain("raise exception 'event date is at capacity'")
    expect(migration).toContain("raise exception 'event reservation can only be completed on its delivery date'")
    expect(migration).toContain("'event_reservation_id', reservation.id")
    expect(migration).toContain("'customer_name', reservation.customer_name")
    expect(migration).not.toContain("'event_name', reservation.event_name")
    expect(migration).not.toContain("'responsible_name', reservation.responsible_name")
  })
})
