import { describe, expect, it } from 'vitest'
import migration from '../../../../migrations/20260826222316_add-event-transfer-tickets.sql?raw'
import canonicalizeRpcs from '../../../../migrations/20260826230000_canonicalize-event-reservation-rpcs.sql?raw'

describe('event transfer ticket migration', () => {
  it('adds durable private ticket fields and expands the active projection', () => {
    expect(migration).toContain('add column transfer_ticket_url text')
    expect(migration).toContain('add column transfer_ticket_key text')
    expect(migration).toContain('alter type public.event_reservation_projection_row_v2 add attribute transfer_ticket_url text')
    expect(migration).toContain('alter type public.event_reservation_projection_row_v2 add attribute transfer_ticket_key text')
    expect(migration).toContain("'^events/' || request_id::text || '/[A-Za-z0-9._-]+$'")
    expect(migration).toContain('p_transfer_ticket_url text')
    expect(migration).toContain('p_transfer_ticket_key text')
    expect(migration).not.toContain('event_name')
    expect(migration).not.toContain('responsible_name')
  })

  it('recreates changed RPC signatures while retaining event idempotency and audit guards', () => {
    expect(migration).toContain('create function public.create_event_reservation_public')
    expect(migration).toContain('create function public.reserve_event_reservation')
    expect(migration).toContain('perform public.reserve_event_reservation(')
    expect(migration).toContain("jsonb_build_object('transfer_ticket_key', normalized_key)")
    expect(migration).toContain('grant execute on function public.create_event_reservation_public')
  })

  it('canonicalizes the public RPC surface without dropping dependent implementations', () => {
    expect(canonicalizeRpcs).toContain('rename to create_event_reservation_public_legacy')
    expect(canonicalizeRpcs).toContain('rename to create_event_reservation_admin_legacy')
    expect(canonicalizeRpcs).toContain('rename to reserve_event_reservation_legacy')
    expect(canonicalizeRpcs).toContain('revoke all on function public.create_event_reservation_public_legacy')
    expect(canonicalizeRpcs).toContain('public.create_event_reservation_public_legacy(')
    expect(canonicalizeRpcs).toContain('public.create_event_reservation_admin_legacy(')
    expect(canonicalizeRpcs).toContain('public.reserve_event_reservation_legacy(')
  })
})
