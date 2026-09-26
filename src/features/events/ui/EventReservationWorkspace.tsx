import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { InfoButton } from '../../../app/components/InfoButton'
import { MobileBottomActionBar } from '../../../app/components/MobileBottomActionBar'
import { Modal } from '../../../app/components/Modal'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { SearchInput } from '../../../app/components/SearchInput'
import { Icon, type IconName } from '../../../app/components/icons'
import { isSessionRecord, isSessionString, useAdminSessionPersistence } from '../../../app/sessionPersistence'
import { getEventConfiguration, DEFAULT_EVENT_CART_CAPACITY, type EventConfiguration } from '../../configuration/api/configuration'
import { listPublicWholesaleCatalog, type WholesaleCatalogProduct } from '../../wholesale/api/catalog'
import { cleanupEventTransferTickets, refreshAdminEventTransferTicketUrl, removeAdminEventTransferTicket, uploadAdminEventTransferTicket } from '../../wholesale/api/transferTickets'
import { CustomerOrderSummary, DraftCatalog } from '../../wholesale/ui/WholesaleCustomerPortal'
import { createEmptyWholesaleDraft, getWholesaleDraftTotal, getWholesaleWhatsAppUrl, toWholesaleOrderItems, type WholesaleDraft } from '../../wholesale/ui/wholesaleUiUtils'
import { cancelEventReservation, completeEventReservation, createAdminEventReservation, EVENT_SESSION_EXPIRED_ERROR, getEventAvailability, listEventReservations, markEventReservationSeen, reserveEventReservation } from '../api/reservations'
import { subscribeToEventReservationEvents } from '../api/realtime'
import type { EventPaymentMethod, EventReservation, EventReservationItemInput, EventReservationOrigin, EventReservationState, EventTransferTicket } from '../api/types'
import { EVENT_RESERVATION_STATES } from '../api/validators'
import { EventChoiceButtons, EventFieldTitle, EventReservationDetails } from './eventUiUtils'
import { EVENT_ORIGIN_LABELS, createEmptyEventForm, createEventRequestId, eventFormErrorMessage, formatEventCreatedDate, formatEventDate, formatEventMoney, validateEventForm, type EventFormErrors, type EventFormState } from './eventFormUtils'

const EVENT_STATUS_LABELS: Record<EventReservationState, string> = { pending: 'Pendiente', reserved: 'Reservada', completed: 'Completada', cancelled: 'Cancelada' }
const EVENT_PAYMENT_LABELS: Record<EventPaymentMethod, string> = { cash: 'Efectivo', transfer: 'Transferencia' }

type EventComposerSession = {
  draft: { reorderFromOrderId: null; draftAction: null; items: Record<string, number>; paymentMethod: WholesaleDraft['paymentMethod'] }
  form: Omit<EventFormState, 'transferTicket'>
  origin: EventReservationOrigin
  mobileStep: 'catalog' | 'review'
}
type EventAdminSessionState = { filter: 'all' | EventReservationState; query: string; tab: 'management' | 'create'; composer: EventComposerSession }

function isNonNegativeIntegerRecord(value: unknown): value is Record<string, number> {
  return isSessionRecord(value) && Object.entries(value).every(([key, item]) => key.trim() !== '' && typeof item === 'number' && Number.isSafeInteger(item) && item >= 0)
}

function isEventComposerSession(value: unknown): value is EventComposerSession {
  if (!isSessionRecord(value) || !isSessionRecord(value.draft) || !isSessionRecord(value.form) || !isSessionString(value.origin) || !['public', 'whatsapp', 'phone', 'other'].includes(value.origin) || !isSessionString(value.mobileStep) || !['catalog', 'review'].includes(value.mobileStep)) return false
  const draft = value.draft
  const form = value.form
  return draft.reorderFromOrderId === null && draft.draftAction === null && isNonNegativeIntegerRecord(draft.items) && isSessionString(draft.paymentMethod) && ['cash', 'credit', 'transfer'].includes(draft.paymentMethod) && isSessionString(form.customerName) && isSessionString(form.customerPhone) && isSessionString(form.customerEmail) && isSessionString(form.eventDate) && isSessionString(form.paymentPlan) && ['advance', 'full'].includes(form.paymentPlan) && isSessionString(form.advanceAmount) && isSessionString(form.paymentMethod) && ['cash', 'transfer'].includes(form.paymentMethod) && isSessionString(form.paymentReference)
}

function isEventAdminSessionState(value: unknown): value is EventAdminSessionState {
  return isSessionRecord(value) && isSessionString(value.filter) && ['all', ...EVENT_RESERVATION_STATES].includes(value.filter) && isSessionString(value.query) && isSessionString(value.tab) && ['management', 'create'].includes(value.tab) && isEventComposerSession(value.composer)
}

const emptyEventComposerSession = (): EventComposerSession => {
  const initial = createEmptyEventForm()
  const form: EventComposerSession['form'] = { customerName: initial.customerName, customerPhone: initial.customerPhone, customerEmail: initial.customerEmail, eventDate: initial.eventDate, paymentPlan: initial.paymentPlan, advanceAmount: initial.advanceAmount, paymentMethod: initial.paymentMethod, paymentReference: initial.paymentReference }
  return { draft: { reorderFromOrderId: null, draftAction: null, items: {}, paymentMethod: 'cash' }, form, origin: 'whatsapp', mobileStep: 'catalog' }
}

function todayValue() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function EventReservationParameter({ icon, label, parameter, children }: { icon: IconName; label: string; parameter: string; children: ReactNode }) {
  return <span data-parameter={parameter} title={label} className="inline-flex items-center gap-1.5"><Icon name={icon} className="h-4 w-4 shrink-0 text-slate-500" /><span className="sr-only">{label}</span>{children}</span>
}

function EventReservationDate({ dateTime, label, parameter, value }: { dateTime: string; label: string; parameter: string; value: string }) {
  return <span data-header-field={parameter} className="shrink-0"><EventReservationParameter icon="calendar" label={label} parameter={parameter}><time dateTime={dateTime} aria-label={`${label}: ${value}`} className="text-slate-300">{value}</time></EventReservationParameter></span>
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === EVENT_SESSION_EXPIRED_ERROR) return message
  if (/event date is at capacity|confirm completion without a cart|no-cart override is not allowed|event date has cart capacity/i.test(message)) {
    return 'La disponibilidad cambió mientras confirmabas la entrega. Vuelve a verificar la fecha actual y elige la opción disponible.'
  }
  if (/date change requires confirmation|confirmations must be false|reserved event has no cart allocation/i.test(message)) {
    return 'La reserva cambió antes de completar la entrega. Vuelve a abrir la finalización para verificar su fecha y carrito.'
  }
  if (/event reservation completion date changed|event reservation can only be completed|event date changed|current date/i.test(message)) {
    return 'La fecha actual cambió mientras confirmabas la entrega. Verifica la disponibilidad y vuelve a intentarlo.'
  }
  return message || 'No se pudo completar la operación.'
}

