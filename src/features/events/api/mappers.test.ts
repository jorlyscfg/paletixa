import { describe, expect, it } from 'vitest'
import { mapEventAvailability, mapEventReservation } from './mappers'

const reservationRow = {
  reservation_id: 'reservation-1',
  request_id: 'request-1',
  customer_name: 'Mariana Torres',
  customer_phone: '+525512345678',
  customer_email: 'mariana@example.com',
  event_date: '2099-09-12',
  cart_allocated: true,
  status: 'reserved',
  origin: 'public',
  payment_plan: 'advance',
  total_mxn: '125.50',
  declared_payment_amount: '50.00',
  declared_payment_method: 'transfer',
  declared_payment_reference: 'folio-1',
  transfer_ticket_url: 'https://example.invalid/signed-ticket',
  transfer_ticket_key: 'events/11111111-1111-4111-8111-111111111111/receipt.webp',
  confirmed_payment_amount: '50.00',
  confirmed_payment_method: 'transfer',
  confirmed_payment_reference: 'folio-1',
  confirmed_payment_note: null,
  payment_confirmed_at: '2099-08-01T12:00:00Z',
  payment_confirmed_by: 'admin-1',
  remaining_payment_amount: '75.50',
  remaining_payment_method: null,
  remaining_payment_note: null,
  remaining_transfer_ticket_url: 'https://example.invalid/final-ticket',
  remaining_transfer_ticket_key: 'events/11111111-1111-4111-8111-111111111111/final.webp',
  reserved_at: '2099-08-01T12:00:00Z',
  reserved_by: 'admin-1',
  completed_at: null,
  cancelled_at: null,
  cancelled_by: null,
  cancellation_reason: null,
  sale_id: null,
  created_by: null,
  created_at: '2099-08-01T11:00:00Z',
  updated_at: '2099-08-01T12:00:00Z',
  admin_seen_at: '2099-08-01T11:30:00Z',
  admin_seen_by: 'admin-1',
  items: [{
    id: 'item-1', line_kind: 'category', product_id: null, category_id: 'category-1',
    category_name: 'Paletas', product_name: 'Paletas', unit_price_mxn: '62.75', quantity: 2, line_total_mxn: '125.50',
  }],
}

describe('event mappers', () => {
  it('maps reservation rows and category identity without inventing product data', () => {
    expect(mapEventReservation([reservationRow])).toMatchObject({
      id: 'reservation-1',
      status: 'reserved',
      cartAllocated: true,
      totalMxn: 125.5,
      remainingPaymentAmount: 75.5,
      transferTicket: { url: 'https://example.invalid/signed-ticket', key: 'events/11111111-1111-4111-8111-111111111111/receipt.webp' },
      remainingTransferTicket: { url: 'https://example.invalid/final-ticket', key: 'events/11111111-1111-4111-8111-111111111111/final.webp' },
      items: [{ lineKind: 'category', productId: null, categoryId: 'category-1', quantity: 2, lineTotalMxn: 125.5 }],
    })
  })

  it('maps availability counts from numeric API values', () => {
    expect(mapEventAvailability([{ event_date: '2099-09-12', capacity_limit: 7, allocated_count: '2', available_count: 5 }])).toEqual({
      eventDate: '2099-09-12', capacityLimit: 7, allocatedCount: 2, availableCount: 5,
    })
  })
})
