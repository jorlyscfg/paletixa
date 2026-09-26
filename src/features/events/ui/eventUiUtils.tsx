import { useState, type ChangeEvent, type ReactNode } from 'react'
import { useRef } from 'react'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { CustomDatePicker } from '../../../app/components/CustomDatePicker'
import { InfoButton } from '../../../app/components/InfoButton'
import { CustomSelect } from '../../../app/components/CustomSelect'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import type { EventAvailability, EventPaymentMethod, EventPaymentPlan, EventReservationOrigin, EventTransferTicket } from '../api/types'
import { EVENT_ORIGIN_LABELS, type EventFormErrors, type EventFormState, formatEventMoney } from './eventFormUtils'

function fieldErrorId(field: keyof EventFormState) {
  return `event-field-error-${field}`
}

function todayValue() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

export function EventFieldTitle({ label, status }: { label: ReactNode; status: 'Obligatorio' | 'Opcional' }) {
  return <span className="flex items-center justify-between gap-3"><span>{label}</span><span className={status === 'Obligatorio' ? 'shrink-0 text-amber-300' : 'shrink-0 font-normal text-slate-500'}>{status}</span></span>
}

export function EventChoiceButtons<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; disabled: boolean }) {
  return <div role="group" aria-label={label} className="mt-2 grid grid-cols-2 gap-1.5">
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} disabled={disabled} onClick={() => onChange(option.value)} className={`ops-choice ops-focus min-h-11 text-sm transition-colors ${value === option.value ? 'border-sky-400 bg-sky-500/15 text-white' : 'border-slate-700 bg-slate-950 text-sky-100 hover:border-slate-500'}`}>{option.label}</button>)}
  </div>
}