async function refreshEventReservationTransferTicket(reservation: EventReservation) {
  let refreshed = reservation
  if (reservation.transferTicket?.key) {
    try {
      const transferTicket = await refreshAdminEventTransferTicketUrl(reservation.id, reservation.requestId, reservation.transferTicket.key)
      refreshed = { ...refreshed, transferTicket }
    } catch {
      // Keep the existing receipt if refreshing its signed URL fails.
    }
  }
  if (reservation.remainingTransferTicket?.key) {
    try {
      const remainingTransferTicket = await refreshAdminEventTransferTicketUrl(reservation.id, reservation.requestId, reservation.remainingTransferTicket.key)
      refreshed = { ...refreshed, remainingTransferTicket }
    } catch {
      // Keep the existing receipt if refreshing its signed URL fails.
    }
  }
  return refreshed
}

async function refreshEventReservationTransferTickets(reservations: EventReservation[]) {
  return Promise.all(reservations.map((reservation) => refreshEventReservationTransferTicket(reservation)))
}

function EventCancelModal({ reservation, onClose, onCancelled }: { reservation: EventReservation; onClose: () => void; onCancelled: (reservation: EventReservation) => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (!reason.trim()) { setError('El motivo es obligatorio.'); return }
    setBusy(true)
    setError('')
    try {
      await onCancelled(await cancelEventReservation({ requestId: createEventRequestId(), reservationId: reservation.id, reason }))
      onClose()
    } catch (cancelError) { setError(errorMessage(cancelError)) } finally { setBusy(false) }
  }

  return <Modal title="Cancelar reserva" description="La cancelación libera el carrito si la reserva ya estaba confirmada." closeLabel="Cerrar cancelación" onClose={onClose} busy={busy} maxWidthClassName="max-w-lg" headerActions={<ResponsiveActionButton label="Confirmar cancelación" icon="close" loading={busy} loadingLabel="Cancelando…" onClick={() => void confirm()} className="bg-amber-600 text-white hover:bg-amber-500" />}>
    <div className="grid gap-4 p-4 sm:p-6">
      <label className="ops-field-label"><EventFieldTitle label="Motivo" status="Obligatorio" /><textarea aria-label="Motivo de cancelación" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="ops-control mt-2 px-3 py-2" /></label>
      {error && <p role="alert" className="ops-state ops-state-error rounded-xl px-3 py-2 text-sm text-rose-100">{error}</p>}
    </div>
  </Modal>
}

