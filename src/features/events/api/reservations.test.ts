import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  auth: { getCurrentUser: vi.fn() },
  database: { rpc: vi.fn() },
}))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))

import { completeEventReservation, createPublicEventReservation, reserveEventReservation } from './reservations'

const mappedReservation = {
  reservation_id: 'reservation-1', request_id: 'request-1', customer_name: 'Mariana Torres', customer_phone: '+525512345678', customer_email: null,
  event_date: '2099-09-12', cart_allocated: true, status: 'reserved', origin: 'public', payment_plan: 'advance',
  total_mxn: 125, declared_payment_amount: 50, declared_payment_method: 'cash', declared_payment_reference: null, confirmed_payment_amount: 50, confirmed_payment_method: 'cash',
  confirmed_payment_reference: null, confirmed_payment_note: null, payment_confirmed_at: null, payment_confirmed_by: null, remaining_payment_amount: 75, remaining_payment_method: null,
  remaining_payment_note: null, remaining_transfer_ticket_url: null, remaining_transfer_ticket_key: null, reserved_at: null, reserved_by: null, completed_at: null, cancelled_at: null, cancelled_by: null,
  cancellation_reason: null, sale_id: null, created_by: null, created_at: '2099-09-12T00:00:00Z', updated_at: '2099-09-12T00:00:00Z', admin_seen_at: null, admin_seen_by: null, items: [],
}

describe('event reservation API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('normalizes public creation payloads before calling the RPC', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [mappedReservation], error: null })
    await expect(createPublicEventReservation({
      requestId: 'request-1', customerName: '  Mariana Torres ', customerPhone: '55 1234 5678', customerEmail: 'MARIANA@example.com',
       eventDate: '2099-09-12', items: [{ productId: 'product-1', quantity: 1 }],
       paymentPlan: 'advance', declaredPaymentAmount: 50, declaredPaymentMethod: 'cash', declaredPaymentReference: 'stale-cash-reference',
    })).resolves.toMatchObject({ id: 'reservation-1', customerPhone: '+525512345678' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('create_event_reservation_public', expect.objectContaining({
      p_customer_name: 'Mariana Torres', p_customer_phone: '+525512345678', p_customer_email: 'mariana@example.com',
      p_items: [{ line_kind: 'product', product_id: 'product-1', quantity: 1 }],
    }))
    const payload = sdk.database.rpc.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('p_event_name')
    expect(payload).not.toHaveProperty('p_responsible_name')
    expect(payload.p_declared_payment_reference).toBeNull()
  })

  it('sends completion details without the removed remaining-payment reference', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [mappedReservation], error: null })
    await completeEventReservation({
      requestId: 'request-2', reservationId: 'reservation-1', reason: 'Entrega confirmada',
      completion: { remainingPaymentAmount: 75, remainingPaymentMethod: 'transfer', remainingPaymentNote: 'Saldo recibido', remainingTransferTicket: { url: 'https://example.invalid/final', key: 'events/request-2/final.webp' }, confirmDateChange: true, allowWithoutCart: false },
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('complete_event_reservation', {
      p_request_id: 'request-2', p_reservation_id: 'reservation-1', p_reason: 'Entrega confirmada',
      p_remaining_payment_amount: 75, p_remaining_payment_method: 'transfer', p_remaining_payment_note: 'Saldo recibido',
      p_remaining_transfer_ticket_url: 'https://example.invalid/final', p_remaining_transfer_ticket_key: 'events/request-2/final.webp',
      p_confirm_date_change: true, p_allow_without_cart: false,
    })
  })

  it('rehydrates auth once after a 401 and retries the same idempotent request', async () => {
    sdk.database.rpc
      .mockResolvedValueOnce({ data: null, error: { statusCode: 401 } })
      .mockResolvedValueOnce({ data: [mappedReservation], error: null })
    sdk.auth.getCurrentUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })

    await completeEventReservation({ requestId: 'request-401', reservationId: 'reservation-1', reason: 'Entrega confirmada' })

    expect(sdk.auth.getCurrentUser).toHaveBeenCalledOnce()
    expect(sdk.database.rpc).toHaveBeenCalledTimes(2)
    expect(sdk.database.rpc.mock.calls[0]).toEqual(sdk.database.rpc.mock.calls[1])
    expect((sdk.database.rpc.mock.calls[0][1] as Record<string, unknown>).p_request_id).toBe('request-401')
  })

  it('maps an unrecoverable completion 401 to a clear Spanish session message', async () => {
    sdk.database.rpc.mockResolvedValue({ data: null, error: { statusCode: 401 } })
    sdk.auth.getCurrentUser.mockResolvedValue({ data: null, error: { statusCode: 401 } })

    await expect(completeEventReservation({ requestId: 'request-expired', reservationId: 'reservation-1', reason: 'Entrega confirmada' })).rejects.toThrow('Tu sesión administrativa expiró')
    expect(sdk.database.rpc).toHaveBeenCalledOnce()
  })

  it('sends the durable event transfer ticket key with public creation', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [mappedReservation], error: null })
    const requestId = '11111111-1111-4111-8111-111111111111'
    await createPublicEventReservation({
      requestId, customerName: 'Mariana Torres', customerPhone: '55 1234 5678', eventDate: '2099-09-12',
      items: [{ productId: 'product-1', quantity: 1 }], paymentPlan: 'advance', declaredPaymentAmount: 50,
      declaredPaymentMethod: 'transfer', transferTicket: { url: 'https://example.invalid/signed', key: `events/${requestId}/receipt.webp` },
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('create_event_reservation_public', expect.objectContaining({
      p_transfer_ticket_url: 'https://example.invalid/signed',
      p_transfer_ticket_key: `events/${requestId}/receipt.webp`,
    }))
  })

  it('sends an optional replacement ticket with reserve verification', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [mappedReservation], error: null })
    const requestId = '22222222-2222-4222-8222-222222222222'
    await reserveEventReservation({
      requestId: 'reserve-request-1', reservationId: 'reservation-1', paymentAmount: 50, paymentMethod: 'transfer',
      transferTicket: { url: 'https://example.invalid/signed', key: `events/${requestId}/receipt.webp` },
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('reserve_event_reservation', expect.objectContaining({
      p_transfer_ticket_url: 'https://example.invalid/signed',
      p_transfer_ticket_key: `events/${requestId}/receipt.webp`,
    }))
  })

  it('does not send a transfer ticket when payment is verified as cash', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [mappedReservation], error: null })
    await reserveEventReservation({
      requestId: 'reserve-request-2', reservationId: 'reservation-1', paymentAmount: 50, paymentMethod: 'cash',
      transferTicket: { url: 'https://example.invalid/signed', key: 'events/22222222-2222-4222-8222-222222222222/receipt.webp' },
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('reserve_event_reservation', expect.objectContaining({
      p_payment_method: 'cash', p_payment_reference: null, p_transfer_ticket_url: null, p_transfer_ticket_key: null,
    }))
  })

  it('does not send a remaining payment reference when completion payment is cash', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [mappedReservation], error: null })
    await completeEventReservation({
      requestId: 'request-3', reservationId: 'reservation-1', reason: 'Entrega confirmada',
      completion: { remainingPaymentAmount: 75, remainingPaymentMethod: 'cash', remainingTransferTicket: null },
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('complete_event_reservation', expect.objectContaining({
      p_remaining_payment_method: 'cash', p_remaining_transfer_ticket_url: null, p_remaining_transfer_ticket_key: null,
    }))
  })
})