export function EventReservationDetails({ form, errors, totalMxn, availability, disabled, onChange, onDateChange, showOrigin = false, origin, onOriginChange, ticketBusy = false, transferTicket = null, onTicketSelect, onTicketRemove, onPaymentMethodChange }: {
  form: EventFormState
  errors: EventFormErrors
  totalMxn: number
  availability?: EventAvailability | null
  disabled: boolean
  onChange: (field: keyof EventFormState, value: string) => void
  onDateChange?: (value: string) => void
  showOrigin?: boolean
  origin?: EventReservationOrigin
  onOriginChange?: (value: EventReservationOrigin) => void
  ticketBusy?: boolean
  transferTicket?: EventTransferTicket | null
  onTicketSelect?: (event: ChangeEvent<HTMLInputElement>) => void
  onTicketRemove?: () => Promise<void>
  onPaymentMethodChange?: (value: EventPaymentMethod) => void
}) {
  const [detailsInfoOpen, setDetailsInfoOpen] = useState(false)
  const ticketInputRef = useRef<HTMLInputElement>(null)
  const inputClass = (field: keyof EventFormState) => `ops-control w-full px-3 text-sm${errors[field] ? ' border-rose-400/80' : ''}`
  const describedBy = (field: keyof EventFormState) => errors[field] ? fieldErrorId(field) : undefined
  const change = (field: keyof EventFormState, event: ChangeEvent<HTMLInputElement>) => onChange(field, event.target.value)
  const changeDate = (value: string) => onDateChange ? onDateChange(value) : onChange('eventDate', value)

  return <section aria-labelledby="event-details-title" className="mb-3 rounded-2xl border border-amber-500/40 bg-slate-950/55 p-3 sm:p-4">
    <div className="flex items-center gap-1"><div><h2 id="event-details-title" className="text-sm font-black uppercase tracking-[0.12em] text-amber-400">Datos de la reserva</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">Captura el contacto, la fecha del evento y la información del pago inicial.</p></div><InfoButton id="event-details-info" label="Explicar los datos de la reserva" open={detailsInfoOpen} onToggle={() => setDetailsInfoOpen((current) => !current)}>El anticipo o pago total queda pendiente de verificación administrativa antes de reservar el carrito.</InfoButton></div>
    <div className="mt-4 grid gap-4">
      <label className="ops-field-label"><EventFieldTitle label="Nombre del cliente" status="Obligatorio" /><input aria-label="Nombre del cliente" required minLength={2} maxLength={160} className={`${inputClass('customerName')} mt-2`} value={form.customerName} disabled={disabled} aria-invalid={Boolean(errors.customerName)} aria-describedby={describedBy('customerName')} onChange={(event) => change('customerName', event)} placeholder="Ej. Mariana Torres" />{errors.customerName && <p id={fieldErrorId('customerName')} role="alert" className="mt-2 text-xs font-semibold text-rose-300">{errors.customerName}</p>}</label>
      <label className="ops-field-label"><EventFieldTitle label="Teléfono" status="Obligatorio" /><input aria-label="Teléfono del cliente" required maxLength={40} className={`${inputClass('customerPhone')} mt-2`} value={form.customerPhone} disabled={disabled} aria-invalid={Boolean(errors.customerPhone)} aria-describedby={describedBy('customerPhone')} onChange={(event) => change('customerPhone', event)} inputMode="tel" placeholder="55 1234 5678" />{errors.customerPhone && <p id={fieldErrorId('customerPhone')} role="alert" className="mt-2 text-xs font-semibold text-rose-300">{errors.customerPhone}</p>}</label>
      <label className="ops-field-label"><EventFieldTitle label="Correo" status="Opcional" /><input aria-label="Correo del cliente" type="email" maxLength={254} className={`${inputClass('customerEmail')} mt-2`} value={form.customerEmail} disabled={disabled} aria-invalid={Boolean(errors.customerEmail)} aria-describedby={describedBy('customerEmail')} onChange={(event) => change('customerEmail', event)} placeholder="cliente@ejemplo.com" />{errors.customerEmail && <p id={fieldErrorId('customerEmail')} role="alert" className="mt-2 text-xs font-semibold text-rose-300">{errors.customerEmail}</p>}</label>
      <label className="ops-field-label"><EventFieldTitle label="Fecha del evento" status="Obligatorio" /><div className="mt-2"><CustomDatePicker value={form.eventDate} minValue={todayValue()} onChange={changeDate} disabled={disabled} ariaLabel="Fecha del evento" ariaRequired ariaInvalid={Boolean(errors.eventDate)} /></div>{errors.eventDate && <p id={fieldErrorId('eventDate')} role="alert" className="mt-2 text-xs font-semibold text-rose-300">{errors.eventDate}</p>}{availability && <p role="status" className="mt-2 text-xs font-semibold text-sky-300">{availability.availableCount} de {availability.capacityLimit} carritos disponibles para esta fecha.</p>}</label>
      {showOrigin && origin && onOriginChange && <label className="ops-field-label"><EventFieldTitle label="Origen de la solicitud" status="Obligatorio" /><CustomSelect label="Origen de la solicitud" value={origin} disabled={disabled} options={Object.entries(EVENT_ORIGIN_LABELS).filter(([value]) => value !== 'public').map(([value, label]) => ({ value, label }))} onChange={(value) => onOriginChange(value as EventReservationOrigin)} className="mt-2" /></label>}
      <fieldset>
        <legend className="text-xs font-bold text-slate-300"><EventFieldTitle label="Forma de pago inicial" status="Obligatorio" /></legend>
        <EventChoiceButtons label="Forma de pago inicial" value={form.paymentPlan} options={[{ value: 'advance', label: 'Anticipo' }, { value: 'full', label: 'Pago total' }]} onChange={(value: EventPaymentPlan) => onChange('paymentPlan', value)} disabled={disabled} />
      </fieldset>
      {form.paymentPlan === 'advance' ? <label className="ops-field-label"><EventFieldTitle label="Anticipo en MXN" status="Obligatorio" /><input aria-label="Anticipo en MXN" type="number" min="1" step="1" inputMode="numeric" className={`${inputClass('advanceAmount')} mt-2`} value={form.advanceAmount} disabled={disabled} aria-invalid={Boolean(errors.advanceAmount)} aria-describedby={describedBy('advanceAmount')} onChange={(event) => onChange('advanceAmount', event.target.value)} placeholder="0" />{errors.advanceAmount && <p id={fieldErrorId('advanceAmount')} role="alert" className="mt-2 text-xs font-semibold text-rose-300">{errors.advanceAmount}</p>}</label> : <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3 text-sm"><EventFieldTitle label="Pago inicial confirmado por el cliente" status="Obligatorio" /><strong className="mt-2 block text-right text-white">{formatEventMoney(totalMxn)}</strong></div>}
      <fieldset>
        <legend className="text-xs font-bold text-slate-300"><EventFieldTitle label="Método del pago inicial" status="Obligatorio" /></legend>
        <EventChoiceButtons label="Método del pago inicial" value={form.paymentMethod} options={[{ value: 'cash', label: 'Efectivo' }, { value: 'transfer', label: 'Transferencia' }]} onChange={(value: EventPaymentMethod) => onPaymentMethodChange ? onPaymentMethodChange(value) : onChange('paymentMethod', value)} disabled={disabled} />
      </fieldset>
      {form.paymentMethod === 'transfer' && <label className="ops-field-label"><EventFieldTitle label="Referencia del pago" status="Opcional" /><input aria-label="Referencia del pago inicial" maxLength={160} className={`${inputClass('paymentReference')} mt-2`} value={form.paymentReference} disabled={disabled} aria-invalid={Boolean(errors.paymentReference)} aria-describedby={describedBy('paymentReference')} onChange={(event) => change('paymentReference', event)} placeholder="Folio, nota o referencia" />{errors.paymentReference && <p id={fieldErrorId('paymentReference')} role="alert" className="mt-2 text-xs font-semibold text-rose-300">{errors.paymentReference}</p>}</label>}
      {form.paymentMethod === 'transfer' && onTicketSelect && <div className="grid gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3"><div><EventFieldTitle label="Comprobante de transferencia" status="Opcional" /><p className="mt-1 text-xs leading-relaxed text-slate-400">Puedes adjuntar una imagen para que administración verifique el pago.</p></div><input ref={ticketInputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Comprobante de transferencia (opcional)" onChange={onTicketSelect} disabled={disabled || ticketBusy} className="sr-only" /><div className="flex min-w-0 items-center gap-3"><CatalogImageTile src={transferTicket?.url ?? null} alt="Vista previa del comprobante de transferencia" imageClassName="object-contain" role="button" tabIndex={disabled || ticketBusy ? -1 : 0} aria-disabled={disabled || ticketBusy} title={transferTicket ? 'Cambiar comprobante' : 'Adjuntar comprobante'} onClick={() => ticketInputRef.current?.click()} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && !disabled && !ticketBusy) { event.preventDefault(); ticketInputRef.current?.click() } }} className="h-16 w-16 shrink-0 cursor-pointer rounded-lg border-slate-700 bg-slate-900 ops-focus aria-disabled:cursor-not-allowed aria-disabled:opacity-60" /><div className="flex min-w-0 flex-wrap items-center gap-2"><ResponsiveActionButton type="button" label={transferTicket ? 'Cambiar comprobante' : 'Adjuntar comprobante'} icon={transferTicket ? 'edit' : 'plus'} iconOnly aria-label={transferTicket ? 'Cambiar comprobante' : 'Adjuntar comprobante'} title={transferTicket ? 'Cambiar comprobante' : 'Adjuntar comprobante'} onClick={() => ticketInputRef.current?.click()} disabled={disabled || ticketBusy} />{transferTicket && onTicketRemove && <ResponsiveActionButton type="button" label="Eliminar comprobante" icon="trash" iconOnly aria-label="Eliminar comprobante" title="Eliminar comprobante" onClick={() => void onTicketRemove()} disabled={disabled || ticketBusy} />}{ticketBusy && <span role="status" className="text-xs font-semibold text-sky-300">Subiendo comprobante…</span>}</div></div></div>}
    </div>
  </section>
}
