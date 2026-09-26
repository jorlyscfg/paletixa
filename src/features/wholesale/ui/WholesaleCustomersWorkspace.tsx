import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { InfoButton } from '../../../app/components/InfoButton'
import { Modal } from '../../../app/components/Modal'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { SearchInput } from '../../../app/components/SearchInput'
import { isSessionBoolean, isSessionRecord, isSessionString, useAdminSessionPersistence } from '../../../app/sessionPersistence'
import { createWholesaleCustomer, deleteWholesaleCustomer, listWholesaleCustomers, regenerateWholesaleCustomerPin, setWholesaleCustomerStatus, updateWholesaleCustomer } from '../api/customers'
import { listWholesaleOrders } from '../api/orders'
import type { WholesaleCustomer, WholesaleCustomerPin, WholesaleOrder } from '../api/types'
import { createWholesaleRequestId } from './wholesaleUiUtils'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.'
}

function PinModal({ customer, onClose }: { customer: WholesaleCustomerPin; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copyPin() {
    try {
      await navigator.clipboard.writeText(customer.currentPin)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return <Modal title="PIN actual" description={`Este PIN también permanece visible en la tarjeta administrativa de ${customer.name}.`} closeLabel="Cerrar PIN" onClose={onClose} maxWidthClassName="max-w-md"><div className="grid gap-4 p-6 text-center"><p className="text-4xl font-black tracking-[0.35em] text-amber-300">{customer.currentPin}</p><div className="flex justify-center gap-2"><ResponsiveActionButton label={copied ? 'Copiado' : 'Copiar PIN'} icon="copy" onClick={() => void copyPin()} /><ResponsiveActionButton label="Cerrar" onClick={onClose} /></div></div></Modal>
}

type CustomerEditorSession = { customerId: string | null; name: string; mobile: string; email: string }
type WholesaleCustomersSessionState = { query: string; infoOpen: boolean; editor: CustomerEditorSession | null }

function isCustomerEditorSession(value: unknown): value is CustomerEditorSession {
  return isSessionRecord(value) && (value.customerId === null || isSessionString(value.customerId)) && isSessionString(value.name) && isSessionString(value.mobile) && isSessionString(value.email)
}

function isWholesaleCustomersSessionState(value: unknown): value is WholesaleCustomersSessionState {
  return isSessionRecord(value) && isSessionString(value.query) && isSessionBoolean(value.infoOpen) && (value.editor === null || isCustomerEditorSession(value.editor))
}

function emptyCustomerEditorSession(): CustomerEditorSession {
  return { customerId: null, name: '', mobile: '', email: '' }
}

function CustomerEditorModal({ customer, restored, onStateChange, onClose, onSaved, onCreated }: { customer: WholesaleCustomer | null; restored?: CustomerEditorSession; onStateChange?: (state: CustomerEditorSession) => void; onClose: () => void; onSaved: (customer: WholesaleCustomer) => void; onCreated: (customer: WholesaleCustomerPin) => void }) {
  const persistence = useAdminSessionPersistence()
  const [storedEditor] = useState(() => restored ?? persistence?.read('wholesale-customers-editor', isCustomerEditorSession) ?? persistence?.read('wholesale-customers', isWholesaleCustomersSessionState)?.editor ?? undefined)
  const [name, setName] = useState(storedEditor?.name ?? customer?.name ?? '')
  const [mobile, setMobile] = useState(storedEditor?.mobile ?? customer?.mobile ?? '')
  const [email, setEmail] = useState(storedEditor?.email ?? customer?.email ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const state = { customerId: customer?.id ?? null, name, mobile, email }
    onStateChange?.(state)
    persistence?.write('wholesale-customers-editor', state)
  }, [customer?.id, email, mobile, name, onStateChange, persistence])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (customer) onSaved(await updateWholesaleCustomer({ requestId: createWholesaleRequestId(), customerId: customer.id, name, mobile, email }))
      else onCreated(await createWholesaleCustomer({ requestId: createWholesaleRequestId(), name, mobile, email }))
      onClose()
    } catch (saveError) { setError(errorMessage(saveError)) } finally { setBusy(false) }
  }

  return <Modal title={customer ? 'Editar cliente' : 'Nuevo cliente'} description="El celular es el identificador del acceso de cliente." closeLabel="Cerrar formulario de cliente" onClose={onClose} busy={busy} maxWidthClassName="max-w-lg" headerActions={<ResponsiveActionButton type="submit" form="wholesale-customer-form" label={customer ? 'Guardar cambios' : 'Crear cliente y generar PIN'} icon="save" loading={busy} loadingLabel="Guardando…" disabled={busy} />}><form id="wholesale-customer-form" className="grid gap-4 p-4 sm:p-6" onSubmit={submit}>{error && <p role="alert" className="ops-state ops-state-error rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">{error}</p>}<label className="ops-field-label">Nombre<input required value={name} onChange={(event) => setName(event.target.value)} className="ops-control px-3" /></label><label className="ops-field-label">Celular<input required value={mobile} onChange={(event) => setMobile(event.target.value)} inputMode="tel" className="ops-control px-3" /></label><label className="ops-field-label">Correo (opcional)<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="ops-control px-3" /></label></form></Modal>
}

