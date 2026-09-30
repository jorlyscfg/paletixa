import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { CustomSelect } from '../../../app/components/CustomSelect'
import { InfoButton } from '../../../app/components/InfoButton'
import { CatalogMobileSummary } from '../../../app/components/CatalogPresentation'
import { Modal } from '../../../app/components/Modal'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { SearchInput } from '../../../app/components/SearchInput'
import { isSessionBoolean, isSessionRecord, isSessionString, useAdminSessionPersistence } from '../../../app/sessionPersistence'
import { listPublicWholesaleCatalog, type WholesaleCatalogProduct } from '../api/catalog'
import { listWholesaleCustomers } from '../api/customers'
import { createWholesaleAdminOrder, completeWholesaleOrder, deleteWholesaleOrder, listWholesaleOrders, markWholesaleOrderSeen, setWholesaleOrderStatus } from '../api/orders'
import { subscribeToWholesaleOrderEvents } from '../api/realtime'
import { refreshWholesaleAdminTransferTicketUrl } from '../api/transferTickets'
import type { WholesaleCustomer, WholesaleOrder, WholesaleOrderState } from '../api/types'
import { WHOLESALE_ORDER_STATES } from '../api/validators'
import { CustomerOrderSummary, DraftCatalog } from './WholesaleCustomerPortal'
import { createEmptyWholesaleDraft, createWholesaleRequestId, formatWholesaleDate, formatWholesaleMoney, getWholesaleDraftTotal, getWholesaleWhatsAppUrl, toWholesaleOrderItems, type WholesaleDraft, WHOLESALE_STATUS_LABELS } from './wholesaleUiUtils'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.'
}

async function refreshAdminOrderTransferTicket(order: WholesaleOrder) {
  if (!order.transferTicket?.key) return order

  try {
    const transferTicket = await refreshWholesaleAdminTransferTicketUrl(order.id, order.transferTicket.key)
    return { ...order, transferTicket }
  } catch {
    return order
  }
}

async function refreshAdminOrderTransferTickets(orders: WholesaleOrder[]) {
  return Promise.all(orders.map((order) => refreshAdminOrderTransferTicket(order)))
}

