import { createWholesaleRequestId } from '../../wholesale/ui/wholesaleUiUtils'
import { normalizeEventDate, normalizeEventEmail, normalizeEventPhone } from '../api/validators'
import type { EventPaymentMethod, EventPaymentPlan, EventReservationOrigin } from '../api/types'
import type { EventTransferTicket } from '../api/types'

export type EventFormState = {
  customerName: string
  customerPhone: string
  customerEmail: string
  eventDate: string
  paymentPlan: EventPaymentPlan
  advanceAmount: string
  paymentMethod: EventPaymentMethod
  paymentReference: string
  transferTicket: EventTransferTicket | null
}

export type EventFormErrors = Partial<Record<keyof EventFormState | 'items' | 'payment', string>>

export const EVENT_ORIGIN_LABELS: Record<EventReservationOrigin, string> = {
  public: 'Sitio público',
  whatsapp: 'WhatsApp',
  phone: 'Teléfono',
  other: 'Otro',
}

export function createEventRequestId() {
  return createWholesaleRequestId()
}

function formatLocalDate(date: Date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

export function formatEventDate(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : formatLocalDate(date)
}

export function formatEventCreatedDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : formatLocalDate(date)
}

const eventMoneyFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function formatEventMoney(value: number) {
  return `$${eventMoneyFormatter.format(value)} MXN`
}

export function createEmptyEventForm(): EventFormState {
  return {
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    eventDate: '',
    paymentPlan: 'advance',
    advanceAmount: '',
    paymentMethod: 'cash',
    paymentReference: '',
    transferTicket: null,
  }
}

function textError(value: string, label: string) {
  const normalized = value.trim()
  if (normalized === '') return `${label} es obligatorio.`
  if (normalized.length < 2) return `${label} debe tener al menos 2 caracteres.`
  if (normalized.length > 160) return `${label} no puede superar 160 caracteres.`
  return ''
}

export function validateEventForm(form: EventFormState, totalMxn: number): EventFormErrors {
  const errors: EventFormErrors = {}
  const customerNameError = textError(form.customerName, 'El nombre del cliente')
  if (customerNameError) errors.customerName = customerNameError
  try { normalizeEventPhone(form.customerPhone) } catch { errors.customerPhone = 'Ingresa un teléfono válido de 10 dígitos.' }
  if (form.customerEmail.trim() !== '') {
    try { normalizeEventEmail(form.customerEmail) } catch { errors.customerEmail = 'Ingresa un correo válido.' }
  }
  try {
    const normalizedDate = normalizeEventDate(form.eventDate)
    const today = new Date()
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    if (normalizedDate < todayValue) errors.eventDate = 'La fecha del evento no puede ser anterior a hoy.'
  } catch { errors.eventDate = 'La fecha del evento no es válida.' }
  if (!Number.isSafeInteger(totalMxn) || totalMxn <= 0) errors.items = 'El total de la reserva debe ser un importe entero positivo.'
  if (form.paymentPlan === 'advance') {
    const amount = Number(form.advanceAmount)
    if (!Number.isSafeInteger(amount) || amount <= 0) errors.advanceAmount = 'El anticipo debe ser un importe entero positivo.'
    else if (amount >= totalMxn) errors.advanceAmount = 'El anticipo debe ser menor que el total. Selecciona Pago total si cubrirá todo el importe.'
  }
  if (form.paymentMethod === 'transfer' && form.paymentReference.trim().length > 160) errors.paymentReference = 'La referencia no puede superar 160 caracteres.'
  return errors
}

export function eventFormErrorMessage(errors: EventFormErrors) {
  return [...new Set(Object.values(errors).filter(Boolean))].join(' ')
}
