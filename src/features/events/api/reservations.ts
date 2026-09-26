import { insforge } from '../../../lib/insforge'
import { mapEventAvailability, mapEventReservation, mapEventReservationList } from './mappers'
import { normalizeEventCustomerName, normalizeEventDate, normalizeEventEmail, normalizeEventPhone, normalizeEventReason, normalizeEventItems, normalizeEventMoney, normalizeEventOptionalText, normalizeEventOrigin, normalizeEventPaymentMethod, normalizeEventPaymentPlan, normalizeEventRequestId, normalizeEventTransferTicket } from './validators'
import type { EventPaymentMethod, EventPaymentPlan, EventReservation, EventReservationCompletionInput, EventReservationItemInput, EventReservationOrigin, EventTransferTicket } from './types'

export const EVENT_SESSION_EXPIRED_ERROR = 'Tu sesión administrativa expiró. Inicia sesión nuevamente para completar la reserva.'

export type CreateEventReservationInput = {
  requestId: string
  customerName: string
  customerPhone: string
  customerEmail?: string | null
  eventDate: string
  items: EventReservationItemInput[]
  paymentPlan: EventPaymentPlan
  declaredPaymentAmount: number
  declaredPaymentMethod: EventPaymentMethod
  declaredPaymentReference?: string | null
  transferTicket?: EventTransferTicket | null
}

export type CreateAdminEventReservationInput = CreateEventReservationInput & {
  origin: EventReservationOrigin
}

function reservationPayload(input: CreateEventReservationInput) {
  const requestId = normalizeEventRequestId(input.requestId)
  const paymentMethod = normalizeEventPaymentMethod(input.declaredPaymentMethod, 'Declared payment method')
  const transferTicket = normalizeEventTransferTicket(requestId, paymentMethod, input.transferTicket)
  return {
    p_request_id: requestId,
    p_customer_name: normalizeEventCustomerName(input.customerName),
    p_customer_phone: normalizeEventPhone(input.customerPhone),
    p_customer_email: normalizeEventEmail(input.customerEmail),
    p_event_date: normalizeEventDate(input.eventDate),
    p_items: normalizeEventItems(input.items),
    p_payment_plan: normalizeEventPaymentPlan(input.paymentPlan),
    p_declared_payment_amount: normalizeEventMoney(input.declaredPaymentAmount, 'Declared payment amount'),
    p_declared_payment_method: paymentMethod,
    p_declared_payment_reference: paymentMethod === 'transfer'
      ? normalizeEventOptionalText(input.declaredPaymentReference, 'Declared payment reference', 160)
      : null,
    p_transfer_ticket_url: transferTicket.url,
    p_transfer_ticket_key: transferTicket.key,
  }
}

export async function createPublicEventReservation(input: CreateEventReservationInput): Promise<EventReservation> {
  const payload = reservationPayload(input)
  const { data, error } = await insforge.database.rpc('create_event_reservation_public', payload)
  if (error) throw error
  return mapEventReservation(data)
}

export async function getPublicEventReservation(requestId: string): Promise<EventReservation> {
  const { data, error } = await insforge.database.rpc('get_event_reservation_public', { p_request_id: normalizeEventRequestId(requestId) })
  if (error) throw error
  return mapEventReservation(data)
}

export async function getEventAvailability(eventDate: string): Promise<ReturnType<typeof mapEventAvailability>> {
  const { data, error } = await insforge.database.rpc('get_event_availability', { p_event_date: normalizeEventDate(eventDate) })
  if (error) throw error
  return mapEventAvailability(data)
}

export async function createAdminEventReservation(input: CreateAdminEventReservationInput): Promise<EventReservation> {
  const payload = reservationPayload(input)
  const { data, error } = await insforge.database.rpc('create_event_reservation_admin', {
    ...payload,
    p_origin: normalizeEventOrigin(input.origin),
  })
  if (error) throw error
  return mapEventReservation(data)
}

export async function listEventReservations(includeCancelled = true): Promise<EventReservation[]> {
  const { data, error } = await insforge.database.rpc('list_event_reservations', { p_include_cancelled: includeCancelled })
  if (error) throw error
  return mapEventReservationList(data)
}

export async function markEventReservationSeen(input: { requestId: string; reservationId: string }): Promise<EventReservation> {
  const { data, error } = await insforge.database.rpc('mark_event_reservation_seen', {
    p_request_id: normalizeEventRequestId(input.requestId),
    p_reservation_id: normalizeEventRequestId(input.reservationId),
  })
  if (error) throw error
  return mapEventReservation(data)
}