function OrderCompletionModal({ order, onClose, onCompleted }: { order: WholesaleOrder; onClose: () => void; onCompleted: (order: WholesaleOrder) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function complete() {
    setBusy(true)
    setError('')
    try {
      await onCompleted(await completeWholesaleOrder({
        requestId: createWholesaleRequestId(),
        orderId: order.id,
        completion: {
          paymentAmount: order.totalMxn,
          paymentCurrency: 'mxn',
          paymentReference: null,
          paymentNote: null,
          deliveryAgreement: 'delivery',
        },
        reason: 'Pedido cobrado en su totalidad y entregado al cliente',
      }))
      onClose()
    } catch (completeError) {
      setError(errorMessage(completeError))
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Confirmar finalización del pedido" description="Esta acción marcará el pedido como completado y generará una venta." closeLabel="Cerrar confirmación" onClose={onClose} busy={busy} maxWidthClassName="max-w-xl" headerActions={<ResponsiveActionButton label="Confirmar finalización y generar venta" icon="check" loading={busy} loadingLabel="Completando…" onClick={() => void complete()} />}>
    <div className="grid gap-4 p-4 sm:p-6">
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-3 text-sm text-amber-100">
        <p className="font-semibold">Al confirmar, se asumirá lo siguiente:</p>
        <ul className="mt-2 grid gap-2 list-disc pl-5">
          <li>Se asumirá que se cobró el importe total del pedido: <strong>{formatWholesaleMoney(order.totalMxn)}</strong>.</li>
          <li>Se asumirá que el pedido ya fue entregado al cliente.</li>
          <li>El pedido se convertirá en una venta confirmada.</li>
        </ul>
      </div>
      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">{error}</p>}
    </div>
  </Modal>
}

function DeleteOrderModal({ order, onClose, onDeleted }: { order: WholesaleOrder; onClose: () => void; onDeleted: (order: WholesaleOrder) => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    if (!reason.trim()) { setError('Indica el motivo de la eliminación.'); return }
    setBusy(true)
    setError('')
    try {
      await deleteWholesaleOrder({ requestId: createWholesaleRequestId(), orderId: order.id, reason })
      await onDeleted(order)
      onClose()
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Eliminar pedido" description="La eliminación es lógica y conserva la auditoría. Un pedido completado revertirá su venta activa." closeLabel="Cerrar eliminación" onClose={onClose} busy={busy} maxWidthClassName="max-w-lg" headerActions={<ResponsiveActionButton label="Confirmar eliminación" icon="trash" loading={busy} loadingLabel="Eliminando…" onClick={() => void remove()} />}>
    <div className="grid gap-4 p-4 sm:p-6">
      <label className="grid gap-1.5 text-sm font-medium text-slate-200">Motivo obligatorio<textarea aria-label="Motivo obligatorio" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="ops-control px-3 py-2" placeholder="Describe por qué debe eliminarse…" /></label>
      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">{error}</p>}
    </div>
  </Modal>
}

type WholesaleAdminTab = 'management' | 'create'
type WholesaleAdminComposerSession = {
  customerId: string
  customerSearch: string
  draft: { reorderFromOrderId: null; draftAction: null; items: Record<string, number>; paymentMethod: WholesaleDraft['paymentMethod'] }
  mobileCheckoutStep: 'catalog' | 'review'
}
type WholesaleAdminSessionState = {
  filter: 'all' | WholesaleOrderState
  query: string
  activeTab: WholesaleAdminTab
  adminInfoOpen: boolean
  composer: WholesaleAdminComposerSession
}

function isPositiveOrZeroIntegerRecord(value: unknown): value is Record<string, number> {
  return isSessionRecord(value) && Object.entries(value).every(([key, item]) => key.trim() !== '' && typeof item === 'number' && Number.isSafeInteger(item) && item >= 0)
}

function isWholesaleAdminComposerSession(value: unknown): value is WholesaleAdminComposerSession {
  if (!isSessionRecord(value) || !isSessionString(value.customerId) || !isSessionString(value.customerSearch) || !isSessionRecord(value.draft) || !isSessionString(value.mobileCheckoutStep) || !['catalog', 'review'].includes(value.mobileCheckoutStep)) return false
  const draft = value.draft
  return draft.reorderFromOrderId === null && draft.draftAction === null && isPositiveOrZeroIntegerRecord(draft.items) && isSessionString(draft.paymentMethod) && ['cash', 'credit', 'transfer'].includes(draft.paymentMethod)
}

function isWholesaleAdminSessionState(value: unknown): value is WholesaleAdminSessionState {
  if (!isSessionRecord(value) || !isSessionString(value.filter) || !['all', ...WHOLESALE_ORDER_STATES].includes(value.filter) || !isSessionString(value.query) || !isSessionString(value.activeTab) || !['management', 'create'].includes(value.activeTab) || !isSessionBoolean(value.adminInfoOpen)) return false
  return isWholesaleAdminComposerSession(value.composer)
}

const emptyComposerSession = (): WholesaleAdminComposerSession => ({ customerId: '', customerSearch: '', draft: { reorderFromOrderId: null, draftAction: null, items: {}, paymentMethod: 'cash' }, mobileCheckoutStep: 'catalog' })

function AdminOrderComposer({ customers, catalog, onCreated, restored, onStateChange }: { customers: WholesaleCustomer[]; catalog: WholesaleCatalogProduct[]; onCreated: (order: WholesaleOrder) => Promise<void>; restored?: WholesaleAdminComposerSession; onStateChange?: (state: WholesaleAdminComposerSession) => void }) {
  const restoredSession = restored ?? emptyComposerSession()
  const [customerId, setCustomerId] = useState(restoredSession.customerId)
  const [customerSearch, setCustomerSearch] = useState(restoredSession.customerSearch)
  const [customerResultsOpen, setCustomerResultsOpen] = useState(false)
  const [highlightedCustomerIndex, setHighlightedCustomerIndex] = useState(0)
  const [draft, setDraft] = useState<WholesaleDraft>(() => ({ ...restoredSession.draft, transferTicket: null }))
  const [mobileCheckoutStep, setMobileCheckoutStep] = useState<'catalog' | 'review'>(restoredSession.mobileCheckoutStep)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const customerSearchRegionRef = useRef<HTMLDivElement>(null)
  const activeCustomers = useMemo(() => customers.filter((customer) => customer.status === 'active'), [customers])
  const selectedCustomer = activeCustomers.find((customer) => customer.id === customerId) ?? null
  const filteredCustomers = useMemo(() => {
    const normalizedQuery = customerSearch.trim().toLocaleLowerCase('es-MX')
    return activeCustomers.filter((customer) => `${customer.name} ${customer.mobile} ${customer.email ?? ''}`.toLocaleLowerCase('es-MX').includes(normalizedQuery))
  }, [activeCustomers, customerSearch])

  useEffect(() => {
    onStateChange?.({ customerId, customerSearch, draft: { reorderFromOrderId: null, draftAction: null, items: draft.items, paymentMethod: draft.paymentMethod }, mobileCheckoutStep })
  }, [customerId, customerSearch, draft, mobileCheckoutStep, onStateChange])

  useEffect(() => {
    if (!customerResultsOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !customerSearchRegionRef.current?.contains(event.target)) setCustomerResultsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [customerResultsOpen])

  async function clearDraft() {
    setDraft(createEmptyWholesaleDraft())
    setMobileCheckoutStep('catalog')
    setError('')
  }

  async function changePaymentMethod(paymentMethod: WholesaleDraft['paymentMethod']) {
    setDraft((current) => ({ ...current, paymentMethod, transferTicket: paymentMethod === 'transfer' ? current.transferTicket : null }))
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const items = toWholesaleOrderItems(draft.items)
    if (!customerId || !selectedCustomer) { setError('Selecciona un cliente activo.'); return }
    if (items.length === 0) { setError('Agrega al menos un producto o categoría.'); return }
    setBusy(true)
    setError('')
    try {
      const order = await createWholesaleAdminOrder({ requestId: createWholesaleRequestId(), customerId, items, paymentMethod: draft.paymentMethod, transferTicket: draft.transferTicket, initialStatus: 'pending' })
      await onCreated(order)
      setDraft(createEmptyWholesaleDraft())
      setCustomerId('')
      setCustomerSearch('')
      setMobileCheckoutStep('catalog')
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }

  function selectCustomer(customer: WholesaleCustomer) {
    setCustomerId(customer.id)
    setCustomerSearch(customer.name)
    setCustomerResultsOpen(false)
    setHighlightedCustomerIndex(0)
  }

  function changeCustomer() {
    setCustomerId('')
    setCustomerSearch('')
    setCustomerResultsOpen(true)
    setHighlightedCustomerIndex(0)
  }

  function handleCustomerSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCustomerResultsOpen(true)
      setHighlightedCustomerIndex((current) => filteredCustomers.length === 0 ? 0 : (current + 1) % filteredCustomers.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCustomerResultsOpen(true)
      setHighlightedCustomerIndex((current) => filteredCustomers.length === 0 ? 0 : (current - 1 + filteredCustomers.length) % filteredCustomers.length)
    } else if (event.key === 'Enter' && customerResultsOpen && filteredCustomers[highlightedCustomerIndex]) {
      event.preventDefault()
      selectCustomer(filteredCustomers[highlightedCustomerIndex])
    } else if (event.key === 'Escape') {
      setCustomerResultsOpen(false)
    }
  }

  const isMobileReview = mobileCheckoutStep === 'review'
  const draftItemCount = toWholesaleOrderItems(draft.items).reduce((count, item) => count + item.quantity, 0)
  const draftTotal = getWholesaleDraftTotal(draft, catalog)

  return <section aria-label="Crear pedido mayorista" className={`flex min-h-0 min-w-0 flex-1 flex-col gap-4 ${isMobileReview ? 'overflow-hidden' : 'overflow-visible'} text-slate-100 lg:h-full lg:overflow-hidden`}>
     <div className="ops-panel-frame grid gap-1.5 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm font-medium text-slate-200 shadow-xl sm:p-4 lg:shrink-0">
      <span>Cliente activo</span>
      {selectedCustomer ? <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3"><div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-300">Cliente seleccionado</p><p className="mt-1 truncate font-bold text-white">{selectedCustomer.name}</p><p className="mt-1 truncate text-xs text-slate-300">{selectedCustomer.mobile}</p></div><ResponsiveActionButton type="button" label="Cambiar cliente" icon="edit" showLabel onClick={changeCustomer} className="shrink-0" /></div> : <div ref={customerSearchRegionRef} className="relative"><input id="wholesale-admin-customer-search" role="combobox" aria-label="Buscar clientes activos" aria-autocomplete="list" aria-controls="wholesale-admin-customer-results" aria-expanded={customerResultsOpen} aria-activedescendant={customerResultsOpen && filteredCustomers[highlightedCustomerIndex] ? `wholesale-admin-customer-result-${filteredCustomers[highlightedCustomerIndex].id}` : undefined} value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); setCustomerResultsOpen(true); setHighlightedCustomerIndex(0) }} onFocus={() => setCustomerResultsOpen(true)} onKeyDown={handleCustomerSearchKeyDown} className="ops-control ops-focus min-h-11 w-full px-3 text-sm text-white" placeholder="Buscar por nombre o celular" />{customerResultsOpen && <div id="wholesale-admin-customer-results" role="listbox" aria-label="Clientes activos filtrados" className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-20 max-h-64 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">{filteredCustomers.length > 0 ? <div className="grid gap-1">{filteredCustomers.map((customer, index) => <button key={customer.id} id={`wholesale-admin-customer-result-${customer.id}`} type="button" role="option" aria-selected={highlightedCustomerIndex === index} onMouseDown={(event) => event.preventDefault()} onClick={() => selectCustomer(customer)} className={`ops-focus grid min-h-11 w-full gap-0.5 rounded-xl px-3 py-2 text-left ${highlightedCustomerIndex === index ? 'bg-sky-500/15' : 'hover:bg-slate-800'}`}><span className="truncate text-sm font-bold text-white">{customer.name}</span><span className="truncate text-xs text-slate-400">{customer.mobile}{customer.email ? ` · ${customer.email}` : ''}</span></button>)}</div> : <p role="status" className="px-3 py-4 text-sm text-slate-400">No hay clientes activos que coincidan.</p>}</div>}</div>}
    </div>
    {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100 lg:shrink-0">{error}</p>}
     <div data-testid="wholesale-admin-composer-layout" className={`${isMobileReview ? 'grid' : 'flex flex-col'} min-h-0 min-w-0 flex-1 items-stretch gap-4 overflow-hidden lg:grid lg:min-h-0 lg:flex-1 lg:items-stretch lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] lg:grid-rows-[minmax(0,1fr)] lg:gap-5`}>
       <div data-testid="wholesale-admin-catalog-panel" className={`min-w-0 ${mobileCheckoutStep === 'catalog' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'} lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden`}><DraftCatalog draft={draft} catalog={catalog} showPortalTabs={false} presentationVariant="admin" onChange={(items) => setDraft((current) => ({ ...current, items }))} /></div>
      <form noValidate onSubmit={createOrder} className={`min-w-0 ${mobileCheckoutStep === 'review' ? '' : 'hidden'} lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden ${isMobileReview ? 'flex min-h-0 flex-1 flex-col gap-2 overflow-hidden' : ''}`}>
        <div className="mb-0 flex shrink-0 flex-wrap items-center justify-between gap-2 lg:hidden"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-400">Paso 2 de 2</p><p className="mt-1 text-sm font-semibold text-slate-300">Revisa tu pedido antes de crearlo.</p></div><ResponsiveActionButton type="button" label="Volver al catálogo" icon="chevron-left" showLabel onClick={() => setMobileCheckoutStep('catalog')} /></div>
        <CustomerOrderSummary draft={draft} catalog={catalog} ticketBusy={false} submitBusy={busy} mobileReview={isMobileReview} scrollableSummary submitLabel="Crear pedido" submitLoadingLabel="Creando…" onChange={(items) => setDraft((current) => ({ ...current, items }))} onClear={clearDraft} onPaymentChange={changePaymentMethod} ticketReference={{ url: draft.transferTicket?.url ?? '', key: draft.transferTicket?.key ?? '', helperText: 'La carga de imágenes usa la sesión segura del portal del cliente. Aquí solo se aceptan URL y clave ya autorizadas.', onChange: ({ url, key }) => setDraft((current) => ({ ...current, transferTicket: url || key ? { url, key } : null })) }} />
      </form>
    </div>
    {mobileCheckoutStep === 'catalog' && <CatalogMobileSummary dataTestId="wholesale-admin-mobile-summary" count={draftItemCount} singularLabel="artículo" pluralLabel="artículos" total={formatWholesaleMoney(draftTotal)} actionLabel="Revisar pedido" disabled={draftItemCount === 0} onAction={() => setMobileCheckoutStep('review')} detailsTestId="wholesale-admin-mobile-summary-details" />}
  </section>
}

function InlineOrderStatusSelector({ order, onStatusChange, onOpenCompletion }: { order: WholesaleOrder; onStatusChange: (status: WholesaleOrderState) => Promise<void>; onOpenCompletion: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function changeStatus(status: WholesaleOrderState) {
    if (status === order.status) return
    setError('')
    if (status === 'completed') {
      onOpenCompletion()
      return
    }
    setBusy(true)
    try {
      await onStatusChange(status)
    } catch (statusError) {
      setError(errorMessage(statusError))
    } finally {
      setBusy(false)
    }
  }

  return <div className="grid min-w-0 gap-1">
    <CustomSelect
      value={order.status}
      onChange={(status) => { void changeStatus(status as WholesaleOrderState) }}
      options={WHOLESALE_ORDER_STATES.map((status) => ({ value: status, label: WHOLESALE_STATUS_LABELS[status] }))}
      label={`Estado del pedido ${order.id.slice(0, 8)}`}
      disabled={busy}
      className="min-w-[8rem] text-xs"
    />
    {busy && <span role="status" className="text-xs text-slate-400">Guardando estado…</span>}
    {error && <span role="alert" className="text-xs text-rose-200">{error}</span>}
  </div>
}

function OrderCardActions({ order, onStatusChange, onOpenCompletion, onDelete, className = '' }: { order: WholesaleOrder; onStatusChange: (status: WholesaleOrderState) => Promise<void>; onOpenCompletion: () => void; onDelete: () => void; className?: string }) {
  return <div data-testid="wholesale-order-actions" className={`flex min-w-0 flex-wrap items-start justify-end gap-2 ${className}`}>
    <InlineOrderStatusSelector order={order} onStatusChange={onStatusChange} onOpenCompletion={onOpenCompletion} />
    <ResponsiveActionButton label="Eliminar lógicamente" icon="trash" onClick={onDelete} className="shrink-0" />
  </div>
}

function AdminOrderCard({ order, focused, onStatusChange, onCompleted, onDeleted }: { order: WholesaleOrder; focused: boolean; onStatusChange: (status: WholesaleOrderState) => Promise<void>; onCompleted: (order: WholesaleOrder) => Promise<void>; onDeleted: (order: WholesaleOrder) => Promise<void> }) {
  const [completionOpen, setCompletionOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [ticketViewerOpen, setTicketViewerOpen] = useState(false)
  const itemCount = order.items.reduce((count, item) => count + item.quantity, 0)
  const paymentLabel = order.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'

  return <>
    <article data-testid="wholesale-admin-order-card" data-order-id={order.id} data-focused={focused ? 'true' : undefined} tabIndex={-1} className={`ops-panel-frame rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition-shadow sm:p-5 ${focused ? 'ring-2 ring-amber-400/70 ring-offset-2 ring-offset-slate-950' : ''}`}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400"><span>{formatWholesaleDate(order.createdAt)}</span><span className={order.paymentMethod === 'cash' ? 'font-semibold text-emerald-300' : 'font-semibold text-sky-300'}>{paymentLabel}</span>{order.transferTicket && <CatalogImageTile src={order.transferTicket.url} alt="Comprobante de transferencia" role="button" tabIndex={0} aria-label="Ver comprobante de transferencia" title="Ver comprobante de transferencia" onClick={() => setTicketViewerOpen(true)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setTicketViewerOpen(true) } }} imageClassName="object-contain" className="h-7 w-7 shrink-0 cursor-pointer rounded-md border-slate-700 bg-slate-950 ops-focus" />}</div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <h2 className="min-w-0 truncate font-bold text-white" title={order.customerName}>{order.customerName}</h2>
              <p className="shrink-0 text-lg font-black text-amber-300">{formatWholesaleMoney(order.totalMxn)}</p>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <a href={getWholesaleWhatsAppUrl(order.customerMobile)} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp de ${order.customerName}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-300 underline decoration-emerald-500/50 underline-offset-2 ops-focus">{order.customerMobile}</a>
              {order.customerEmail && <a href={`mailto:${order.customerEmail}`} className="max-w-full break-all text-sm text-slate-400 underline decoration-slate-600 underline-offset-2 ops-focus" title={order.customerEmail}>{order.customerEmail}</a>}
              <OrderCardActions order={order} onStatusChange={onStatusChange} onOpenCompletion={() => setCompletionOpen(true)} onDelete={() => setDeleteOpen(true)} className="order-4 ml-auto" />
            </div>
          </div>
        </div>

        <details className="group border-t border-slate-800 pt-3">
          <summary className="ops-focus flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl py-1 text-left marker:hidden">
            <span className="text-sm font-bold uppercase tracking-[0.12em] text-slate-300">Artículos del pedido</span>
            <span className="shrink-0 text-xs font-semibold text-slate-500">{itemCount} {itemCount === 1 ? 'artículo' : 'artículos'} <span aria-hidden="true" className="ml-1 text-slate-300 group-open:hidden">▾</span><span aria-hidden="true" className="ml-1 hidden text-slate-300 group-open:inline">▴</span></span>
          </summary>
          <ul className="mt-2 grid gap-2 text-sm text-slate-300">
            {order.items.map((item) => <li key={item.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-950/60 px-3 py-2"><span>{item.quantity} × {item.lineKind === 'category' ? `Categoría: ${item.categoryName ?? item.productName}` : item.productName}</span><span className="shrink-0 font-bold text-white">{formatWholesaleMoney(item.lineTotalMxn)}</span></li>)}
          </ul>
        </details>
      </div>
    </article>
    {completionOpen && <OrderCompletionModal key={order.updatedAt} order={order} onClose={() => setCompletionOpen(false)} onCompleted={onCompleted} />}
    {deleteOpen && <DeleteOrderModal key={order.id} order={order} onClose={() => setDeleteOpen(false)} onDeleted={onDeleted} />}
    {ticketViewerOpen && order.transferTicket && <Modal title="Comprobante de transferencia" description={`Pedido ${order.id.slice(0, 8)} · ${order.customerName}`} closeLabel="Cerrar comprobante" onClose={() => setTicketViewerOpen(false)} maxWidthClassName="max-w-3xl" bodyClassName="bg-slate-950">
      <div className="flex min-h-[16rem] items-center justify-center p-4 sm:min-h-[24rem] sm:p-6"><img src={order.transferTicket.url} alt="Comprobante de transferencia" className="max-h-[70vh] max-w-full object-contain" /></div>
    </Modal>}
  </>
}

export function WholesaleAdminWorkspace({ focusOrderId = null }: { focusOrderId?: string | null } = {}) {
  const persistence = useAdminSessionPersistence()
  const sessionModule = 'wholesale-admin'
  const [restoredSession] = useState<WholesaleAdminSessionState>(() => persistence?.read(sessionModule, isWholesaleAdminSessionState) ?? { filter: 'pending', query: '', activeTab: 'management', adminInfoOpen: false, composer: emptyComposerSession() })
  const [orders, setOrders] = useState<WholesaleOrder[]>([])
  const [customers, setCustomers] = useState<WholesaleCustomer[]>([])
  const [catalog, setCatalog] = useState<WholesaleCatalogProduct[]>([])
  const [filter, setFilter] = useState<'all' | WholesaleOrderState>(restoredSession.filter)
  const [query, setQuery] = useState(restoredSession.query)
  const [activeTab, setActiveTab] = useState<WholesaleAdminTab>(restoredSession.activeTab)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [adminInfoOpen, setAdminInfoOpen] = useState(restoredSession.adminInfoOpen)
  const [composerSession, setComposerSession] = useState<WholesaleAdminComposerSession>(restoredSession.composer)
  const handledFocusOrderIdRef = useRef<string | null>(null)

  useEffect(() => {
    persistence?.write(sessionModule, { filter, query, activeTab, adminInfoOpen, composer: composerSession })
  }, [activeTab, adminInfoOpen, composerSession, filter, persistence, query, sessionModule])

  const refresh = useCallback(async () => {
    const [nextOrders, nextCustomers, nextCatalog] = await Promise.all([listWholesaleOrders(false), listWholesaleCustomers(), listPublicWholesaleCatalog()])
    setOrders(await refreshAdminOrderTransferTickets(nextOrders))
    setCustomers(nextCustomers)
    setCatalog(nextCatalog)
  }, [])

  useEffect(() => {
    let mounted = true
    queueMicrotask(() => { void refresh().catch((loadError) => { if (mounted) setError(errorMessage(loadError)) }).finally(() => { if (mounted) setLoading(false) }) })
    let stop: (() => void) | undefined
    void subscribeToWholesaleOrderEvents((message) => {
      if (!mounted) return
      setNotice(message.status ? `Pedido actualizado: ${WHOLESALE_STATUS_LABELS[message.status as WholesaleOrderState] ?? message.status}.` : 'Hay una actualización nueva en Mayoristas.')
      void refresh().catch((refreshError) => { if (mounted) setError(errorMessage(refreshError)) })
    }).then((cleanup) => { stop = cleanup }).catch(() => { /* realtime is additive; list remains usable */ })
    return () => { mounted = false; stop?.() }
  }, [refresh])

  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-MX')
    return orders.filter((order) => (filter === 'all' || order.status === filter) && (normalizedQuery === '' || `${order.id} ${order.customerName} ${order.customerMobile}`.toLocaleLowerCase('es-MX').includes(normalizedQuery)))
  }, [filter, orders, query])
  const statusCounts = useMemo(() => {
    const counts: Record<WholesaleOrderState, number> = { pending: 0, processing: 0, completed: 0, cancelled: 0 }
    orders.forEach((order) => { counts[order.status] += 1 })
    return counts
  }, [orders])

  useEffect(() => {
    if (!focusOrderId) {
      handledFocusOrderIdRef.current = null
      return
    }
    if (handledFocusOrderIdRef.current === focusOrderId || loading) return
    if (activeTab !== 'management') queueMicrotask(() => setActiveTab('management'))
    const focusedOrder = orders.find((order) => order.id === focusOrderId)
    if (!focusedOrder) return
    if (!visibleOrders.some((order) => order.id === focusOrderId)) {
      const revealTimeoutId = window.setTimeout(() => {
        setFilter('all')
        setQuery('')
      }, 0)
      return () => window.clearTimeout(revealTimeoutId)
    }
    handledFocusOrderIdRef.current = focusOrderId
    const timeoutId = window.setTimeout(() => {
      const card = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="wholesale-admin-order-card"]')).find((candidate) => candidate.dataset.orderId === focusOrderId)
      if (!card) return
      card.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      card.focus({ preventScroll: true })
    }, 0)
    if (!focusedOrder.adminSeenAt) {
      void markWholesaleOrderSeen({ requestId: createWholesaleRequestId(), orderId: focusedOrder.id }).then((seen) => {
        return refreshAdminOrderTransferTicket(seen)
      }).then((seen) => {
        setOrders((current) => current.map((candidate) => candidate.id === seen.id ? seen : candidate))
      }).catch((seenError) => setError(errorMessage(seenError)))
    }
    return () => window.clearTimeout(timeoutId)
  }, [activeTab, focusOrderId, loading, orders, visibleOrders])

  async function changeListStatus(order: WholesaleOrder, status: WholesaleOrderState) {
    setError('')
    try {
      const changed = await setWholesaleOrderStatus({ requestId: createWholesaleRequestId(), orderId: order.id, status, reason: 'Cambio de estado desde la lista de pedidos' })
      const finalOrder = changed.adminSeenAt
        ? changed
        : await markWholesaleOrderSeen({ requestId: createWholesaleRequestId(), orderId: changed.id })
      const refreshedOrder = await refreshAdminOrderTransferTicket(finalOrder)
      setOrders((current) => current.map((candidate) => candidate.id === refreshedOrder.id ? refreshedOrder : candidate))
      setNotice(`Estado actualizado a ${WHOLESALE_STATUS_LABELS[refreshedOrder.status]}.`)
    } catch (statusError) {
      setError(errorMessage(statusError))
      throw statusError
    }
  }

  async function completeOrder(order: WholesaleOrder) {
    const refreshedOrder = await refreshAdminOrderTransferTicket(order)
    setOrders((current) => current.map((candidate) => candidate.id === refreshedOrder.id ? refreshedOrder : candidate))
  }

  async function deleteOrder(order: WholesaleOrder) {
    setOrders((current) => current.filter((candidate) => candidate.id !== order.id))
    setNotice('Pedido eliminado lógicamente.')
  }

  async function addOrder(order: WholesaleOrder) {
    const refreshedOrder = await refreshAdminOrderTransferTicket(order)
    setOrders((current) => [refreshedOrder, ...current])
    setNotice('Pedido creado correctamente y registrado como Pendiente.')
    setActiveTab('management')
  }

  if (loading) return <section className="ops-workspace-frame flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center"><p role="status" className="ops-state ops-state-loading">Cargando Mayoristas…</p></section>

  return <section aria-label="Módulo Mayoristas" className="ops-workspace-frame flex min-h-0 min-w-0 w-full flex-1 flex-col gap-4 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-3 text-slate-100 shadow-2xl sm:p-5 lg:p-6">
    <div className="ops-module-header flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 pb-3"><div role="tablist" aria-label="Secciones de Mayoristas" className="flex flex-wrap gap-2"><button type="button" role="tab" aria-selected={activeTab === 'management'} onClick={() => setActiveTab('management')} className={`ops-tab ops-focus ${activeTab === 'management' ? 'border-amber-400 bg-amber-500/15 text-white' : 'border-slate-700 text-slate-300'}`}>Gestionar pedidos</button><button type="button" role="tab" aria-selected={activeTab === 'create'} onClick={() => setActiveTab('create')} className={`ops-tab ops-focus ${activeTab === 'create' ? 'border-amber-400 bg-amber-500/15 text-white' : 'border-slate-700 text-slate-300'}`}>Crear pedido</button></div><InfoButton id="wholesale-admin-info" label="Información de Mayoristas" open={adminInfoOpen} onToggle={() => setAdminInfoOpen((current) => !current)}>Pedidos, clientes y confirmaciones sin inventario ni logística.</InfoButton></div>
    {notice && <div role="status" className="ops-state ops-state-notice shrink-0 rounded-2xl border border-sky-500/30 bg-sky-950/30 px-4 py-3 text-sm text-sky-100">{notice}</div>}
    {error && <div role="alert" className="ops-state ops-state-error shrink-0 rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}
    {activeTab === 'management' ? <>
     <div className="ops-panel-frame grid shrink-0 gap-3 rounded-3xl border border-slate-800 bg-slate-950 p-3 sm:grid-cols-[1fr_auto] sm:p-4"><SearchInput value={query} onChange={setQuery} label="Buscar pedidos mayoristas" placeholder="Buscar por cliente, celular o folio" /><div className="flex flex-wrap gap-2">{([...WHOLESALE_ORDER_STATES, 'all'] as const).map((status) => <button key={status} type="button" aria-label={`${status === 'all' ? 'Todos' : WHOLESALE_STATUS_LABELS[status]}: ${status === 'all' ? orders.length : statusCounts[status]} ${((status === 'all' ? orders.length : statusCounts[status]) === 1) ? 'pedido' : 'pedidos'}`} aria-pressed={filter === status} onClick={() => setFilter(status)} className={`ops-choice ops-focus relative pr-10 text-xs font-bold ${filter === status ? 'border-amber-400 bg-amber-500/15 text-white' : 'border-slate-700 text-slate-300'}`}><span>{status === 'all' ? 'Todos' : WHOLESALE_STATUS_LABELS[status]}</span><span className="absolute right-1 top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-slate-700 bg-slate-950 px-1 text-[10px] font-black leading-none text-slate-300">{status === 'all' ? orders.length : statusCounts[status]}</span></button>)}</div></div>
     <div className="ops-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"><div className="grid gap-3">{visibleOrders.map((order) => <AdminOrderCard key={order.id} order={order} focused={focusOrderId === order.id} onStatusChange={(status) => changeListStatus(order, status)} onCompleted={completeOrder} onDeleted={deleteOrder} />)}{visibleOrders.length === 0 && <p role="status" className="ops-state ops-state-filtered-empty rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">No hay pedidos para este filtro.</p>}</div></div>
      </> : <AdminOrderComposer customers={customers} catalog={catalog} restored={composerSession} onStateChange={setComposerSession} onCreated={addOrder} />}
   </section>
}
