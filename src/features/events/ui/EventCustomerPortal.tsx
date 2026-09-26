import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react'
import { InfoButton } from '../../../app/components/InfoButton'
import { MobileBottomActionBar } from '../../../app/components/MobileBottomActionBar'
import { Modal } from '../../../app/components/Modal'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { ThemeToggle } from '../../../app/components/ThemeToggle'
import { listPublicWholesaleCatalog, type WholesaleCatalogProduct } from '../../wholesale/api/catalog'
import { CustomerOrderSummary, DraftCatalog } from '../../wholesale/ui/WholesaleCustomerPortal'
import { createEmptyWholesaleDraft, getWholesaleDraftTotal, toWholesaleOrderItems, type WholesaleDraft } from '../../wholesale/ui/wholesaleUiUtils'
import { createPublicEventReservation, getEventAvailability, getPublicEventReservation } from '../api/reservations'
import { cleanupEventTransferTickets, removeEventTransferTicket, uploadEventTransferTicket } from '../../wholesale/api/transferTickets'
import type { EventAvailability, EventPaymentMethod, EventReservation, EventReservationItemInput } from '../api/types'
import { EventReservationDetails } from './eventUiUtils'
import { createEmptyEventForm, createEventRequestId, eventFormErrorMessage, formatEventMoney, validateEventForm, type EventFormErrors, type EventFormState } from './eventFormUtils'

const EVENT_REQUEST_STORAGE_KEY = 'paletixa:event-reservation-request'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la solicitud.'
}

function readStoredRequestId() {
  try { return typeof window === 'undefined' ? null : window.localStorage.getItem(EVENT_REQUEST_STORAGE_KEY) } catch { return null }
}

function storeRequestId(value: string) {
  try { window.localStorage.setItem(EVENT_REQUEST_STORAGE_KEY, value) } catch { /* Local storage is optional. */ }
}

function EventSubmissionResult({ reservation, onNewRequest }: { reservation: EventReservation; onNewRequest: () => void }) {
  return <section aria-labelledby="event-submission-title" className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-5 text-slate-100 shadow-2xl sm:p-8">
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-400">Solicitud recibida</p>
        <h1 id="event-submission-title" className="mt-1 text-2xl font-black tracking-tight text-white">Tu reserva quedó pendiente de confirmación</h1>
      </div>
      <ResponsiveActionButton type="button" label="Cerrar resultado de solicitud" icon="close" iconOnly aria-label="Cerrar resultado de solicitud" title="Cerrar resultado de solicitud" onClick={onNewRequest} className="shrink-0" />
    </header>
    <p className="text-sm leading-relaxed text-slate-300">La administración verificará el pago inicial y se pondrá en contacto con usted, a través de WhatsApp, para completar la reserva.</p>
    <dl className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm sm:grid-cols-2">
       <div><dt className="text-slate-500">Fecha</dt><dd className="mt-1 font-bold text-white">{reservation.eventDate}</dd></div>
      <div><dt className="text-slate-500">Total</dt><dd className="mt-1 font-black text-sky-300">{formatEventMoney(reservation.totalMxn)}</dd></div>
      <div><dt className="text-slate-500">Solicitud</dt><dd className="mt-1 truncate font-bold text-white" title={reservation.requestId}>{reservation.requestId}</dd></div>
    </dl>
  </section>
}