export async function reserveEventReservation(input: { requestId: string; reservationId: string; paymentAmount: number; paymentMethod: EventPaymentMethod; paymentReference?: string | null; paymentNote?: string | null; transferTicket?: EventTransferTicket | null }): Promise<EventReservation> {
  const paymentMethod = normalizeEventPaymentMethod(input.paymentMethod, 'Confirmed payment method')
  const transferTicket = paymentMethod === 'transfer' ? input.transferTicket ?? null : null
  const { data, error } = await insforge.database.rpc('reserve_event_reservation', {
    p_request_id: normalizeEventRequestId(input.requestId),
    p_reservation_id: normalizeEventRequestId(input.reservationId),
    p_payment_amount: normalizeEventMoney(input.paymentAmount, 'Confirmed payment amount'),
    p_payment_method: paymentMethod,
    p_payment_reference: paymentMethod === 'transfer'
      ? normalizeEventOptionalText(input.paymentReference, 'Payment reference', 160)
      : null,
    p_payment_note: normalizeEventOptionalText(input.paymentNote, 'Payment note', 500),
    p_transfer_ticket_url: transferTicket?.url ?? null,
    p_transfer_ticket_key: transferTicket?.key ?? null,
  })
  if (error) throw error
  return mapEventReservation(data)
}

export async function cancelEventReservation(input: { requestId: string; reservationId: string; reason: string }): Promise<EventReservation> {
  const { data, error } = await insforge.database.rpc('cancel_event_reservation', {
    p_request_id: normalizeEventRequestId(input.requestId),
    p_reservation_id: normalizeEventRequestId(input.reservationId),
    p_reason: normalizeEventReason(input.reason),
  })
  if (error) throw error
  return mapEventReservation(data)
}

export async function completeEventReservation(input: { requestId: string; reservationId: string; reason: string; completion?: Omit<EventReservationCompletionInput, 'reason'> | null }): Promise<EventReservation> {
  const completion = input.completion ?? {}
  const requestId = normalizeEventRequestId(input.requestId)
  const remainingPaymentAmount = completion.remainingPaymentAmount === undefined || completion.remainingPaymentAmount === null
    ? null
    : normalizeEventMoney(completion.remainingPaymentAmount, 'Remaining payment amount', true)
  const remainingPaymentMethod = completion.remainingPaymentMethod === undefined || completion.remainingPaymentMethod === null
    ? null
    : normalizeEventPaymentMethod(completion.remainingPaymentMethod, 'Remaining payment method')
  const remainingTransferTicket = normalizeEventTransferTicket(requestId, remainingPaymentMethod ?? 'cash', completion.remainingTransferTicket)
  const payload = {
    p_request_id: requestId,
    p_reservation_id: normalizeEventRequestId(input.reservationId),
    p_reason: normalizeEventReason(input.reason),
    p_remaining_payment_amount: remainingPaymentAmount,
    p_remaining_payment_method: remainingPaymentMethod,
    p_remaining_payment_note: normalizeEventOptionalText(completion.remainingPaymentNote, 'Remaining payment note', 500),
    p_remaining_transfer_ticket_url: remainingTransferTicket.url,
    p_remaining_transfer_ticket_key: remainingTransferTicket.key,
    p_confirm_date_change: completion.confirmDateChange === true,
    p_allow_without_cart: completion.allowWithoutCart === true,
  }

  const complete = async () => insforge.database.rpc('complete_event_reservation', payload)
  const firstAttempt = await complete()
  if (!firstAttempt.error) return mapEventReservation(firstAttempt.data)
  if (!isUnauthorizedError(firstAttempt.error)) throw firstAttempt.error

  let session: Awaited<ReturnType<typeof insforge.auth.getCurrentUser>>
  try {
    session = await insforge.auth.getCurrentUser()
  } catch {
    throw new Error(EVENT_SESSION_EXPIRED_ERROR)
  }
  if (session.error || !session.data?.user) throw new Error(EVENT_SESSION_EXPIRED_ERROR)

  const retry = await complete()
  if (retry.error) {
    if (isUnauthorizedError(retry.error)) throw new Error(EVENT_SESSION_EXPIRED_ERROR)
    throw retry.error
  }
  return mapEventReservation(retry.data)
}

function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const details = error as { statusCode?: number | string; status?: number | string; error?: unknown }
  if (details.statusCode === 401 || details.statusCode === '401' || details.status === 401 || details.status === '401') return true
  return details.error !== error && isUnauthorizedError(details.error)
}