function ReasonModal({ title, description, confirmLabel, onClose, onConfirm }: { title: string; description: string; confirmLabel: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (!reason.trim()) { setError('El motivo es obligatorio.'); return }
    setBusy(true)
    setError('')
    try { await onConfirm(reason); onClose() } catch (confirmError) { setError(errorMessage(confirmError)) } finally { setBusy(false) }
  }

  return <Modal title={title} description={description} closeLabel="Cerrar motivo" onClose={onClose} busy={busy} maxWidthClassName="max-w-lg" headerActions={<ResponsiveActionButton label={confirmLabel} icon="check" loading={busy} loadingLabel="Guardando…" onClick={() => void confirm()} />}><div className="grid gap-4 p-4 sm:p-6"><label className="ops-field-label">Motivo obligatorio<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="ops-control px-3 py-2" /></label>{error && <p role="alert" className="ops-state ops-state-error text-sm text-rose-200">{error}</p>}</div></Modal>
}

export function WholesaleCustomersWorkspace() {
  const persistence = useAdminSessionPersistence()
  const sessionModule = 'wholesale-customers'
  const [restoredSession] = useState<WholesaleCustomersSessionState>(() => persistence?.read(sessionModule, isWholesaleCustomersSessionState) ?? { query: '', infoOpen: false, editor: null })
  const [customers, setCustomers] = useState<WholesaleCustomer[]>([])
  const [orders, setOrders] = useState<WholesaleOrder[]>([])
  const [query, setQuery] = useState(restoredSession.query)
  const [infoOpen, setInfoOpen] = useState(restoredSession.infoOpen)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<WholesaleCustomer | null | undefined>(undefined)
  const [pin, setPin] = useState<WholesaleCustomerPin | null>(null)
  const [reasonAction, setReasonAction] = useState<{ kind: 'status' | 'pin' | 'delete'; customer: WholesaleCustomer } | null>(null)
  const [editorDraft, setEditorDraft] = useState<CustomerEditorSession | null>(restoredSession.editor)

  useEffect(() => {
    const editorState = editor === undefined ? null : editorDraft ?? { customerId: editor?.id ?? null, name: editor?.name ?? '', mobile: editor?.mobile ?? '', email: editor?.email ?? '' }
    persistence?.write(sessionModule, { query, infoOpen, editor: editorState })
    if (editor === undefined) persistence?.remove('wholesale-customers-editor')
  }, [editor, editorDraft, infoOpen, persistence, query, sessionModule])

  useEffect(() => {
    let mounted = true
    void Promise.all([listWholesaleCustomers(), listWholesaleOrders(true)]).then(([nextCustomers, nextOrders]) => { if (mounted) { setCustomers(nextCustomers); setOrders(nextOrders); if (restoredSession.editor) setEditor(restoredSession.editor.customerId ? nextCustomers.find((customer) => customer.id === restoredSession.editor?.customerId) ?? undefined : null) } }).catch((loadError) => { if (mounted) setError(errorMessage(loadError)) }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [restoredSession.editor])

  const orderCountByCustomer = useMemo(() => orders.reduce<Record<string, number>>((counts, order) => ({ ...counts, [order.customerId]: (counts[order.customerId] ?? 0) + 1 }), {}), [orders])
  const visibleCustomers = useMemo(() => { const normalized = query.trim().toLocaleLowerCase('es-MX'); return customers.filter((customer) => normalized === '' || `${customer.name} ${customer.mobile} ${customer.email ?? ''}`.toLocaleLowerCase('es-MX').includes(normalized)) }, [customers, query])

  function openNewEditor() {
    setEditorDraft(emptyCustomerEditorSession())
    setEditor(null)
  }

  function openExistingEditor(customer: WholesaleCustomer) {
    setEditorDraft({ customerId: customer.id, name: customer.name, mobile: customer.mobile, email: customer.email ?? '' })
    setEditor(customer)
  }

  function closeEditor() {
    setEditor(undefined)
    setEditorDraft(null)
  }

  function savedCustomer(customer: WholesaleCustomer) {
    setCustomers((current) => current.map((candidate) => candidate.id === customer.id ? customer : candidate))
    setNotice('Cliente actualizado.')
  }

  function createdCustomer(customer: WholesaleCustomerPin) {
    setCustomers((current) => [...current.filter((candidate) => candidate.id !== customer.id), customer].sort((left, right) => left.name.localeCompare(right.name, 'es-MX')))
    setPin(customer)
    setNotice('Cliente creado. El PIN actual queda visible en su tarjeta administrativa.')
  }

  async function confirmReason(reason: string) {
    if (!reasonAction) return
    const { customer, kind } = reasonAction
    if (kind === 'status') {
      const updated = await setWholesaleCustomerStatus({ requestId: createWholesaleRequestId(), customerId: customer.id, status: customer.status === 'active' ? 'inactive' : 'active', reason })
      savedCustomer(updated)
    } else if (kind === 'pin') {
      const regenerated = await regenerateWholesaleCustomerPin({ requestId: createWholesaleRequestId(), customerId: customer.id, reason })
      setCustomers((current) => current.map((candidate) => candidate.id === customer.id ? regenerated : candidate))
      setPin(regenerated)
      setNotice('PIN regenerado y actualizado en la tarjeta.')
    } else {
      const result = await deleteWholesaleCustomer({ requestId: createWholesaleRequestId(), customerId: customer.id, reason })
      if (result.deleted) setCustomers((current) => current.filter((candidate) => candidate.id !== customer.id))
      else savedCustomer({ ...customer, status: 'inactive' })
      setNotice(result.deleted ? 'Cliente eliminado.' : 'El cliente tiene pedidos y fue desactivado en lugar de eliminarse.')
    }
  }

  if (loading) return <section className="ops-workspace-frame flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center"><p role="status" className="ops-state ops-state-loading">Cargando Clientes…</p></section>

  return <section aria-label="Módulo Clientes" className="ops-workspace-frame flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-3 text-slate-100 shadow-2xl sm:p-5 lg:p-6"><header className="ops-module-header flex shrink-0 flex-col gap-3 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-400">Acceso mayorista</p><div className="flex items-center gap-1"><InfoButton id="wholesale-customers-info" label="Información de Clientes" open={infoOpen} onToggle={() => setInfoOpen((current) => !current)}>Administra clientes, estados y PIN sin exponer credenciales fuera del área administrativa.</InfoButton></div></div><div className="flex w-full flex-row items-center gap-3 sm:w-auto"><SearchInput value={query} onChange={setQuery} label="Buscar clientes" placeholder="Buscar por nombre, celular o correo" containerClassName="min-w-0 flex-1 sm:w-80 sm:flex-none" className="text-sm" /><ResponsiveActionButton label="Nuevo cliente" icon="plus" iconOnly onClick={openNewEditor} /></div></header>{notice && <div role="status" className="mt-3 shrink-0 rounded-2xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">{notice}</div>}{error && <div role="alert" className="mt-3 shrink-0 rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}<div className="ops-panel-frame mt-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-3 sm:p-4"><div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs font-semibold text-slate-400">{visibleCustomers.length} de {customers.length} clientes mostrados</p></div><div className="ops-scroll-region mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"><div className="grid gap-3">{visibleCustomers.map((customer) => { const orderCount = orderCountByCustomer[customer.id] ?? 0; return <article key={customer.id} className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-white">{customer.name}</h2><span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${customer.status === 'active' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-400'}`}>{customer.status === 'active' ? 'Activo' : 'Inactivo'}</span></div><p className="mt-1 truncate text-sm text-slate-400" title={`${customer.mobile}${customer.email ? ` · ${customer.email}` : ''}`}>{customer.mobile}{customer.email ? ` · ${customer.email}` : ''}</p><p className="mt-1 text-xs text-slate-500">{orderCount} pedido(s) · {customer.failedLoginAttempts ?? 0} intento(s) fallido(s)</p><p className="mt-3 text-sm text-amber-200">PIN actual: <strong className="font-black tracking-[0.2em]">{customer.currentPin}</strong></p></div><div className="flex shrink-0 flex-wrap justify-end gap-1.5"><ResponsiveActionButton label="Editar" icon="edit" iconOnly onClick={() => openExistingEditor(customer)} /><ResponsiveActionButton label={customer.status === 'active' ? 'Desactivar' : 'Activar'} icon="power" iconOnly onClick={() => setReasonAction({ kind: 'status', customer })} /><ResponsiveActionButton label="Regenerar PIN" icon="key" iconOnly onClick={() => setReasonAction({ kind: 'pin', customer })} /><ResponsiveActionButton label="Eliminar" icon="trash" iconOnly onClick={() => setReasonAction({ kind: 'delete', customer })} /></div></article> })}{visibleCustomers.length === 0 && <p role="status" className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">No hay clientes para este filtro.</p>}</div></div></div>{editor !== undefined && <CustomerEditorModal customer={editor} restored={editorDraft ?? undefined} onStateChange={setEditorDraft} onClose={closeEditor} onSaved={savedCustomer} onCreated={createdCustomer} />}{pin && <PinModal customer={pin} onClose={() => setPin(null)} />}{reasonAction && <ReasonModal title={reasonAction.kind === 'pin' ? 'Regenerar PIN' : reasonAction.kind === 'status' ? `${reasonAction.customer.status === 'active' ? 'Desactivar' : 'Activar'} cliente` : 'Eliminar cliente'} description={reasonAction.kind === 'pin' ? 'El nuevo PIN queda visible en la tarjeta administrativa y se registra el motivo sin guardar el PIN en auditoría.' : 'El motivo es obligatorio y se registra en la auditoría.'} confirmLabel={reasonAction.kind === 'pin' ? 'Regenerar PIN' : reasonAction.kind === 'status' ? 'Guardar estado' : 'Eliminar cliente'} onClose={() => setReasonAction(null)} onConfirm={confirmReason} />}</section>
}