export function EventCustomerPortal() {
  const [catalog, setCatalog] = useState<WholesaleCatalogProduct[]>([])
  const [draft, setDraft] = useState<WholesaleDraft>(() => createEmptyWholesaleDraft())
  const [form, setForm] = useState<EventFormState>(() => createEmptyEventForm())
  const [requestId, setRequestId] = useState(() => createEventRequestId())
  const [availability, setAvailability] = useState<EventAvailability | null>(null)
  const [submittedReservation, setSubmittedReservation] = useState<EventReservation | null>(null)
  const [mobileCheckoutStep, setMobileCheckoutStep] = useState<'catalog' | 'review'>('catalog')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<EventFormErrors>({})
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [ticketBusy, setTicketBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    const savedRequestId = readStoredRequestId()
    void Promise.allSettled([listPublicWholesaleCatalog(), savedRequestId ? getPublicEventReservation(savedRequestId) : Promise.resolve(null)]).then(([catalogResult, reservationResult]) => {
      if (!mounted) return
      if (catalogResult.status === 'fulfilled') setCatalog(catalogResult.value)
      else setError(errorMessage(catalogResult.reason))
      if (reservationResult.status === 'fulfilled' && reservationResult.value) setSubmittedReservation(reservationResult.value)
      setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  function changeForm(field: keyof EventFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value, ...(field === 'paymentMethod' && value === 'cash' ? { paymentReference: '' } : {}) }))
    setFieldErrors({})
    setError('')
  }

  function changeDate(value: string) {
    changeForm('eventDate', value)
    setAvailability(null)
    if (value) void getEventAvailability(value).then(setAvailability).catch(() => setAvailability(null))
  }

  async function clearDraft() {
    if (form.transferTicket) {
      setTicketBusy(true)
      setError('')
      try {
        await removeEventTransferTicket(requestId, form.transferTicket.key)
      } catch (ticketError) {
        setError(errorMessage(ticketError))
        setTicketBusy(false)
        return
      }
      setTicketBusy(false)
    }
    setDraft(createEmptyWholesaleDraft())
    setForm(createEmptyEventForm())
    setRequestId(createEventRequestId())
    setAvailability(null)
    setFieldErrors({})
    setError('')
    setMobileCheckoutStep('catalog')
  }

  async function changePaymentMethod(paymentMethod: EventPaymentMethod) {
    if (paymentMethod === form.paymentMethod) return
    if (paymentMethod === 'cash' && form.transferTicket) {
      setTicketBusy(true)
      setError('')
      try {
        await removeEventTransferTicket(requestId, form.transferTicket.key)
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
      const transferTicket = await uploadEventTransferTicket(requestId, file)
      const previousTicket = form.transferTicket
      if (previousTicket && previousTicket.key !== transferTicket.key) {
        try { await removeEventTransferTicket(requestId, previousTicket.key) } catch { await cleanupEventTransferTickets(requestId, transferTicket.key) }
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
      await removeEventTransferTicket(requestId, form.transferTicket.key)
      setForm((current) => ({ ...current, transferTicket: null }))
    } catch (ticketError) {
      setError(errorMessage(ticketError))
    } finally {
      setTicketBusy(false)
    }
  }

  function validate() {
    const items = toWholesaleOrderItems(draft.items)
    const total = getWholesaleDraftTotal(draft, catalog)
    const errors = validateEventForm(form, total)
    if (items.length === 0) errors.items = 'Agrega al menos un producto o categoría.'
    setFieldErrors(errors)
    setError(eventFormErrorMessage(errors))
    return Object.keys(errors).length === 0
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !validate()) return
    setConfirmationOpen(true)
  }

  async function submit() {
    if (busy || !validate()) { setConfirmationOpen(false); return }
    setBusy(true)
    setError('')
    try {
      const totalMxn = getWholesaleDraftTotal(draft, catalog)
      const declaredPaymentAmount = form.paymentPlan === 'full' ? totalMxn : Number(form.advanceAmount)
      const reservation = await createPublicEventReservation({
        requestId,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail,
         eventDate: form.eventDate,
        items: toWholesaleOrderItems(draft.items) as EventReservationItemInput[],
        paymentPlan: form.paymentPlan,
        declaredPaymentAmount,
        declaredPaymentMethod: form.paymentMethod,
        declaredPaymentReference: form.paymentMethod === 'transfer' ? form.paymentReference : null,
        transferTicket: form.transferTicket,
      })
      storeRequestId(reservation.requestId)
      setSubmittedReservation(reservation)
      setConfirmationOpen(false)
    } catch (submitError) {
      setError(errorMessage(submitError))
      setConfirmationOpen(false)
    } finally { setBusy(false) }
  }

  const draftItemCount = toWholesaleOrderItems(draft.items).reduce((count, item) => count + item.quantity, 0)
  const draftTotal = getWholesaleDraftTotal(draft, catalog)
  const isMobileReview = mobileCheckoutStep === 'review'

  if (loading) return <main className="flex h-dvh min-h-0 items-center justify-center bg-slate-950 px-4 text-slate-100"><div role="status" className="w-full max-w-md"><p className="text-center text-sm font-semibold text-slate-300">Cargando catálogo…</p><div className="mt-4 grid grid-cols-2 gap-3"><div aria-hidden="true" className="aspect-square animate-pulse rounded-2xl border border-slate-800 bg-slate-900/70" /><div aria-hidden="true" className="aspect-square animate-pulse rounded-2xl border border-slate-800 bg-slate-900/70" /></div></div></main>
  if (submittedReservation) return <main className="flex min-h-dvh items-center justify-center overflow-y-auto bg-slate-950 px-3 py-6 text-slate-100 sm:px-6 sm:py-10"><EventSubmissionResult reservation={submittedReservation} onNewRequest={() => { setSubmittedReservation(null); void clearDraft() }} /></main>

  return <main className={`${isMobileReview ? 'pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))]' : 'pb-[calc(8rem+env(safe-area-inset-bottom))]'} flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-slate-950 px-2 py-3 text-slate-100 sm:px-6 sm:py-8 lg:pb-8`}>
    <div className={`${isMobileReview ? 'h-full' : 'flex-1'} mx-auto flex min-h-0 min-w-0 w-full max-w-[90rem] flex-col gap-4`}>
       <header className="ops-navbar-header ops-module-header flex min-w-0 shrink-0 items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 py-3 pl-3 shadow-xl sm:rounded-3xl sm:py-5 sm:pl-5"><div className="flex min-w-0 flex-1 items-center gap-1"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-400">Paletixa Eventos</p><h1 className="mt-1 truncate text-lg font-black tracking-tight text-white sm:text-xl">Solicita tu carrito para un evento</h1></div><InfoButton id="event-public-info" label="Información de reservas para eventos" open={infoOpen} onToggle={() => setInfoOpen((current) => !current)} className="ops-navbar-action">Elige productos o categorías, comparte tus datos y envía una solicitud. La administración confirma el pago y la disponibilidad.</InfoButton></div><div className="ops-navbar-actions ml-auto flex shrink-0 items-center"><ThemeToggle className="ops-navbar-action" /></div></header>
      {error && <div role="alert" className="ops-state ops-state-error shrink-0 rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}
       <div className={`${isMobileReview ? 'grid' : 'flex flex-col'} min-h-0 min-w-0 flex-1 items-stretch gap-4 overflow-hidden lg:grid lg:min-h-0 lg:flex-1 lg:items-stretch lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] lg:grid-rows-[minmax(0,1fr)] lg:gap-5`}>
          <div className={`${mobileCheckoutStep === 'catalog' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'} ops-panel-frame min-w-0 rounded-2xl border border-slate-800 bg-slate-950 p-3 shadow-xl sm:p-4 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden`}><DraftCatalog draft={draft} catalog={catalog} formatMoney={formatEventMoney} showPortalTabs={false} onChange={(items) => setDraft((current) => ({ ...current, items }))} /></div>
         <form noValidate onSubmit={review} className={`${mobileCheckoutStep === 'review' ? '' : 'hidden'} min-w-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden ${isMobileReview ? 'flex min-h-0 flex-1 flex-col gap-2 overflow-hidden' : ''}`}>
           <div className="mb-0 flex shrink-0 flex-wrap items-center justify-between gap-2 lg:hidden"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-400">Paso 2 de 2</p><p className="mt-1 text-sm font-semibold text-slate-300">Revisa los datos antes de enviar.</p></div><ResponsiveActionButton type="button" label="Volver al catálogo" icon="chevron-left" showLabel onClick={() => setMobileCheckoutStep('catalog')} /></div>
              <CustomerOrderSummary variant="event" formatMoney={formatEventMoney} showPaymentPanel={false} draft={draft} catalog={catalog} mobileReview={isMobileReview} submitBusy={busy || ticketBusy} onChange={(items) => setDraft((current) => ({ ...current, items }))} onClear={clearDraft} onPaymentChange={async (paymentMethod) => changePaymentMethod(paymentMethod)} beforeSubmit={<EventReservationDetails form={form} errors={fieldErrors} totalMxn={draftTotal} availability={availability} disabled={busy || ticketBusy} ticketBusy={ticketBusy} transferTicket={form.transferTicket} onTicketSelect={(event) => void selectTicket(event)} onTicketRemove={removeTicket} onPaymentMethodChange={(paymentMethod) => void changePaymentMethod(paymentMethod)} onChange={changeForm} onDateChange={changeDate} />} submitLabel="Enviar solicitud" submitLoadingLabel="Enviando solicitud…" />
         </form>
       </div>
       {mobileCheckoutStep === 'catalog' && <MobileBottomActionBar><div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{draftItemCount} {draftItemCount === 1 ? 'artículo' : 'artículos'}</p><p className="mt-1 truncate text-lg font-black text-white">{formatEventMoney(draftTotal)}</p></div></div><ResponsiveActionButton type="button" label="Revisar solicitud" icon="chevron-right" showLabel disabled={draftItemCount === 0} onClick={() => setMobileCheckoutStep('review')} className="w-full bg-sky-600 text-white hover:bg-sky-500" /></MobileBottomActionBar>}
    </div>
      {confirmationOpen && <Modal title="Confirmar solicitud de evento" description="Revisa los datos antes de enviar la solicitud." closeLabel="Cerrar confirmación" onClose={() => setConfirmationOpen(false)} busy={busy} closeDisabled={busy} maxWidthClassName="max-w-lg" headerActions={<ResponsiveActionButton type="button" label="Confirmar y enviar" icon="send" showLabel loading={busy} loadingLabel="Enviando solicitud…" onClick={() => void submit()} className="bg-sky-600 text-white hover:bg-sky-500" />}><div className="grid gap-4 p-4 sm:p-6"><p className="text-sm leading-relaxed text-slate-300">La solicitud quedará pendiente hasta que la administración verifique el pago inicial y reserve el carrito.</p><dl className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-400">Cliente</dt><dd className="font-bold text-white">{form.customerName || 'Pendiente'}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-400">Fecha</dt><dd className="font-bold text-white">{form.eventDate || 'Pendiente'}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-400">Total</dt><dd className="font-black text-sky-300">{formatEventMoney(draftTotal)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-400">Pago inicial</dt><dd className="font-bold text-white">{formatEventMoney(form.paymentPlan === 'full' ? draftTotal : Number(form.advanceAmount) || 0)}</dd></div></dl></div></Modal>}
  </main>
}