function EventReserveModal({ reservation, onClose, onReserved }: { reservation: EventReservation; onClose: () => void; onReserved: (reservation: EventReservation) => Promise<void> }) {
  const [amount, setAmount] = useState(String(reservation.declaredPaymentAmount))
  const [method, setMethod] = useState<EventPaymentMethod>(reservation.declaredPaymentMethod)
  const [reference, setReference] = useState(reservation.declaredPaymentMethod === 'transfer' ? reservation.declaredPaymentReference ?? '' : '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ticketBusy, setTicketBusy] = useState(false)
  const [transferTicket, setTransferTicket] = useState<EventTransferTicket | null>(reservation.transferTicket)
  const ticketInputRef = useRef<HTMLInputElement>(null)

  async function selectTicket(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file || method !== 'transfer') return
    setTicketBusy(true)
    setError('')
    try {
      setTransferTicket(await uploadAdminEventTransferTicket(reservation.requestId, file))
    } catch (ticketError) {
      setError(errorMessage(ticketError))
    } finally {
      setTicketBusy(false)
    }
  }

  async function removeTicket() {
    if (!transferTicket || (reservation.transferTicket?.key === transferTicket.key)) return
    setTicketBusy(true)
    setError('')
    try {
      await removeAdminEventTransferTicket(reservation.requestId, transferTicket.key)
      setTransferTicket(reservation.transferTicket)
    } catch (ticketError) {
      setError(errorMessage(ticketError))
    } finally {
      setTicketBusy(false)
    }
  }

  function changePaymentMethod(paymentMethod: EventPaymentMethod) {
    setMethod(paymentMethod)
    if (paymentMethod === 'cash') setReference('')
  }

  async function confirm() {
    const paymentAmount = Number(amount)
    if (!Number.isSafeInteger(paymentAmount) || paymentAmount <= 0) { setError('Captura un importe entero positivo.'); return }
    if (reservation.paymentPlan === 'full' && paymentAmount !== reservation.totalMxn) { setError('El pago total debe cubrir el importe completo de la reserva.'); return }
    if (reservation.paymentPlan === 'advance' && paymentAmount >= reservation.totalMxn) { setError('El anticipo debe ser menor que el total.'); return }
    setBusy(true)
    setError('')
    try {
      await onReserved(await reserveEventReservation({ requestId: createEventRequestId(), reservationId: reservation.id, paymentAmount, paymentMethod: method, paymentReference: method === 'transfer' ? reference : null, paymentNote: note, transferTicket }))
      onClose()
    } catch (reserveError) { setError(errorMessage(reserveError)) } finally { setBusy(false) }
  }

  return <Modal title="Verificar pago y reservar" description="Solo una reserva confirmada consume un carrito para la fecha del evento." closeLabel="Cerrar confirmación" onClose={onClose} busy={busy || ticketBusy} maxWidthClassName="max-w-xl" headerActions={<ResponsiveActionButton label="Verificar y reservar" icon="check" loading={busy} loadingLabel="Reservando…" onClick={() => void confirm()} className="bg-emerald-600 text-white hover:bg-emerald-500" />}>
    <div className="grid gap-4 p-4 sm:p-6">
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100"><p>Fecha del evento: <strong>{reservation.eventDate}</strong></p><p className="mt-1">Total: <strong>{formatEventMoney(reservation.totalMxn)}</strong> · Cliente indicó {formatEventMoney(reservation.declaredPaymentAmount)} por {EVENT_PAYMENT_LABELS[reservation.declaredPaymentMethod]}.</p></div>
      <label className="ops-field-label"><EventFieldTitle label="Importe verificado" status="Obligatorio" /><input aria-label="Importe verificado" type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy || ticketBusy} className="ops-control mt-2 px-3" /></label>
      <fieldset><legend className="text-xs font-bold text-slate-300"><EventFieldTitle label="Método verificado" status="Obligatorio" /></legend><EventChoiceButtons label="Método verificado" value={method} options={[{ value: 'cash', label: 'Efectivo' }, { value: 'transfer', label: 'Transferencia' }]} onChange={changePaymentMethod} disabled={busy || ticketBusy} /></fieldset>
      {method === 'transfer' && <label className="ops-field-label"><EventFieldTitle label="Referencia" status="Opcional" /><input aria-label="Referencia verificada" value={reference} onChange={(event) => setReference(event.target.value)} disabled={busy || ticketBusy} className="ops-control mt-2 px-3" /></label>}
      {method === 'transfer' && <div className="grid gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3"><div><EventFieldTitle label="Comprobante de transferencia" status="Opcional" /><p className="mt-1 text-xs leading-relaxed text-slate-400">Adjunta una imagen si hace falta para validar el pago antes de reservar.</p></div><input ref={ticketInputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Comprobante de transferencia de la reserva (opcional)" onChange={selectTicket} disabled={busy || ticketBusy} className="sr-only" /><div className="flex min-w-0 items-center gap-3"><CatalogImageTile src={transferTicket?.url ?? null} alt="Vista previa del comprobante de transferencia" imageClassName="object-contain" role="button" tabIndex={busy || ticketBusy ? -1 : 0} aria-disabled={busy || ticketBusy} title="Cambiar comprobante" onClick={() => ticketInputRef.current?.click()} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && !busy && !ticketBusy) { event.preventDefault(); ticketInputRef.current?.click() } }} className="h-16 w-16 shrink-0 cursor-pointer rounded-lg border-slate-700 bg-slate-900 ops-focus aria-disabled:cursor-not-allowed aria-disabled:opacity-60" /><div className="flex min-w-0 flex-wrap items-center gap-2"><ResponsiveActionButton type="button" label="Cambiar comprobante" icon="edit" iconOnly aria-label="Cambiar comprobante" title="Cambiar comprobante" onClick={() => ticketInputRef.current?.click()} disabled={busy || ticketBusy} />{transferTicket && reservation.transferTicket?.key !== transferTicket.key && <ResponsiveActionButton type="button" label="Eliminar comprobante" icon="trash" iconOnly aria-label="Eliminar comprobante" title="Eliminar comprobante" onClick={() => void removeTicket()} disabled={busy || ticketBusy} />}{ticketBusy && <span role="status" className="text-xs font-semibold text-sky-300">Subiendo comprobante…</span>}</div></div></div>}
      <label className="ops-field-label"><EventFieldTitle label="Nota administrativa" status="Opcional" /><textarea aria-label="Nota administrativa" value={note} onChange={(event) => setNote(event.target.value)} disabled={busy || ticketBusy} rows={2} className="ops-control mt-2 px-3 py-2" /></label>
      {error && <p role="alert" className="ops-state ops-state-error rounded-xl px-3 py-2 text-sm text-rose-100">{error}</p>}
    </div>
  </Modal>
}

function EventCompleteModal({ reservation, onClose, onCompleted }: { reservation: EventReservation; onClose: () => void; onCompleted: (reservation: EventReservation) => Promise<void> }) {
  const balance = reservation.remainingPaymentAmount
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : '')
  const [method, setMethod] = useState<EventPaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [remainingTransferTicket, setRemainingTransferTicket] = useState<EventTransferTicket | null>(reservation.remainingTransferTicket ?? null)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('Completando…')
  const [ticketBusy, setTicketBusy] = useState(false)
  const [error, setError] = useState('')
  const [dateConfirmation, setDateConfirmation] = useState<{ actualDate: string; availableCount: number; capacityLimit: number; withoutCart: boolean } | null>(null)
  const ticketInputRef = useRef<HTMLInputElement>(null)
  const persistedTicketKey = useRef(reservation.remainingTransferTicket?.key ?? null)

  async function changePaymentMethod(paymentMethod: EventPaymentMethod) {
    if (paymentMethod === method) return
    if (paymentMethod === 'cash' && remainingTransferTicket) {
      setTicketBusy(true)
      setError('')
      try {
        await removeAdminEventTransferTicket(reservation.requestId, remainingTransferTicket.key)
        setRemainingTransferTicket(null)
      } catch (ticketError) {
        setError(errorMessage(ticketError))
        setTicketBusy(false)
        return
      }
      setTicketBusy(false)
    }
    setMethod(paymentMethod)
  }

  async function selectTicket(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file || method !== 'transfer') return
    setTicketBusy(true)
    setError('')
    try {
      const transferTicket = await uploadAdminEventTransferTicket(reservation.requestId, file)
      const previousTicket = remainingTransferTicket
      if (previousTicket && previousTicket.key !== transferTicket.key) {
        try { await removeAdminEventTransferTicket(reservation.requestId, previousTicket.key, transferTicket.key) } catch { await cleanupEventTransferTickets(reservation.requestId, transferTicket.key, true) }
      }
      setRemainingTransferTicket(transferTicket)
    } catch (ticketError) {
      setError(errorMessage(ticketError))
    } finally {
      setTicketBusy(false)
    }
  }

  async function removeTicket() {
    if (!remainingTransferTicket) return
    setTicketBusy(true)
    setError('')
    try {
      await removeAdminEventTransferTicket(reservation.requestId, remainingTransferTicket.key)
      setRemainingTransferTicket(null)
    } catch (ticketError) {
      setError(errorMessage(ticketError))
    } finally {
      setTicketBusy(false)
    }
  }

  function paymentDetails() {
    const paymentAmount = balance === 0 ? null : Number(amount)
    if (balance > 0 && (!Number.isSafeInteger(paymentAmount) || paymentAmount !== balance)) { setError(`El saldo debe cobrarse completo: ${formatEventMoney(balance)}.`); return null }
    return { paymentAmount, paymentMethod: balance === 0 ? null : method }
  }

  async function finish(confirmDateChange: boolean, allowWithoutCart: boolean) {
    const payment = paymentDetails()
    if (!payment) return
    setBusy(true)
    setBusyLabel('Completando…')
    setError('')
    try {
      const completed = await completeEventReservation({
        requestId: createEventRequestId(),
        reservationId: reservation.id,
        reason: 'Carrito entregado y saldo final confirmado',
        completion: {
          remainingPaymentAmount: payment.paymentAmount,
          remainingPaymentMethod: payment.paymentMethod,
          remainingPaymentNote: note,
          remainingTransferTicket: payment.paymentMethod === 'transfer' ? remainingTransferTicket : null,
          confirmDateChange,
          allowWithoutCart,
        },
      })
      if (completed.status !== 'completed') throw new Error('La reserva no quedó completada. Verifica el estado antes de volver a intentarlo.')
      await onCompleted(completed)
      onClose()
    } catch (completeError) { setError(errorMessage(completeError)) } finally { setBusy(false) }
  }

  async function confirm() {
    if (busy || ticketBusy) return
    if (!paymentDetails()) return
    const actualDate = todayValue()
    if (reservation.eventDate === actualDate) {
      await finish(false, false)
      return
    }

    setBusy(true)
    setBusyLabel('Verificando disponibilidad…')
    setError('')
    try {
      const availability = await getEventAvailability(actualDate)
      setDateConfirmation({ actualDate, availableCount: availability.availableCount, capacityLimit: availability.capacityLimit, withoutCart: availability.availableCount === 0 })
    } catch (availabilityError) {
      setError(errorMessage(availabilityError))
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    if (busy || ticketBusy) return
    if (remainingTransferTicket && remainingTransferTicket.key !== persistedTicketKey.current) {
      setTicketBusy(true)
      setError('')
      try {
        await removeAdminEventTransferTicket(reservation.requestId, remainingTransferTicket.key)
        setRemainingTransferTicket(null)
      } catch (ticketError) {
        setError(errorMessage(ticketError))
        setTicketBusy(false)
        return
      }
      setTicketBusy(false)
    }
    onClose()
  }

  return <>
    <Modal title="Completar reserva y generar venta" description="La fecha real de entrega se valida en el servidor; una fecha distinta requiere confirmación administrativa." closeLabel="Cerrar finalización" onClose={() => void close()} busy={busy || ticketBusy} maxWidthClassName="max-w-xl" headerActions={<ResponsiveActionButton label={reservation.eventDate === todayValue() ? 'Confirmar entrega y generar venta' : 'Verificar disponibilidad'} icon="check" loading={busy} loadingLabel={busyLabel} disabled={ticketBusy} onClick={() => void confirm()} className="bg-emerald-600 text-white hover:bg-emerald-500" />}>
      <div className="grid gap-4 p-4 sm:p-6">
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-sm text-amber-100"><p>Fecha reservada: <strong>{reservation.eventDate}</strong></p><p className="mt-1">Total de la venta: <strong>{formatEventMoney(reservation.totalMxn)}</strong></p><p className="mt-1">Saldo pendiente: <strong>{formatEventMoney(balance)}</strong></p></div>
        {balance > 0 ? <><label className="ops-field-label"><EventFieldTitle label="Saldo cobrado" status="Obligatorio" /><input aria-label="Saldo cobrado" type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy || ticketBusy} className="ops-control mt-2 px-3" /></label><fieldset><legend className="text-xs font-bold text-slate-300"><EventFieldTitle label="Método del saldo" status="Obligatorio" /></legend><EventChoiceButtons label="Método del saldo" value={method} options={[{ value: 'cash', label: 'Efectivo' }, { value: 'transfer', label: 'Transferencia' }]} onChange={(value) => void changePaymentMethod(value)} disabled={busy || ticketBusy} /></fieldset>{method === 'transfer' && <div className="grid gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3"><div><EventFieldTitle label="Comprobante de transferencia del saldo" status="Opcional" /><p className="mt-1 text-xs leading-relaxed text-slate-400">Adjunta una imagen para respaldar el pago final.</p></div><input ref={ticketInputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Comprobante de transferencia del saldo (opcional)" onChange={selectTicket} disabled={busy || ticketBusy} className="sr-only" /><div className="flex min-w-0 items-center gap-3"><CatalogImageTile src={remainingTransferTicket?.url ?? null} alt="Vista previa del comprobante de transferencia del saldo" imageClassName="object-contain" role="button" tabIndex={busy || ticketBusy ? -1 : 0} aria-disabled={busy || ticketBusy} title={remainingTransferTicket ? 'Cambiar comprobante del saldo' : 'Adjuntar comprobante del saldo'} onClick={() => ticketInputRef.current?.click()} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && !busy && !ticketBusy) { event.preventDefault(); ticketInputRef.current?.click() } }} className="h-16 w-16 shrink-0 cursor-pointer rounded-lg border-slate-700 bg-slate-900 ops-focus aria-disabled:cursor-not-allowed aria-disabled:opacity-60" /><div className="flex min-w-0 flex-wrap items-center gap-2"><ResponsiveActionButton type="button" label={remainingTransferTicket ? 'Cambiar comprobante del saldo' : 'Adjuntar comprobante del saldo'} icon={remainingTransferTicket ? 'edit' : 'plus'} iconOnly aria-label={remainingTransferTicket ? 'Cambiar comprobante del saldo' : 'Adjuntar comprobante del saldo'} title={remainingTransferTicket ? 'Cambiar comprobante del saldo' : 'Adjuntar comprobante del saldo'} onClick={() => ticketInputRef.current?.click()} disabled={busy || ticketBusy} />{remainingTransferTicket && <ResponsiveActionButton type="button" label="Eliminar comprobante del saldo" icon="trash" iconOnly aria-label="Eliminar comprobante del saldo" title="Eliminar comprobante del saldo" onClick={() => void removeTicket()} disabled={busy || ticketBusy} />}{ticketBusy && <span role="status" className="text-xs font-semibold text-sky-300">Subiendo comprobante…</span>}</div></div></div>}</> : <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">Pago total confirmado. No hay saldo pendiente.</p>}
        <label className="ops-field-label"><EventFieldTitle label="Nota de entrega" status="Opcional" /><textarea aria-label="Nota de entrega" value={note} onChange={(event) => setNote(event.target.value)} disabled={busy || ticketBusy} rows={2} className="ops-control mt-2 px-3 py-2" /></label>
        {error && <p role="alert" className="ops-state ops-state-error rounded-xl px-3 py-2 text-sm text-rose-100">{error}</p>}
      </div>
    </Modal>
    {dateConfirmation && <Modal title={dateConfirmation.withoutCart ? 'No hay carritos disponibles' : 'Confirmar cambio de fecha'} description="La finalización usa la fecha actual del servidor y mueve la reserva de forma atómica." closeLabel="Cancelar cambio de fecha" onClose={() => setDateConfirmation(null)} busy={busy} closeDisabled={busy} maxWidthClassName="max-w-lg" zIndexClassName="z-[60]" headerActions={<ResponsiveActionButton type="button" label={dateConfirmation.withoutCart ? 'Completar sin carrito' : 'Confirmar cambio y completar'} icon="check" showLabel loading={busy} loadingLabel="Completando…" onClick={() => void finish(true, dateConfirmation.withoutCart)} className={dateConfirmation.withoutCart ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-emerald-600 text-white hover:bg-emerald-500'} />}><div className="grid gap-4 p-4 sm:p-6"><p className="text-sm leading-relaxed text-slate-300">La reserva está fechada para <strong className="text-white">{reservation.eventDate}</strong>, pero la entrega se registrará el <strong className="text-white">{dateConfirmation.actualDate}</strong>.</p>{dateConfirmation.withoutCart ? <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-sm leading-relaxed text-amber-100">No hay carritos disponibles para la fecha actual. Puedes confirmar la entrega sin asignar un carrito; la reserva se moverá a la fecha actual y no consumirá capacidad.</p> : <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm leading-relaxed text-emerald-100">Hay <strong>{dateConfirmation.availableCount}</strong> de <strong>{dateConfirmation.capacityLimit}</strong> carritos disponibles. Confirma para mover la reserva y completar la venta con un carrito asignado.</p>}<div className="flex justify-end border-t border-slate-800 pt-4"><ResponsiveActionButton type="button" label="Cancelar" icon="close" showLabel disabled={busy} onClick={() => setDateConfirmation(null)} /></div></div></Modal>}
  </>
}

function EventReservationCard({ reservation, focused, onSeen, onChanged }: { reservation: EventReservation; focused: boolean; onSeen: (reservation: EventReservation) => Promise<void>; onChanged: (reservation: EventReservation) => Promise<void> }) {
  const [reserveOpen, setReserveOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [ticketViewer, setTicketViewer] = useState<{ reservation: EventReservation; kind: 'initial' | 'remaining' } | null>(null)
  const itemCount = reservation.items.reduce((count, item) => count + item.quantity, 0)
  const createdDate = formatEventCreatedDate(reservation.createdAt)
  const eventDate = formatEventDate(reservation.eventDate)

  async function openTicketViewer(kind: 'initial' | 'remaining') {
    const refreshedReservation = await refreshEventReservationTransferTicket(reservation)
    const ticket = kind === 'initial' ? refreshedReservation.transferTicket : refreshedReservation.remainingTransferTicket
    if (ticket) setTicketViewer({ reservation: refreshedReservation, kind })
  }

  useEffect(() => {
    if (focused && reservation.adminSeenAt === null) void onSeen(reservation)
  }, [focused, onSeen, reservation])

  return <>
    <article data-testid="event-reservation-card" data-reservation-id={reservation.id} data-focused={focused ? 'true' : undefined} tabIndex={-1} className={`ops-panel-frame w-[24rem] max-w-[24rem] min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 transition-shadow sm:p-4 ${focused ? 'ring-2 ring-amber-400/70 ring-offset-2 ring-offset-slate-950' : ''}`}>
      <div className="grid gap-2">
        <header data-card-row="header" className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-2"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400"><EventReservationDate dateTime={reservation.createdAt} label="Fecha de creación" parameter="created-date" value={createdDate} /><EventReservationDate dateTime={reservation.eventDate} label="Fecha del evento" parameter="event-date" value={eventDate} />{reservation.origin !== 'public' && <span data-header-field="origin" className="shrink-0 font-semibold text-sky-300">{EVENT_ORIGIN_LABELS[reservation.origin]}</span>}</div><div data-card-header-actions="true" className="flex shrink-0 items-center gap-1"><span data-header-field="status" className={`shrink-0 rounded-full border px-2 py-1 text-xs font-bold ${reservation.status === 'pending' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : reservation.status === 'reserved' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : reservation.status === 'completed' ? 'border-sky-500/30 bg-sky-500/10 text-sky-200' : 'border-slate-700 text-slate-400'}`}>{EVENT_STATUS_LABELS[reservation.status]}</span>{reservation.status === 'pending' && <ResponsiveActionButton label="Verificar y reservar" icon="check" iconOnly aria-label="Verificar y reservar" title="Verificar y reservar" onClick={() => setReserveOpen(true)} className="shrink-0" />}{reservation.status === 'reserved' && <ResponsiveActionButton label="Completar entrega" icon="check" iconOnly aria-label="Completar entrega" title="Completar entrega" onClick={() => setCompleteOpen(true)} className="shrink-0" />}{(reservation.status === 'pending' || reservation.status === 'reserved') && <ResponsiveActionButton label="Cancelar" icon="close" iconOnly aria-label="Cancelar" title="Cancelar" onClick={() => setCancelOpen(true)} className="shrink-0" />}</div></header>
        <div data-card-row="customer" className="flex min-w-0 items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate font-bold text-white" title={reservation.customerName}>{reservation.customerName}</h2>
          {reservation.origin === 'public' && <span data-customer-origin="public" role="img" aria-label={EVENT_ORIGIN_LABELS.public} title={EVENT_ORIGIN_LABELS.public} className="inline-flex shrink-0 items-center font-semibold text-sky-300"><Icon name="globe" className="h-4 w-4 shrink-0" /><span className="sr-only">{EVENT_ORIGIN_LABELS.public}</span></span>}
        </div>
        <div data-card-row="contact" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <a href={getWholesaleWhatsAppUrl(reservation.customerPhone)} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp de ${reservation.customerName}`} className="flex min-h-11 items-center text-sm font-semibold text-emerald-300 underline decoration-emerald-500/50 underline-offset-2 ops-focus">{reservation.customerPhone}</a>
          {reservation.customerEmail && <a href={`mailto:${reservation.customerEmail}`} className="min-w-0 max-w-full break-all py-2 text-sm text-slate-400 underline decoration-slate-600 underline-offset-2 ops-focus" title={reservation.customerEmail}>{reservation.customerEmail}</a>}
        </div>
        <dl data-card-row="payments" className="grid min-w-0 grid-cols-3 gap-2 text-sm">
           <div data-parameter="initial-payment" className="min-w-0"><dt className="break-words text-xs font-semibold text-slate-400">Pago inicial:</dt><dd className="mt-1 min-w-0 break-words font-bold text-white"><span data-payment-amount="initial" className="block">{formatEventMoney(reservation.confirmedPaymentAmount ?? reservation.declaredPaymentAmount)}</span><div data-payment-method="initial" className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-300">{(reservation.confirmedPaymentMethod ?? reservation.declaredPaymentMethod) === 'transfer' && reservation.transferTicket && <CatalogImageTile src={reservation.transferTicket.url} alt="Comprobante de transferencia" role="button" tabIndex={0} aria-label="Ver comprobante de transferencia" title="Ver comprobante de transferencia" onClick={() => void openTicketViewer('initial')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openTicketViewer('initial') } }} imageClassName="object-contain" className="h-7 w-7 shrink-0 cursor-pointer rounded-md border-slate-700 bg-slate-950 ops-focus" />}<span className="min-w-0 break-words">{EVENT_PAYMENT_LABELS[reservation.confirmedPaymentMethod ?? reservation.declaredPaymentMethod]}</span></div></dd></div>
           <div data-parameter="balance" className="min-w-0"><dt className="break-words text-xs font-semibold text-slate-400">Saldo pendiente:</dt><dd className={`mt-1 min-w-0 break-words font-bold ${reservation.remainingPaymentAmount > 0 ? 'text-amber-200' : 'text-emerald-200'}`}><span data-payment-amount="balance" className="block">{reservation.status === 'pending' ? 'Pendiente de verificación' : formatEventMoney(reservation.remainingPaymentAmount)}</span>{reservation.remainingPaymentMethod && <span data-payment-method="balance" className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-300">{reservation.remainingPaymentMethod === 'transfer' && reservation.remainingTransferTicket && <CatalogImageTile src={reservation.remainingTransferTicket.url} alt="Comprobante de transferencia del saldo" role="button" tabIndex={0} aria-label="Ver comprobante de transferencia del saldo" title="Ver comprobante de transferencia del saldo" onClick={() => void openTicketViewer('remaining')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openTicketViewer('remaining') } }} imageClassName="object-contain" className="h-7 w-7 shrink-0 cursor-pointer rounded-md border-slate-700 bg-slate-950 ops-focus" />}<span>{EVENT_PAYMENT_LABELS[reservation.remainingPaymentMethod]}</span></span>}</dd></div>
          <div data-parameter="total" className="min-w-0"><dt className="break-words text-xs font-semibold text-slate-400">Saldo total:</dt><dd className="mt-1 min-w-0 break-words font-bold text-amber-300"><span data-payment-amount="total" className="block">{formatEventMoney(reservation.totalMxn)}</span></dd></div>
        </dl>
        <details className="group border-t border-slate-800 pt-2"><summary className="ops-focus flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl py-1 text-left marker:hidden"><span className="text-sm font-bold uppercase tracking-[0.12em] text-slate-300">Artículos de la reserva</span><span className="shrink-0 text-xs font-semibold text-slate-500">{itemCount} {itemCount === 1 ? 'artículo' : 'artículos'} <span aria-hidden="true" className="ml-1 text-slate-300 group-open:hidden">▾</span><span aria-hidden="true" className="ml-1 hidden text-slate-300 group-open:inline">▴</span></span></summary><ul className="mt-2 grid gap-2 text-sm text-slate-300">{reservation.items.map((item) => <li key={item.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-950/60 px-3 py-2"><span>{item.quantity} × {item.lineKind === 'category' ? `Categoría: ${item.categoryName ?? item.productName}` : item.productName}</span><span className="shrink-0 font-bold text-white">{formatEventMoney(item.lineTotalMxn)}</span></li>)}</ul></details>
      </div>
    </article>
    {reserveOpen && <EventReserveModal reservation={reservation} onClose={() => setReserveOpen(false)} onReserved={onChanged} />}
    {completeOpen && <EventCompleteModal reservation={reservation} onClose={() => setCompleteOpen(false)} onCompleted={onChanged} />}
    {cancelOpen && <EventCancelModal reservation={reservation} onClose={() => setCancelOpen(false)} onCancelled={onChanged} />}
     {ticketViewer && (ticketViewer.kind === 'initial' ? ticketViewer.reservation.transferTicket : ticketViewer.reservation.remainingTransferTicket) && <Modal title={ticketViewer.kind === 'initial' ? 'Comprobante de transferencia' : 'Comprobante de transferencia del saldo'} description={`Reserva ${ticketViewer.reservation.id.slice(0, 8)} · ${ticketViewer.reservation.customerName}`} closeLabel="Cerrar comprobante" onClose={() => setTicketViewer(null)} maxWidthClassName="max-w-3xl" bodyClassName="bg-slate-950"><div className="flex min-h-[16rem] items-center justify-center p-4 sm:min-h-[24rem] sm:p-6"><img src={(ticketViewer.kind === 'initial' ? ticketViewer.reservation.transferTicket : ticketViewer.reservation.remainingTransferTicket)?.url} alt={ticketViewer.kind === 'initial' ? 'Comprobante de transferencia' : 'Comprobante de transferencia del saldo'} className="max-h-[70vh] max-w-full object-contain" /></div></Modal>}
  </>
}

function EventReservationComposer({ catalog, onCreated }: { catalog: WholesaleCatalogProduct[]; onCreated: (reservation: EventReservation) => Promise<void> }) {
  const persistence = useAdminSessionPersistence()
  const sessionModule = 'events-composer'
  const [restoredSession] = useState<EventComposerSession>(() => persistence?.read(sessionModule, isEventComposerSession) ?? persistence?.read('events', isEventAdminSessionState)?.composer ?? emptyEventComposerSession())
  const [draft, setDraft] = useState<WholesaleDraft>(() => ({ ...restoredSession.draft, transferTicket: null }))
  const [form, setForm] = useState<EventFormState>(() => ({ ...restoredSession.form, transferTicket: null }))
  const [requestId, setRequestId] = useState(() => createEventRequestId())
  const [origin, setOrigin] = useState<EventReservationOrigin>(restoredSession.origin)
  const [errors, setErrors] = useState<EventFormErrors>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ticketBusy, setTicketBusy] = useState(false)
  const [mobileStep, setMobileStep] = useState<'catalog' | 'review'>(restoredSession.mobileStep)

  useEffect(() => {
    const safeForm: EventComposerSession['form'] = { customerName: form.customerName, customerPhone: form.customerPhone, customerEmail: form.customerEmail, eventDate: form.eventDate, paymentPlan: form.paymentPlan, advanceAmount: form.advanceAmount, paymentMethod: form.paymentMethod, paymentReference: form.paymentReference }
    persistence?.write(sessionModule, { draft: { reorderFromOrderId: draft.reorderFromOrderId, draftAction: null, items: draft.items, paymentMethod: draft.paymentMethod }, form: safeForm, origin, mobileStep })
  }, [draft, form, mobileStep, origin, persistence, sessionModule])

  function changeForm(field: keyof EventFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value, ...(field === 'paymentMethod' && value === 'cash' ? { paymentReference: '' } : {}) }))
    setErrors({})
    setError('')
  }

  async function changePaymentMethod(paymentMethod: EventPaymentMethod) {
    if (paymentMethod === form.paymentMethod) return
    if (paymentMethod === 'cash' && form.transferTicket) {
      setTicketBusy(true)
      setError('')
      try {
        await removeAdminEventTransferTicket(requestId, form.transferTicket.key)
      } catch (ticketError) {
        setError(errorMessage(ticketError))
        setTicketBusy(false)
        return
      }
      setTicketBusy(false)
    }
    setForm((current) => ({ ...current, paymentMethod, paymentReference: paymentMethod === 'transfer' ? current.paymentReference : '', transferTicket: paymentMethod === 'transfer' ? current.transferTicket : null }))
  }

  async function selectTicket(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file || form.paymentMethod !== 'transfer') return
    setTicketBusy(true)
    setError('')
    try {
      const transferTicket = await uploadAdminEventTransferTicket(requestId, file)
      const previousTicket = form.transferTicket
      if (previousTicket && previousTicket.key !== transferTicket.key) {
        try { await removeAdminEventTransferTicket(requestId, previousTicket.key, transferTicket.key) } catch { await cleanupEventTransferTickets(requestId, transferTicket.key, true) }
      }
      setForm((current) => ({ ...current, transferTicket }))
    } catch (ticketError) {
      setError(errorMessage(ticketError))
    } finally {
      setTicketBusy(false)
    }
  }

  async function removeTicket() {
    if (!form.transferTicket) return
    setTicketBusy(true)
    setError('')
    try {
      await removeAdminEventTransferTicket(requestId, form.transferTicket.key)
      setForm((current) => ({ ...current, transferTicket: null }))
    } catch (ticketError) {
      setError(errorMessage(ticketError))
    } finally {
      setTicketBusy(false)
    }
  }

  async function clearDraft() {
    if (form.transferTicket) {
      setTicketBusy(true)
      setError('')
      try { await removeAdminEventTransferTicket(requestId, form.transferTicket.key) } catch (ticketError) {
        setError(errorMessage(ticketError))
        setTicketBusy(false)
        return
      }
      setTicketBusy(false)
    }
    setDraft(createEmptyWholesaleDraft())
    setForm(createEmptyEventForm())
    setRequestId(createEventRequestId())
    setOrigin('whatsapp')
    setErrors({})
    setMobileStep('catalog')
  }

  function validate() {
    const items = toWholesaleOrderItems(draft.items)
    const nextErrors = validateEventForm(form, getWholesaleDraftTotal(draft, catalog))
    if (items.length === 0) nextErrors.items = 'Agrega al menos un producto o categoría.'
    setErrors(nextErrors)
    setError(eventFormErrorMessage(nextErrors))
    return Object.keys(nextErrors).length === 0
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validate()) return
    setBusy(true)
    try {
      const total = getWholesaleDraftTotal(draft, catalog)
       const reservation = await createAdminEventReservation({ requestId, customerName: form.customerName, customerPhone: form.customerPhone, customerEmail: form.customerEmail, eventDate: form.eventDate, items: toWholesaleOrderItems(draft.items) as EventReservationItemInput[], paymentPlan: form.paymentPlan, declaredPaymentAmount: form.paymentPlan === 'full' ? total : Number(form.advanceAmount), declaredPaymentMethod: form.paymentMethod, declaredPaymentReference: form.paymentMethod === 'transfer' ? form.paymentReference : null, transferTicket: form.transferTicket, origin })
      await onCreated(reservation)
      setDraft(createEmptyWholesaleDraft())
      setForm(createEmptyEventForm())
      setRequestId(createEventRequestId())
      setOrigin('whatsapp')
      setMobileStep('catalog')
      setError('')
    } catch (createError) { setError(errorMessage(createError)) } finally { setBusy(false) }
  }

  const itemCount = toWholesaleOrderItems(draft.items).reduce((count, item) => count + item.quantity, 0)
  const total = getWholesaleDraftTotal(draft, catalog)
  const review = mobileStep === 'review'

  return <section aria-label="Crear reserva de evento" className={`ops-workspace-frame flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-3 text-slate-100 shadow-xl sm:p-5 lg:h-full lg:p-6 ${review ? '' : 'pb-32'} lg:pb-6`}>
    {error && <p role="alert" className="ops-state ops-state-error shrink-0 rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">{error}</p>}
    <div className={`${review ? 'grid' : 'flex flex-col'} min-h-0 min-w-0 flex-1 items-stretch gap-4 overflow-hidden lg:grid lg:min-h-0 lg:flex-1 lg:items-stretch lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] lg:grid-rows-[minmax(0,1fr)] lg:gap-5`}>
      <div className={`${mobileStep === 'catalog' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'} ops-panel-frame min-w-0 rounded-2xl border border-slate-800 bg-slate-950 p-3 shadow-xl sm:p-4 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden`}><DraftCatalog draft={draft} catalog={catalog} formatMoney={formatEventMoney} showPortalTabs={false} onChange={(items) => setDraft((current) => ({ ...current, items }))} /></div>
      <form noValidate onSubmit={submit} className={`${mobileStep === 'review' ? '' : 'hidden'} min-w-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden ${review ? 'flex min-h-0 flex-1 flex-col gap-2 overflow-hidden' : ''}`}><div className="mb-0 flex shrink-0 flex-wrap items-center justify-between gap-2 lg:hidden"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-400">Paso 2 de 2</p><p className="mt-1 text-sm font-semibold text-slate-300">Revisa la reserva antes de crearla.</p></div><ResponsiveActionButton type="button" label="Volver al catálogo" icon="chevron-left" showLabel onClick={() => setMobileStep('catalog')} /></div><CustomerOrderSummary variant="event" formatMoney={formatEventMoney} showPaymentPanel={false} draft={draft} catalog={catalog} mobileReview={review} submitBusy={busy || ticketBusy} onChange={(items) => setDraft((current) => ({ ...current, items }))} onClear={clearDraft} onPaymentChange={async (paymentMethod) => changeForm('paymentMethod', paymentMethod)} beforeSubmit={<EventReservationDetails form={form} errors={errors} totalMxn={total} disabled={busy || ticketBusy} ticketBusy={ticketBusy} transferTicket={form.transferTicket} onTicketSelect={(event) => void selectTicket(event)} onTicketRemove={removeTicket} onPaymentMethodChange={(paymentMethod) => void changePaymentMethod(paymentMethod)} onChange={changeForm} showOrigin origin={origin} onOriginChange={setOrigin} />} submitLabel="Crear reserva pendiente" submitLoadingLabel="Creando reserva…" /></form>
    </div>
    {mobileStep === 'catalog' && <MobileBottomActionBar><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{itemCount} {itemCount === 1 ? 'artículo' : 'artículos'}</p><p className="mt-1 text-lg font-black text-white">{formatEventMoney(total)}</p></div></div><ResponsiveActionButton type="button" label="Revisar reserva" icon="chevron-right" showLabel disabled={itemCount === 0} onClick={() => setMobileStep('review')} className="w-full bg-sky-600 text-white hover:bg-sky-500" /></MobileBottomActionBar>}
  </section>
}

export function EventReservationWorkspace({ focusReservationId = null }: { focusReservationId?: string | null } = {}) {
  const persistence = useAdminSessionPersistence()
  const sessionModule = 'events'
  const [restoredSession] = useState<EventAdminSessionState>(() => persistence?.read(sessionModule, isEventAdminSessionState) ?? { filter: 'pending', query: '', tab: 'management', composer: emptyEventComposerSession() })
  const [reservations, setReservations] = useState<EventReservation[]>([])
  const [catalog, setCatalog] = useState<WholesaleCatalogProduct[]>([])
  const [configuration, setConfiguration] = useState<EventConfiguration>({ eventCartsPerDay: DEFAULT_EVENT_CART_CAPACITY })
  const [filter, setFilter] = useState<'all' | EventReservationState>(restoredSession.filter)
  const [query, setQuery] = useState(restoredSession.query)
  const [tab, setTab] = useState<'management' | 'create'>(restoredSession.tab)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const handledFocus = useRef<string | null>(null)

  useEffect(() => {
    persistence?.write(sessionModule, { filter, query, tab, composer: restoredSession.composer })
  }, [filter, persistence, query, restoredSession.composer, sessionModule, tab])

  useEffect(() => {
    let mounted = true
    let stop: (() => void) | undefined
    let latestRefresh = 0
    const refreshReservations = async () => {
      const refreshId = ++latestRefresh
      const nextReservations = await listEventReservations()
      const refreshedReservations = await refreshEventReservationTransferTickets(nextReservations)
      if (mounted && refreshId === latestRefresh) setReservations(refreshedReservations)
    }
    const load = async () => {
      const refreshId = ++latestRefresh
      const [nextReservations, nextCatalog, nextConfiguration] = await Promise.all([listEventReservations(), listPublicWholesaleCatalog(), getEventConfiguration()])
      const refreshedReservations = await refreshEventReservationTransferTickets(nextReservations)
      if (!mounted || refreshId !== latestRefresh) return
      setReservations(refreshedReservations)
      setCatalog(nextCatalog)
      setConfiguration(nextConfiguration)
    }
    const handleRealtimeEvent = () => {
      if (!mounted) return
      void refreshReservations().catch((refreshError) => { if (mounted) setError(errorMessage(refreshError)) })
    }
    queueMicrotask(() => { void load().catch((loadError) => { if (mounted) setError(errorMessage(loadError)) }).finally(() => { if (mounted) setLoading(false) }) })
    void subscribeToEventReservationEvents(handleRealtimeEvent).then((cleanup) => {
      if (mounted) stop = cleanup
      else cleanup()
    }).catch(() => { /* realtime is additive; the list remains usable */ })
    return () => { mounted = false; stop?.() }
  }, [])

  const visibleReservations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es-MX')
    return reservations.filter((reservation) => (filter === 'all' || reservation.status === filter) && (normalized === '' || `${reservation.id} ${reservation.customerName} ${reservation.customerPhone} ${reservation.eventDate}`.toLocaleLowerCase('es-MX').includes(normalized)))
  }, [filter, query, reservations])
  const counts = useMemo(() => ({ pending: 0, reserved: 0, completed: 0, cancelled: 0, ...Object.fromEntries(EVENT_RESERVATION_STATES.map((state) => [state, reservations.filter((reservation) => reservation.status === state).length])) }), [reservations])

  useEffect(() => {
    if (!focusReservationId || loading || handledFocus.current === focusReservationId) return
    const reservation = reservations.find((candidate) => candidate.id === focusReservationId)
    if (!reservation) return
    if (filter !== 'all' && filter !== reservation.status) {
      let active = true
      queueMicrotask(() => { if (active) setFilter('all') })
      return () => { active = false }
    }
    handledFocus.current = focusReservationId
    const timeoutId = window.setTimeout(() => document.querySelector<HTMLElement>(`[data-reservation-id="${focusReservationId}"]`)?.focus(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [filter, focusReservationId, loading, reservations])

  async function markSeen(reservation: EventReservation) {
    try {
      const seen = await markEventReservationSeen({ requestId: createEventRequestId(), reservationId: reservation.id })
      const refreshedSeen = await refreshEventReservationTransferTicket(seen)
      setReservations((current) => current.map((candidate) => candidate.id === refreshedSeen.id ? refreshedSeen : candidate))
    } catch (seenError) { setError(errorMessage(seenError)) }
  }

  async function changed(reservation: EventReservation) {
    const refreshedReservation = await refreshEventReservationTransferTicket(reservation)
    setReservations((current) => current.map((candidate) => candidate.id === refreshedReservation.id ? refreshedReservation : candidate))
    setNotice(`Reserva actualizada a ${EVENT_STATUS_LABELS[refreshedReservation.status]}.`)
  }

  async function created(reservation: EventReservation) {
    const refreshedReservation = await refreshEventReservationTransferTicket(reservation)
    setReservations((current) => [refreshedReservation, ...current])
    setTab('management')
    setNotice('Reserva creada correctamente y registrada como Pendiente.')
  }

  if (loading) return <section className="ops-workspace-frame flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center"><p role="status" className="ops-state ops-state-loading">Cargando Eventos…</p></section>

  return <section aria-label="Módulo Eventos" className="ops-workspace-frame flex min-h-0 min-w-0 w-full flex-1 flex-col gap-4 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-3 text-slate-100 shadow-2xl sm:p-5 lg:p-6">
    <div className="ops-module-header flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 pb-3"><div role="tablist" aria-label="Secciones de Eventos" className="flex flex-wrap gap-2"><button type="button" role="tab" aria-selected={tab === 'management'} onClick={() => setTab('management')} className={`ops-tab ops-focus ${tab === 'management' ? 'border-amber-400 bg-amber-500/15 text-white' : 'border-slate-700 text-slate-300'}`}>Gestionar reservas</button><button type="button" role="tab" aria-selected={tab === 'create'} onClick={() => setTab('create')} className={`ops-tab ops-focus ${tab === 'create' ? 'border-amber-400 bg-amber-500/15 text-white' : 'border-slate-700 text-slate-300'}`}>Crear reserva</button></div><InfoButton id="event-admin-info" label="Información de Eventos" open={false} onToggle={() => undefined}>Las reservas pendientes no consumen capacidad. La confirmación del pago reserva un carrito y la entrega genera la venta definitiva.</InfoButton><span className="ml-auto rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-bold text-slate-300">Capacidad: {configuration.eventCartsPerDay} carritos/día</span></div>
    {notice && <div role="status" className="ops-state ops-state-notice shrink-0 rounded-2xl border border-sky-500/30 bg-sky-950/30 px-4 py-3 text-sm text-sky-100">{notice}</div>}
    {error && <div role="alert" className="ops-state ops-state-error shrink-0 rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}
      {tab === 'management' ? <><div className="ops-panel-frame grid shrink-0 gap-3 rounded-3xl border border-slate-800 bg-slate-950 p-3 sm:grid-cols-[1fr_auto] sm:p-4"><SearchInput value={query} onChange={setQuery} label="Buscar reservas de evento" placeholder="Buscar por cliente, teléfono o fecha" /><div className="flex flex-wrap gap-2">{(['pending', 'reserved', 'completed', 'cancelled', 'all'] as const).map((status) => <button key={status} type="button" aria-label={`${status === 'all' ? 'Todas' : EVENT_STATUS_LABELS[status]}: ${status === 'all' ? reservations.length : counts[status]} ${status === 'all' || counts[status] !== 1 ? 'reservas' : 'reserva'}`} aria-pressed={filter === status} onClick={() => setFilter(status)} className={`ops-choice ops-focus relative pr-10 text-xs font-bold ${filter === status ? 'border-amber-400 bg-amber-500/15 text-white' : 'border-slate-700 text-slate-300'}`}><span>{status === 'all' ? 'Todas' : EVENT_STATUS_LABELS[status]}</span><span className="absolute right-1 top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-slate-700 bg-slate-950 px-1 text-[10px] font-black leading-none text-slate-300">{status === 'all' ? reservations.length : counts[status]}</span></button>)}</div></div><div className="ops-scroll-region min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain pr-1"><div className="grid grid-cols-[24rem] items-stretch gap-3 md:grid-cols-[repeat(auto-fit,24rem)]">{visibleReservations.map((reservation) => <EventReservationCard key={reservation.id} reservation={reservation} focused={focusReservationId === reservation.id} onSeen={markSeen} onChanged={changed} />)}{visibleReservations.length === 0 && <p role="status" className="ops-state ops-state-filtered-empty rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">No hay reservas para este filtro.</p>}</div></div></> : <EventReservationComposer catalog={catalog} onCreated={created} />}
  </section>
}
