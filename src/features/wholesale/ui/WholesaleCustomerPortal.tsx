import { type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { InfoButton } from '../../../app/components/InfoButton'
import { MobileBottomActionBar } from '../../../app/components/MobileBottomActionBar'
import { LogoutConfirmationModal } from '../../../app/components/LogoutConfirmationModal'
import { Modal } from '../../../app/components/Modal'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { ThemeToggle } from '../../../app/components/ThemeToggle'
import { SearchInput } from '../../../app/components/SearchInput'
import { Icon } from '../../../app/components/icons'
import { clearWholesaleCustomerSession, loadWholesaleCustomerSession, saveWholesaleCustomerSession } from '../api/customerSession'
import { listPublicWholesaleCatalog, type WholesaleCatalogProduct } from '../api/catalog'
import { loginWholesaleCustomer, logoutWholesaleCustomer } from '../api/customerAuth'
import { cancelWholesaleCustomerOrder, createWholesaleCustomerOrder, deleteWholesaleCustomerOrder, listWholesaleCustomerOrders, reorderWholesaleCustomerOrder, updateWholesaleCustomerOrder } from '../api/orders'
import { cleanupWholesaleTransferTickets, refreshWholesaleTransferTicketUrl, removeWholesaleTransferTicket, uploadWholesaleTransferTicket } from '../api/transferTickets'
import { subscribeToWholesaleOrderEvents, type WholesaleOrderRealtimeMessage } from '../api/realtime'
import type { WholesaleCustomerSession, WholesaleOrder, WholesaleOrderState } from '../api/types'
import { WHOLESALE_PAYMENT_METHODS } from '../api/validators'
import { createEmptyWholesaleDraft, createWholesaleRequestId, draftFromWholesaleOrder, formatWholesaleDate, formatWholesaleMoney, getWholesaleCatalogPrice, getWholesaleCategoryPrices, getWholesaleCategoryUnitPrice, getWholesaleDraftAction, getWholesaleDraftCategoryQuantity, getWholesaleDraftTotal, wholesaleCategoryKey, toWholesaleOrderItems, type WholesaleDraft, WHOLESALE_STATUS_LABELS } from './wholesaleUiUtils'

const ALL_CATEGORIES = 'Todas'
const WHOLESALE_DRAFT_STORAGE_PREFIX = 'paletixa:wholesale-draft:'
const CUSTOMER_NOTIFICATION_SUPPRESSION_MS = 10000

type CustomerOrderAction = 'cancel' | 'delete'
type CustomerOrderNotification = { id: string; orderId: string; status: WholesaleOrderState; createdAt: string }
type MoneyFormatter = (value: number) => string

function getWholesaleDraftStorageKey(customerId: string) {
  return `${WHOLESALE_DRAFT_STORAGE_PREFIX}${customerId}`
}

function isWholesaleDraftLineKey(key: string) {
  return key.trim() !== '' && (!key.startsWith('category:') || key.slice('category:'.length).trim() !== '')
}

function readWholesaleDraftItems(storageKey: string): Record<string, number> {
  try {
    if (typeof window === 'undefined') return {}
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.some(([key, quantity]) => !isWholesaleDraftLineKey(key) || typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1)) return {}
    return Object.fromEntries(entries) as Record<string, number>
  } catch {
    return {}
  }
}

function removeWholesaleDraftItems(storageKey: string) {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(storageKey)
  } catch {
    // Local storage can be unavailable in privacy-restricted browsers.
  }
}

function persistWholesaleDraftItems(storageKey: string, items: Record<string, number>) {
  try {
    if (typeof window === 'undefined') return
    if (Object.keys(items).length === 0) {
      removeWholesaleDraftItems(storageKey)
      return
    }
    window.localStorage.setItem(storageKey, JSON.stringify(items))
  } catch {
    // Local storage is an enhancement and must never block checkout.
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.'
}

async function refreshCustomerOrderTransferTickets(sessionToken: string, orders: WholesaleOrder[]) {
  return Promise.all(orders.map(async (order) => {
    if (!order.transferTicket) return order
    try {
      const transferTicket = await refreshWholesaleTransferTicketUrl(sessionToken, order.transferTicket.key)
      if (!transferTicket?.url || !transferTicket.key) return order
      return { ...order, transferTicket }
    } catch {
      return order
    }
  }))
}

function activateCatalogCard(event: KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}

export type PortalTab = 'catalog' | 'orders'

function PortalTabs({ activeTab, onChange }: { activeTab: PortalTab; onChange: (tab: PortalTab) => void }) {
  const tabs: Array<{ key: PortalTab; label: string; icon: 'catalog' | 'sale' }> = [{ key: 'catalog', label: 'Catálogo', icon: 'catalog' }, { key: 'orders', label: 'Mis pedidos', icon: 'sale' }]
  return <div role="tablist" aria-label="Secciones del portal" className="flex shrink-0 items-center gap-2">
    {tabs.map((tab) => <ResponsiveActionButton key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} label={tab.label} icon={tab.icon} showLabel onClick={() => onChange(tab.key)} className="ops-tab shrink-0" />)}
  </div>
}

function CustomerLogin({ onLogin }: { onLogin: (session: WholesaleCustomerSession) => void }) {
  const [mobile, setMobile] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await loginWholesaleCustomer({ requestId: createWholesaleRequestId(), mobile, pin })
      if (!result.authenticated) {
        setError(result.contactAdmin ? 'El PIN no pudo validarse. Comunícate con la administración para recuperar el acceso.' : 'El celular o PIN no son correctos.')
        return
      }
      saveWholesaleCustomerSession(result)
      onLogin(result)
    } catch (loginError) {
      setError(errorMessage(loginError))
    } finally {
      setBusy(false)
    }
  }

  return <main className="flex h-dvh min-h-0 min-w-0 items-center justify-center overflow-y-auto overscroll-contain bg-slate-950 px-4 py-8 text-slate-100">
    <section aria-label="Acceso de clientes mayoristas" className="ops-panel-frame w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-400">Paletixa Mayoristas</p>
      <h1 className="mt-3 text-2xl font-black tracking-tight text-white">Portal de clientes</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">Ingresa con el celular registrado y tu PIN de 4 dígitos. Este acceso es independiente del espacio administrativo.</p>
      <form aria-label="Acceso de clientes mayoristas" className="mt-7 grid gap-4" onSubmit={submit}>
        {error && <div role="alert" className="ops-state ops-state-error rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}
        <label className="ops-field-label">Celular<input value={mobile} onChange={(event) => setMobile(event.target.value)} inputMode="tel" autoComplete="tel" className="ops-control ops-focus px-3" placeholder="55 1234 5678" /></label>
        <label className="ops-field-label">PIN de 4 dígitos<input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" maxLength={4} className="ops-control ops-focus px-3 tracking-[0.3em]" /></label>
        <ResponsiveActionButton type="submit" label={busy ? 'Verificando…' : 'Ingresar'} icon="login" loading={busy} loadingLabel="Verificando…" />
      </form>
    </section>
  </main>
}

export function DraftCatalog({ draft, catalog, portalTab = 'catalog', onChange, onPortalTabChange, showPortalTabs = true, formatMoney = formatWholesaleMoney }: { draft: WholesaleDraft; catalog: WholesaleCatalogProduct[]; portalTab?: PortalTab; onChange: (items: Record<string, number>) => void; onPortalTabChange?: (tab: PortalTab) => void; showPortalTabs?: boolean; formatMoney?: MoneyFormatter }) {
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES)
  const [viewMode, setViewMode] = useState<'products' | 'categories'>(() => draft.reorderFromOrderId ? 'products' : 'categories')
  const [catalogInfoOpen, setCatalogInfoOpen] = useState(false)
  const categoryGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; products: WholesaleCatalogProduct[] }>()
    catalog.forEach((product) => {
      const current = groups.get(product.categoryId)
      if (current) current.products.push(product)
      else groups.set(product.categoryId, { id: product.categoryId, name: product.category, products: [product] })
    })
    return Array.from(groups.values()).sort((left, right) => left.name.localeCompare(right.name, 'es-MX'))
  }, [catalog])
  const categories = useMemo(() => [ALL_CATEGORIES, ...categoryGroups.map((category) => category.name)], [categoryGroups])
  const activeCategory = categories.includes(selectedCategory) ? selectedCategory : ALL_CATEGORIES
  const visibleCatalog = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-MX')
    return catalog.filter((product) => {
      const matchesCategory = activeCategory === ALL_CATEGORIES || product.category === activeCategory
      const searchableText = `${product.name} ${product.sku} ${product.category}`.toLocaleLowerCase('es-MX')
      return matchesCategory && searchableText.includes(normalizedQuery)
    })
  }, [activeCategory, catalog, query])
  const visibleCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-MX')
    return categoryGroups.filter((category) => {
      const searchableText = `${category.name} ${category.products.map((product) => `${product.name} ${product.sku}`).join(' ')}`.toLocaleLowerCase('es-MX')
      return searchableText.includes(normalizedQuery)
    })
  }, [categoryGroups, query])

  function addProduct(productId: string) {
    onChange({ ...draft.items, [productId]: (draft.items[productId] ?? 0) + 1 })
  }

  function addCategory(categoryId: string) {
    const key = wholesaleCategoryKey(categoryId)
    onChange({ ...draft.items, [key]: (draft.items[key] ?? 0) + 1 })
  }

  function clearFilters() {
    setQuery('')
    setSelectedCategory(ALL_CATEGORIES)
  }

  return <section aria-labelledby="wholesale-catalog-title" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
    <div className="ops-module-header flex min-w-0 shrink-0 flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-1 sm:shrink-0">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-400">Catálogo</p>
          <h2 id="wholesale-catalog-title" className="mt-1 text-xl font-black tracking-tight text-white">Arma tu pedido</h2>
        </div>
        <InfoButton id="wholesale-catalog-info" label="Explicar selección de productos" open={catalogInfoOpen} onToggle={() => setCatalogInfoOpen((current) => !current)}>Toca una tarjeta para agregar una unidad. Ajusta la cantidad exacta desde el carrito.</InfoButton>
      </div>
      <div className="flex min-w-0 flex-1 items-stretch gap-2">
        <SearchInput value={query} onChange={setQuery} label="Buscar productos" placeholder="Buscar producto, SKU o categoría" containerClassName="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center justify-end gap-1">
          <div role="tablist" aria-label="Vista de catálogo" className="flex shrink-0 items-center gap-1">
            <ResponsiveActionButton type="button" role="tab" aria-selected={viewMode === 'products'} label="Vista por producto" icon="catalog" iconOnly className="ops-tab" onClick={() => setViewMode('products')} />
            <ResponsiveActionButton type="button" role="tab" aria-selected={viewMode === 'categories'} label="Vista por categoría" icon="package" iconOnly className="ops-tab" onClick={() => setViewMode('categories')} />
          </div>
          {showPortalTabs && onPortalTabChange && <PortalTabs activeTab={portalTab} onChange={onPortalTabChange} />}
        </div>
      </div>
    </div>

    {catalog.length > 0 && <div className="grid shrink-0 gap-3">
       {viewMode === 'products' && <div role="tablist" aria-label="Categorías de productos" className="ops-horizontal-scroll flex min-w-0 gap-2 overflow-x-auto pb-1">
         {categories.map((category) => <ResponsiveActionButton key={category} type="button" role="tab" aria-selected={activeCategory === category} label={category} onClick={() => setSelectedCategory(category)} className="ops-tab shrink-0 px-4 text-xs">{category}</ResponsiveActionButton>)}
      </div>}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-300">{viewMode === 'categories' ? 'Categorías disponibles' : 'Productos disponibles'}</h3>
        <span className="shrink-0 text-xs font-semibold text-slate-500">{viewMode === 'categories' ? `${visibleCategories.length} mostradas` : `${visibleCatalog.length} mostrados`}</span>
      </div>
    </div>}

     {catalog.length === 0 ? <p role="status" className="ops-state ops-state-empty rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-300">No hay productos disponibles para armar un pedido.</p> : viewMode === 'categories' && visibleCategories.length === 0 ? <div className="ops-state ops-state-filtered-empty rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center">
      <p className="text-sm font-semibold text-slate-300">No hay categorías que coincidan con esta búsqueda.</p>
      <ResponsiveActionButton type="button" label="Limpiar filtros" icon="close" onClick={clearFilters} className="mt-4" />
     </div> : viewMode === 'categories' ? <div data-testid="wholesale-catalog-scroll" className="ops-scroll-region min-h-0 max-h-[32rem] flex-1 overflow-y-auto overscroll-contain pr-1 lg:min-h-0 lg:flex-1 lg:max-h-none lg:overflow-y-auto lg:overscroll-contain">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {visibleCategories.map((category) => {
          const quantity = getWholesaleDraftCategoryQuantity(draft, catalog, category.id)
          const prices = getWholesaleCategoryPrices(catalog, category.id)
          const unitPrice = getWholesaleCategoryUnitPrice(catalog, category.id, quantity > 0 ? quantity : 1)
          const unavailable = prices.retailPriceMxn === null || unitPrice === null
          const cardDisabled = unavailable
          const categoryLabel = unavailable ? `Categoría ${category.name} sin precio uniforme` : `${quantity > 0 ? 'Agregar otra unidad de' : 'Agregar'} categoría ${category.name} al pedido`
          return <article
            key={category.id}
            data-testid="wholesale-category-card"
            role="button"
            tabIndex={cardDisabled ? -1 : 0}
            aria-disabled={cardDisabled}
            aria-label={categoryLabel}
            title={categoryLabel}
            onClick={() => { if (!cardDisabled) addCategory(category.id) }}
            onKeyDown={(event) => activateCatalogCard(event, () => { if (!cardDisabled) addCategory(category.id) })}
            className="group flex min-w-0 cursor-pointer flex-col rounded-2xl border border-slate-800 bg-slate-900/65 p-2.5 text-left transition-colors hover:border-slate-700 hover:bg-slate-900 focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ops-focus"
          >
            <CatalogImageTile
              src={category.products.find((product) => product.imageUrl)?.imageUrl ?? null}
              alt={`Categoría ${category.name}`}
              fallback={<div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-500"><Icon name="package" className="h-8 w-8" /><span className="text-[10px] font-bold uppercase tracking-wider">Imagen pendiente</span></div>}
              className="aspect-square w-full border-slate-800 bg-slate-950"
            >
              {quantity > 0 && <span className="absolute right-2 top-2 rounded-full border border-sky-400/40 bg-sky-500/20 px-2 py-1 text-[10px] font-black text-white">{quantity} en el carrito</span>}
            </CatalogImageTile>
            <div className="mt-2 min-w-0">
              <h3 className="truncate text-sm font-bold text-white" title={category.name}>{category.name}</h3>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{category.products.length} {category.products.length === 1 ? 'producto' : 'productos'}</p>
              {prices.retailPriceMxn === null ? <p className="mt-2 text-xs font-semibold text-amber-200">Precio requiere revisión</p> : <p className="mt-2 text-xs font-semibold text-slate-300">{quantity > 0 ? 'Precio aplicado' : 'Precio menudeo'} <span className="font-black text-white">{formatMoney(unitPrice ?? prices.retailPriceMxn)}</span></p>}
            </div>
          </article>
        })}
      </div>
      </div> : visibleCatalog.length === 0 ? <div className="ops-state ops-state-filtered-empty rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center">
      <p className="text-sm font-semibold text-slate-300">No hay productos que coincidan con estos filtros.</p>
      <ResponsiveActionButton type="button" label="Limpiar filtros" icon="close" onClick={clearFilters} className="mt-4" />
     </div> : <div data-testid="wholesale-catalog-scroll" className="ops-scroll-region min-h-0 max-h-[32rem] flex-1 overflow-y-auto overscroll-contain pr-1 lg:min-h-0 lg:flex-1 lg:max-h-none lg:overflow-y-auto lg:overscroll-contain">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {visibleCatalog.map((product) => {
          const quantity = draft.items[product.id] ?? 0
          const categoryQuantity = getWholesaleDraftCategoryQuantity(draft, catalog, product.categoryId)
          const hasAppliedQuantity = categoryQuantity > 0
          const unitPrice = hasAppliedQuantity ? getWholesaleCatalogPrice(product, categoryQuantity) : product.retailPriceMxn
          const cardLabel = `${quantity > 0 ? 'Agregar otra unidad de' : 'Agregar'} ${product.name} al pedido`
          return <article
            key={product.id}
            data-testid="wholesale-product-card"
            role="button"
            tabIndex={0}
            aria-label={cardLabel}
            title={cardLabel}
            onClick={() => addProduct(product.id)}
            onKeyDown={(event) => activateCatalogCard(event, () => addProduct(product.id))}
            className="group flex min-w-0 cursor-pointer flex-col rounded-2xl border border-slate-800 bg-slate-900/65 p-2.5 text-left transition-colors hover:border-slate-700 hover:bg-slate-900 focus:outline-none ops-focus"
          >
            <CatalogImageTile src={product.imageUrl} alt={product.name} imageClassName="transition-transform duration-200 group-hover:scale-105" className="aspect-square w-full border-slate-800 bg-slate-950">
              {quantity > 0 && <span className="absolute right-2 top-2 rounded-full border border-sky-400/40 bg-sky-500/20 px-2 py-1 text-[10px] font-black text-white">{quantity} en el carrito</span>}
            </CatalogImageTile>
            <div className="mt-2 min-w-0">
              <h3 className="truncate text-sm font-bold text-white" title={product.name}>{product.name}</h3>
              <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{product.category} · {product.sku}</p>
              <p className="mt-2 text-xs font-semibold text-slate-300">{hasAppliedQuantity ? 'Precio aplicado' : 'Precio menudeo'} <span className="font-black text-white">{formatMoney(unitPrice)}</span></p>
            </div>
          </article>
        })}
      </div>
    </div>}
  </section>
}

function CustomerNotificationBell({ notifications, onSelect }: { notifications: CustomerOrderNotification[]; onSelect: (notification: CustomerOrderNotification) => void }) {
  const [open, setOpen] = useState(false)
  const regionRef = useRef<HTMLDivElement>(null)
  const notificationsId = 'wholesale-customer-notifications'
  const count = notifications.length
  const buttonLabel = count > 0 ? `Notificaciones: ${count} actualizaciones de pedidos` : 'Notificaciones: no hay actualizaciones de pedidos'

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !regionRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return <div ref={regionRef} className="relative shrink-0">
    <ResponsiveActionButton label={buttonLabel} icon="bell" iconOnly onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-controls={notificationsId} aria-haspopup="dialog" className="ops-navbar-action" />
    {count > 0 && <span aria-hidden="true" className="pointer-events-none absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-slate-950 bg-rose-500 px-1 text-[10px] font-black text-white">{count > 99 ? '99+' : count}</span>}
    {open && <div id={notificationsId} role="dialog" aria-label="Notificaciones de pedidos" className="absolute right-0 top-14 z-[70] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-left shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3"><div><p className="text-sm font-bold text-white">Notificaciones</p><p className="mt-1 text-xs text-slate-400">Actualizaciones de tus pedidos</p></div><span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-slate-300">{count}</span></div>
      {notifications.length === 0 ? <p role="status" className="px-4 py-6 text-sm text-slate-400">No hay notificaciones nuevas.</p> : <div className="max-h-[min(28rem,calc(100dvh-6rem))] overflow-y-auto p-2"><ul className="grid gap-1">{notifications.map((notification) => <li key={notification.id}><button type="button" className="ops-focus grid min-h-11 w-full gap-1 rounded-xl px-3 py-2 text-left hover:bg-slate-800" onClick={() => { setOpen(false); onSelect(notification) }}><span className="text-sm font-bold text-white">La administración actualizó el estado del pedido</span><span className="text-xs text-slate-300">Ahora está: {WHOLESALE_STATUS_LABELS[notification.status]}</span><span className="text-[11px] text-slate-500">{formatWholesaleDate(notification.createdAt)}</span></button></li>)}</ul></div>}
    </div>}
  </div>
}

function CustomerOrderCard({ sessionToken, order, focused, onReorder, onEdit, onRefresh, onMutationStart }: { sessionToken: string; order: WholesaleOrder; focused: boolean; onReorder: (order: WholesaleOrder) => void; onEdit: (order: WholesaleOrder) => void; onRefresh: () => Promise<void>; onMutationStart: (orderId: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [action, setAction] = useState<CustomerOrderAction | null>(null)
  const [ticketViewerOpen, setTicketViewerOpen] = useState(false)
  const pendingActionsAvailable = order.status === 'pending' && !order.deletedAt
  const paymentLabel = order.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'
  const itemCount = order.items.reduce((count, item) => count + item.quantity, 0)

  async function mutate() {
    if (!action || !pendingActionsAvailable) {
      setAction(null)
      return
    }
    const actionToRun = action
    setBusy(true)
    setError('')
    onMutationStart(order.id)
    try {
      const input = { requestId: createWholesaleRequestId(), orderId: order.id, reason: actionToRun === 'cancel' ? 'Cancelado por el cliente' : 'Eliminado por el cliente' }
      if (actionToRun === 'cancel') await cancelWholesaleCustomerOrder(sessionToken, input)
      else await deleteWholesaleCustomerOrder(sessionToken, input)
      await onRefresh()
      setAction(null)
    } catch (mutationError) {
      setError(errorMessage(mutationError))
    } finally {
      setBusy(false)
    }
  }

  return <>
    <article data-testid="wholesale-customer-order-card" data-order-id={order.id} data-focused={focused ? 'true' : undefined} tabIndex={-1} className={`ops-panel-frame rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition-shadow sm:p-5 ${focused ? 'ring-2 ring-amber-400/70 ring-offset-2 ring-offset-slate-950' : ''}`}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400"><span>{formatWholesaleDate(order.createdAt)}</span><span className={order.paymentMethod === 'cash' ? 'font-semibold text-emerald-300' : 'font-semibold text-sky-300'}>{paymentLabel}</span>{order.transferTicket && <CatalogImageTile src={order.transferTicket.url} alt="Comprobante de transferencia" role="button" tabIndex={0} aria-label="Ver comprobante de transferencia" title="Ver comprobante de transferencia" onClick={() => setTicketViewerOpen(true)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setTicketViewerOpen(true) } }} imageClassName="object-contain" className="h-7 w-7 shrink-0 cursor-pointer rounded-md border-slate-700 bg-slate-950 ops-focus" />}</div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-start justify-between gap-3"><h2 className="min-w-0 truncate font-bold text-white">{WHOLESALE_STATUS_LABELS[order.status]}</h2><p className="shrink-0 text-lg font-black text-amber-300">{formatWholesaleMoney(order.totalMxn)}</p></div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"><p className="text-sm text-slate-400">Estado de tu pedido</p><div data-testid="wholesale-customer-order-actions" className="order-4 ml-auto flex min-w-0 flex-wrap items-start justify-end gap-2"><ResponsiveActionButton label="Repetir pedido" icon="refresh" onClick={() => onReorder(order)} />{pendingActionsAvailable && <><ResponsiveActionButton label="Editar pedido" icon="edit" onClick={() => onEdit(order)} /><ResponsiveActionButton label="Cancelar" icon="close" disabled={busy} onClick={() => { setError(''); setAction('cancel') }} /><ResponsiveActionButton label="Eliminar" icon="trash" disabled={busy} onClick={() => { setError(''); setAction('delete') }} /></>}</div></div>
          </div>
        </div>

        <details className="group border-t border-slate-800 pt-3"><summary className="ops-focus flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl py-1 text-left marker:hidden"><span className="text-sm font-bold uppercase tracking-[0.12em] text-slate-300">Artículos del pedido</span><span className="shrink-0 text-xs font-semibold text-slate-500">{itemCount} {itemCount === 1 ? 'artículo' : 'artículos'} <span aria-hidden="true" className="ml-1 text-slate-300 group-open:hidden">▾</span><span aria-hidden="true" className="ml-1 hidden text-slate-300 group-open:inline">▴</span></span></summary><ul className="mt-2 grid gap-2 text-sm text-slate-300">{order.items.map((item) => <li key={item.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-950/60 px-3 py-2"><span>{item.quantity} × {item.lineKind === 'category' ? `Categoría: ${item.categoryName ?? item.productName}` : item.productName}</span><span className="shrink-0 font-bold text-white">{formatWholesaleMoney(item.lineTotalMxn)}</span></li>)}</ul></details>
      </div>
    </article>
    {action && <Modal
      title={action === 'cancel' ? '¿Cancelar este pedido?' : '¿Eliminar este pedido?'}
      description={action === 'cancel' ? 'El pedido pendiente quedará cancelado.' : 'El pedido pendiente se eliminará de tu historial.'}
      closeLabel={action === 'cancel' ? 'Cerrar cancelación' : 'Cerrar eliminación'}
      onClose={() => setAction(null)}
      busy={busy}
      closeDisabled={busy}
      maxWidthClassName="max-w-md"
      headerActions={<ResponsiveActionButton type="button" label={action === 'cancel' ? 'Confirmar cancelación' : 'Confirmar eliminación'} icon={action === 'cancel' ? 'close' : 'trash'} showLabel loading={busy} loadingLabel={action === 'cancel' ? 'Cancelando…' : 'Eliminando…'} onClick={() => void mutate()} className={action === 'cancel' ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-rose-600 text-white hover:bg-rose-500'} />}
    >
      <div className="grid gap-4 p-4 sm:p-6">
        <p className="text-sm leading-relaxed text-slate-300">{action === 'cancel' ? 'Esta acción cambiará el estado del pedido y ya no podrá procesarse.' : 'Esta acción ocultará el pedido de tu historial. Confirma solo si deseas continuar.'}</p>
        {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">{error}</p>}
        <div className="flex justify-end border-t border-slate-800 pt-4"><ResponsiveActionButton type="button" label="No, volver" icon="chevron-left" showLabel disabled={busy} onClick={() => setAction(null)} /></div>
      </div>
    </Modal>}
    {ticketViewerOpen && order.transferTicket && <Modal title="Comprobante de transferencia" description="Consulta el comprobante adjunto a este pedido." closeLabel="Cerrar comprobante" onClose={() => setTicketViewerOpen(false)} maxWidthClassName="max-w-3xl" bodyClassName="bg-slate-950"><div className="flex min-h-[16rem] items-center justify-center p-4 sm:min-h-[24rem] sm:p-6"><img src={order.transferTicket.url} alt="Comprobante de transferencia" className="max-h-[70vh] max-w-full object-contain" /></div></Modal>}
  </>
}

type WholesaleTicketReference = {
  url: string
  key: string
  helperText?: string
  onChange: (value: { url: string; key: string }) => void
}

export function CustomerOrderSummary({ draft, catalog, ticketBusy = false, submitBusy = false, mobileReview, onChange, onClear, onPaymentChange, onTicketSelect, onTicketRemove, ticketReference, submitLabel, submitLoadingLabel, variant = 'wholesale', showPaymentPanel = true, beforeSubmit, formatMoney = formatWholesaleMoney }: {
  draft: WholesaleDraft
  catalog: WholesaleCatalogProduct[]
  ticketBusy?: boolean
  submitBusy?: boolean
  mobileReview: boolean
  onChange: (items: Record<string, number>) => void
  onClear: () => Promise<void>
  onPaymentChange: (paymentMethod: WholesaleDraft['paymentMethod']) => Promise<void>
  onTicketSelect?: (event: ChangeEvent<HTMLInputElement>) => void
  onTicketRemove?: () => Promise<void>
  ticketReference?: WholesaleTicketReference
  submitLabel?: string
  submitLoadingLabel?: string
  variant?: 'wholesale' | 'event'
  showPaymentPanel?: boolean
  beforeSubmit?: ReactNode
  formatMoney?: MoneyFormatter
}) {
  const [summaryInfoOpen, setSummaryInfoOpen] = useState(false)
  const [totalInfoOpen, setTotalInfoOpen] = useState(false)
  const ticketInputRef = useRef<HTMLInputElement>(null)
  const draftAction = getWholesaleDraftAction(draft)
  const isEventVariant = variant === 'event'
  const total = getWholesaleDraftTotal(draft, catalog)
  const cartItems = toWholesaleOrderItems(draft.items).map((item) => item.lineKind === 'category'
    ? { ...item, category: catalog.find(({ categoryId }) => categoryId === item.categoryId) ?? null }
    : { ...item, product: catalog.find(({ id }) => id === item.productId) ?? null })
  const itemCount = cartItems.reduce((count, item) => count + item.quantity, 0)

  function changeQuantity(lineKey: string, rawValue: string) {
    if (rawValue.trim() === '') {
      const next = { ...draft.items }
      delete next[lineKey]
      onChange(next)
      return
    }
    const quantity = Number(rawValue)
    if (!Number.isInteger(quantity) || quantity < 1) return
    onChange({ ...draft.items, [lineKey]: quantity })
  }

  function adjustQuantity(lineKey: string, delta: number) {
    const current = draft.items[lineKey] ?? 0
    const nextQuantity = Math.max(0, current + delta)
    changeQuantity(lineKey, nextQuantity === 0 ? '' : String(nextQuantity))
  }

  function openTicketPicker() {
    if (ticketBusy || submitBusy) return
    ticketInputRef.current?.click()
  }

  const selectedLinesClassName = isEventVariant
    ? `flex-none ${cartItems.length > 3 ? 'max-h-[min(28rem,42dvh)] overflow-y-auto overscroll-contain' : 'max-h-none overflow-visible'} divide-y divide-slate-800 pr-1`
    : `min-h-0 max-h-[min(28rem,42dvh)] overflow-y-auto overscroll-contain divide-y divide-slate-800 pr-1 ${mobileReview ? 'flex-1' : ''} lg:min-h-0 lg:flex-1 lg:max-h-none lg:overflow-y-auto lg:overscroll-contain`

    return <aside aria-label={isEventVariant ? 'Resumen de la reserva' : 'Resumen del pedido'} className={`${mobileReview ? `flex min-h-0 flex-1 flex-col ${isEventVariant ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'}` : 'h-fit'} min-w-0 rounded-2xl border border-slate-800 bg-slate-900/85 p-3 shadow-xl sm:p-4 lg:flex lg:h-full lg:min-h-0 lg:flex-1 lg:flex-col ${isEventVariant ? 'lg:overflow-y-auto lg:overscroll-contain' : 'lg:overflow-hidden'} lg:sticky lg:top-6`}>
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-slate-800 pb-3">
         <div className="flex min-w-0 flex-1 items-center gap-1"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-400">{isEventVariant ? 'Reserva' : 'Pedido'}</p><h2 className="mt-1 truncate text-lg font-black text-white">{isEventVariant ? 'Resumen de la reserva' : 'Resumen del carrito'}</h2></div><InfoButton id={`${variant}-summary-info`} label="Explicar el carrito" open={summaryInfoOpen} onToggle={() => setSummaryInfoOpen((current) => !current)}>La solicitud se envía con productos, categorías y cantidades.</InfoButton></div>
          {cartItems.length > 0 && <div className="flex shrink-0 items-center gap-2"><span aria-label={`${itemCount} artículos`} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-950 px-2 text-xs font-black text-slate-200">{itemCount}</span><ResponsiveActionButton type="button" label="Vaciar carrito" icon="close" onClick={() => void onClear()} disabled={ticketBusy || submitBusy} className="shrink-0" /></div>}
      </div>

    {draft.reorderFromOrderId && <div className="mt-3 flex shrink-0 items-start justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100"><p>{draftAction === 'edit' ? 'Estás editando el pedido pendiente. Los cambios se guardarán en el mismo pedido.' : 'Se enviará un pedido nuevo basado en el pedido anterior.'}</p><ResponsiveActionButton type="button" label={draftAction === 'edit' ? 'Cancelar edición' : 'Cancelar repetición'} icon="close" iconOnly onClick={() => void onClear()} disabled={ticketBusy || submitBusy} /></div>}

    {cartItems.length === 0 ? <div className="py-8 text-center"><p className="text-sm font-semibold text-slate-300">El carrito está vacío.</p><p className="mt-2 text-xs leading-relaxed text-slate-500">Selecciona productos del catálogo para iniciar tu solicitud.</p></div> : <ul data-testid={isEventVariant ? 'event-selected-lines' : 'wholesale-selected-lines'} className={selectedLinesClassName}>
       {cartItems.map((item) => {
         const lineKey = item.lineKind === 'category' ? wholesaleCategoryKey(item.categoryId) : item.productId
         const name = item.lineKind === 'category' ? item.category?.category ?? `Categoría ${item.categoryId.slice(0, 8)}` : item.product?.name ?? `Producto ${item.productId.slice(0, 8)}`
         const unitPrice = item.lineKind === 'category'
           ? getWholesaleCategoryUnitPrice(catalog, item.categoryId, getWholesaleDraftCategoryQuantity(draft, catalog, item.categoryId))
           : item.product ? getWholesaleCatalogPrice(item.product, getWholesaleDraftCategoryQuantity(draft, catalog, item.product.categoryId)) : null
         return <li key={lineKey} className="py-4 first:pt-4 last:pb-1">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-white" title={name}>{item.lineKind === 'category' ? `Categoría: ${name}` : name}</h3><p className="mt-1 text-xs text-slate-500">{item.lineKind === 'category' ? 'Línea por categoría' : item.product?.sku ?? 'Producto no disponible'}</p></div><span className="shrink-0 text-sm font-black text-white">{unitPrice === null ? '—' : formatMoney(item.quantity * unitPrice)}</span></div>
           <div className="mt-3 flex flex-wrap items-start gap-3">
             <div role="group" aria-label={`Controles de cantidad de ${name}`} className="flex max-w-full shrink-0 items-center rounded-xl border border-slate-700 bg-slate-950 p-1">
                <ResponsiveActionButton type="button" label={`Disminuir cantidad de ${name}`} icon="minus" iconOnly onClick={() => adjustQuantity(lineKey, -1)} />
                <input aria-label={`Cantidad en carrito de ${name}`} inputMode="numeric" pattern="[0-9]*" value={item.quantity} onChange={(event) => changeQuantity(lineKey, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }} className="ops-control ops-quantity-control mx-1 w-14 text-center" />
                <ResponsiveActionButton type="button" label={`Aumentar cantidad de ${name}`} icon="plus" iconOnly onClick={() => adjustQuantity(lineKey, 1)} />
             </div>
              <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-1"><span className="text-xs font-semibold text-slate-500">{item.quantity} {item.quantity === 1 ? 'unidad' : 'unidades'}</span><ResponsiveActionButton type="button" label={`Quitar ${name} del carrito`} title={`Quitar ${name} del carrito`} icon="trash" iconOnly onClick={() => changeQuantity(lineKey, '')} className="shrink-0" /></div>
           </div>
        </li>
      })}
    </ul>}

     <div className="mt-3 shrink-0 border-t border-slate-800 pt-3">
         <dl className="grid gap-2 text-sm"><div className="flex items-center justify-between gap-3 text-slate-300"><dt>Subtotal</dt><dd className="font-bold text-white">{formatMoney(total)}</dd></div><div className="flex items-center justify-between gap-3 text-base font-black text-white"><dt className="flex items-center gap-1">Total<InfoButton id="wholesale-total-info" label="Explicar cálculo del total" open={totalInfoOpen} onToggle={() => setTotalInfoOpen((current) => !current)}>El total usa el precio mayorista desde el umbral aplicable por producto o categoría.</InfoButton></dt><dd className="text-sky-300">{formatMoney(total)}</dd></div></dl>
       </div>

      {showPaymentPanel && <div data-testid={isEventVariant ? 'event-payment-panel' : 'wholesale-payment-panel'} className="mt-3 shrink-0 border-t border-slate-800 pt-3">
       <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-300">Pago</h3>
         <div role="group" aria-label="Método de pago" className="mt-2 grid grid-cols-2 gap-1.5">{WHOLESALE_PAYMENT_METHODS.map((method) => <button key={method} type="button" aria-pressed={draft.paymentMethod === method} onClick={() => void onPaymentChange(method)} disabled={ticketBusy || submitBusy} className={`ops-choice ops-focus min-h-11 text-sm transition-colors ${draft.paymentMethod === method ? 'border-sky-400 bg-sky-500/15 text-white' : 'border-slate-700 bg-slate-950 text-sky-100 hover:border-slate-500'}`}>{method === 'cash' ? 'Efectivo' : 'Transferencia'}</button>)}</div>
          {draft.paymentMethod === 'transfer' && <div className="mt-3 grid gap-1.5">{ticketReference ? <div className="grid gap-3"><p className="text-xs leading-relaxed text-slate-400">{ticketReference.helperText ?? 'Captura una referencia de comprobante ya autorizada.'}</p><label className="grid gap-1 text-xs text-slate-400">URL del comprobante<input value={ticketReference.url} onChange={(event) => ticketReference.onChange({ url: event.target.value, key: ticketReference.key })} className="ops-control min-h-10 px-3 text-sm text-white" /></label><label className="grid gap-1 text-xs text-slate-400">Clave del comprobante<input value={ticketReference.key} onChange={(event) => ticketReference.onChange({ url: ticketReference.url, key: event.target.value })} className="ops-control min-h-10 px-3 text-sm text-white" /></label></div> : onTicketSelect ? <><input ref={ticketInputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Comprobante (opcional)" onChange={onTicketSelect} disabled={ticketBusy || submitBusy} className="sr-only" /><div className="flex min-w-0 items-center gap-2"><CatalogImageTile src={draft.transferTicket?.url ?? null} alt="Comprobante de transferencia" imageClassName="object-contain" role="button" tabIndex={ticketBusy || submitBusy ? -1 : 0} aria-disabled={ticketBusy || submitBusy} title="Cambiar comprobante" onClick={openTicketPicker} onKeyDown={(event) => activateCatalogCard(event, openTicketPicker)} className="h-16 w-16 shrink-0 cursor-pointer rounded-lg border-slate-700 bg-slate-900 ops-focus aria-disabled:cursor-not-allowed aria-disabled:opacity-60" /><div className="flex min-w-0 flex-wrap items-center gap-2"><ResponsiveActionButton type="button" label="Cambiar comprobante" icon="edit" iconOnly onClick={openTicketPicker} disabled={ticketBusy || submitBusy} />{draft.transferTicket && onTicketRemove && <ResponsiveActionButton type="button" label="Eliminar comprobante" icon="trash" iconOnly onClick={() => void onTicketRemove()} disabled={ticketBusy || submitBusy} />}</div></div>{ticketBusy && <p role="status" className="sr-only">Subiendo comprobante…</p>}</> : <p className="text-xs leading-relaxed text-slate-500">El comprobante se adjunta desde el portal seguro del cliente.</p>}</div>}
     </div>}

       {beforeSubmit && <div className="shrink-0">{beforeSubmit}</div>}
      <div className="shrink-0"><ResponsiveActionButton type="submit" label={submitLabel ?? (draftAction === 'edit' ? 'Guardar cambios del pedido' : draftAction === 'reorder' ? 'Enviar nuevo pedido' : isEventVariant ? 'Enviar solicitud' : 'Enviar pedido')} icon={draftAction === 'edit' ? 'save' : 'send'} showLabel loading={submitBusy} loadingLabel={submitLoadingLabel ?? (draftAction === 'edit' ? 'Guardando cambios…' : 'Enviando…')} className="mt-3 w-full bg-sky-600 text-white hover:bg-sky-500" disabled={ticketBusy || submitBusy || cartItems.length === 0} /></div>
    </aside>
  }

function CustomerPortalHome({ session, onLogout }: { session: WholesaleCustomerSession; onLogout: () => Promise<void> }) {
  const [catalog, setCatalog] = useState<WholesaleCatalogProduct[]>([])
  const [orders, setOrders] = useState<WholesaleOrder[]>([])
  const [notifications, setNotifications] = useState<CustomerOrderNotification[]>([])
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null)
  const draftStorageKey = getWholesaleDraftStorageKey(session.customer.id)
  const [draft, setDraft] = useState<WholesaleDraft>(() => ({ ...createEmptyWholesaleDraft(), items: readWholesaleDraftItems(draftStorageKey) }))
  const [loading, setLoading] = useState(true)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [ticketBusy, setTicketBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [portalTab, setPortalTab] = useState<PortalTab>('catalog')
  const [mobileCheckoutStep, setMobileCheckoutStep] = useState<'catalog' | 'review'>('catalog')
  const [customerInfoOpen, setCustomerInfoOpen] = useState(false)
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false)
  const submissionBusyRef = useRef(false)
  const ordersRegionRef = useRef<HTMLDivElement>(null)
  const ordersSnapshotRef = useRef<WholesaleOrder[] | null>(null)
  const initialOrdersLoadedRef = useRef(false)
  const notificationRefreshRef = useRef(Promise.resolve())
  const notificationKeysRef = useRef(new Set<string>())
  const suppressedSelfMutationsRef = useRef(new Map<string, number>())
  const draftItemCount = toWholesaleOrderItems(draft.items).reduce((count, item) => count + item.quantity, 0)
  const draftTotal = getWholesaleDraftTotal(draft, catalog)

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    setLoadError('')
    const [ordersResult, catalogResult] = await Promise.allSettled([listWholesaleCustomerOrders(session.sessionToken), listPublicWholesaleCatalog()])
    const failures: unknown[] = []
    if (ordersResult.status === 'fulfilled') {
      const refreshedOrders = await refreshCustomerOrderTransferTickets(session.sessionToken, ordersResult.value)
      setOrders(refreshedOrders)
      ordersSnapshotRef.current = refreshedOrders
    }
    else failures.push(ordersResult.reason)
    if (catalogResult.status === 'fulfilled') setCatalog(catalogResult.value)
    else failures.push(catalogResult.reason)
    if (failures.length > 0) {
      const message = failures.map(errorMessage).join(' ')
      setLoadError(message || 'No se pudieron cargar tus datos.')
      if (showLoading) {
        setLoading(false)
        if (ordersResult.status === 'fulfilled') initialOrdersLoadedRef.current = true
      }
      throw failures[0] instanceof Error ? failures[0] : new Error(message || 'No se pudieron cargar tus datos.')
    }
    if (showLoading) {
      setLoading(false)
      initialOrdersLoadedRef.current = true
    }
  }, [session.sessionToken])

  const suppressSelfNotification = useCallback((orderId: string) => {
    suppressedSelfMutationsRef.current.set(orderId, Date.now() + CUSTOMER_NOTIFICATION_SUPPRESSION_MS)
  }, [])

  const handleRealtimeEvent = useCallback((message: WholesaleOrderRealtimeMessage) => {
    if (!initialOrdersLoadedRef.current || message.customer_id !== session.customer.id || !message.order_id || !message.status) return
    const suppressedUntil = suppressedSelfMutationsRef.current.get(message.order_id)
    let suppressNotification = suppressedUntil !== undefined
    if (suppressedUntil !== undefined) {
      suppressedSelfMutationsRef.current.delete(message.order_id)
      if (suppressedUntil < Date.now()) suppressNotification = false
    }
    notificationRefreshRef.current = notificationRefreshRef.current.then(async () => {
      const previousOrders = ordersSnapshotRef.current
      try {
        await refresh()
      } catch {
        return
      }
      const refreshedOrders = ordersSnapshotRef.current
      const previousOrder = previousOrders?.find((order) => order.id === message.order_id)
      const refreshedOrder = refreshedOrders?.find((order) => order.id === message.order_id)
      if (suppressNotification || !previousOrder || !refreshedOrder || previousOrder.status === refreshedOrder.status || Boolean(refreshedOrder.deletedAt) || refreshedOrder.status !== message.status) return
      const notificationId = `${refreshedOrder.id}:${refreshedOrder.status}`
      if (notificationKeysRef.current.has(notificationId)) return
      notificationKeysRef.current.add(notificationId)
      setNotifications((current) => [{ id: notificationId, orderId: refreshedOrder.id, status: refreshedOrder.status, createdAt: message.updated_at ?? refreshedOrder.updatedAt }, ...current])
    }).catch(() => undefined)
  }, [refresh, session.customer.id])

  useEffect(() => {
    let mounted = true
    queueMicrotask(() => { if (mounted) void refresh(true).catch(() => undefined) })
    return () => { mounted = false }
  }, [refresh])

  useEffect(() => {
    let mounted = true
    let stop: (() => void) | undefined
    void subscribeToWholesaleOrderEvents(handleRealtimeEvent).then((cleanup) => {
      if (!mounted) {
        cleanup()
        return
      }
      stop = cleanup
    }).catch(() => {
      // Realtime is additive; the portal and its initial data remain usable when it is unavailable.
    })
    return () => {
      mounted = false
      stop?.()
    }
  }, [handleRealtimeEvent])

  useEffect(() => {
    persistWholesaleDraftItems(draftStorageKey, draft.items)
  }, [draft.items, draftStorageKey])

  useEffect(() => {
    if (portalTab !== 'orders' || !focusedOrderId) return
    const card = Array.from(ordersRegionRef.current?.querySelectorAll<HTMLElement>('[data-order-id]') ?? []).find((candidate) => candidate.dataset.orderId === focusedOrderId)
    if (!card) return
    if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'nearest' })
    card.focus()
  }, [focusedOrderId, orders, portalTab])

  function selectNotification(notification: CustomerOrderNotification) {
    setNotifications((current) => current.filter((candidate) => candidate.id !== notification.id))
    setPortalTab('orders')
    setFocusedOrderId(notification.orderId)
  }

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const items = toWholesaleOrderItems(draft.items)
    if (items.length === 0) { setError('Agrega al menos un producto al pedido.'); return }
    setError('')
    setNotice('')
    setConfirmationOpen(true)
  }

  async function confirmDraft() {
    if (submitBusy || submissionBusyRef.current) return
    const items = toWholesaleOrderItems(draft.items)
    if (items.length === 0) { setError('Agrega al menos un producto al pedido.'); setConfirmationOpen(false); return }
    submissionBusyRef.current = true
    setSubmitBusy(true)
    setError('')
    setNotice('')
    let submissionStarted = false
    try {
      const input = { requestId: createWholesaleRequestId(), items, paymentMethod: draft.paymentMethod, transferTicket: draft.paymentMethod === 'transfer' ? draft.transferTicket : null }
      const draftAction = getWholesaleDraftAction(draft)
      let submittedOrder: WholesaleOrder | null = null
      submissionStarted = true
      if (draftAction === 'edit') {
        if (!draft.reorderFromOrderId) throw new Error('El pedido pendiente ya no está disponible para editarse.')
        submittedOrder = await updateWholesaleCustomerOrder(session.sessionToken, { ...input, orderId: draft.reorderFromOrderId })
      } else if (draftAction === 'reorder') {
        if (!draft.reorderFromOrderId) throw new Error('El pedido anterior ya no está disponible para repetirse.')
        submittedOrder = await reorderWholesaleCustomerOrder(session.sessionToken, { ...input, orderId: draft.reorderFromOrderId })
      } else {
        submittedOrder = await createWholesaleCustomerOrder(session.sessionToken, input)
      }
      await refresh()
      if (draftAction === 'edit') {
        try {
          await cleanupWholesaleTransferTickets(session.sessionToken, submittedOrder?.transferTicket?.key ?? null)
        } catch {
          // Cleanup is best effort after the order has already been updated.
        }
      }
      removeWholesaleDraftItems(draftStorageKey)
      setDraft(createEmptyWholesaleDraft())
      setMobileCheckoutStep('catalog')
      setNotice(draftAction === 'edit' ? 'Cambios guardados en tu pedido.' : draftAction === 'reorder' ? 'Nuevo pedido enviado correctamente.' : 'Pedido enviado correctamente.')
      setConfirmationOpen(false)
    } catch (submitError) {
      const submissionError = errorMessage(submitError)
      if (submissionStarted) {
        try {
          const cleanupResult = await cleanupWholesaleTransferTickets(session.sessionToken)
          const currentTicketKey = draft.transferTicket?.key
          if (currentTicketKey && cleanupResult.removedKeys.includes(currentTicketKey)) {
            setDraft((current) => current.transferTicket?.key === currentTicketKey ? { ...current, transferTicket: null } : current)
          }
        } catch {
          setError(`${submissionError} No se pudo confirmar la limpieza segura del comprobante. El borrador se conservó; inténtalo de nuevo.`)
          setConfirmationOpen(false)
          return
        }
      }
      setError(submissionError)
      setConfirmationOpen(false)
    } finally {
      submissionBusyRef.current = false
      setSubmitBusy(false)
    }
  }

  async function selectTicket(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file || draft.paymentMethod !== 'transfer') return
    setTicketBusy(true)
    setError('')
    try {
      const transferTicket = await uploadWholesaleTransferTicket(session.sessionToken, file)
      const previousTicket = draft.transferTicket
      if (previousTicket && previousTicket.key !== transferTicket.key) {
        try {
          await removeWholesaleTransferTicket(session.sessionToken, previousTicket.key)
        } catch {
          await cleanupWholesaleTransferTickets(session.sessionToken)
        }
      }
      setDraft((current) => ({ ...current, transferTicket }))
    } catch (ticketError) {
      setError(errorMessage(ticketError))
    } finally {
      setTicketBusy(false)
    }
  }

  async function removeDraftTicket() {
    if (!draft.transferTicket) return
    setTicketBusy(true)
    setError('')
    try {
      await removeWholesaleTransferTicket(session.sessionToken, draft.transferTicket.key)
      setDraft((current) => ({ ...current, transferTicket: null }))
    } catch (ticketError) {
      setError(errorMessage(ticketError))
    } finally {
      setTicketBusy(false)
    }
  }

  function loadOrderIntoDraft(order: WholesaleOrder, checkoutStep: 'catalog' | 'review', message: string, draftAction: 'edit' | 'reorder') {
    setDraft(draftFromWholesaleOrder(order, draftAction))
    setPortalTab('catalog')
    setMobileCheckoutStep(checkoutStep)
    setError('')
    setNotice(message)
  }

  function reorder(order: WholesaleOrder) {
    loadOrderIntoDraft(order, 'review', 'Se preparó un pedido nuevo basado en el pedido anterior.', 'reorder')
  }

  function editOrder(order: WholesaleOrder) {
    loadOrderIntoDraft(order, 'catalog', 'Se cargó el pedido pendiente. Los cambios se guardarán en el mismo pedido.', 'edit')
  }

  async function clearDraft() {
    if (draft.transferTicket) {
      setTicketBusy(true)
      setError('')
      try {
        await removeWholesaleTransferTicket(session.sessionToken, draft.transferTicket.key)
      } catch (ticketError) {
        setError(errorMessage(ticketError))
        setTicketBusy(false)
        return
      }
      setTicketBusy(false)
    }
    removeWholesaleDraftItems(draftStorageKey)
    setDraft(createEmptyWholesaleDraft())
    setMobileCheckoutStep('catalog')
    setNotice('')
  }

  async function changePaymentMethod(paymentMethod: WholesaleDraft['paymentMethod']) {
    if (paymentMethod === draft.paymentMethod) return
    if (paymentMethod === 'cash' && draft.transferTicket) {
      setTicketBusy(true)
      setError('')
      try {
        await removeWholesaleTransferTicket(session.sessionToken, draft.transferTicket.key)
      } catch (ticketError) {
        setError(errorMessage(ticketError))
        setTicketBusy(false)
        return
      }
      setTicketBusy(false)
    }
    setDraft((current) => ({ ...current, paymentMethod, transferTicket: paymentMethod === 'transfer' ? current.transferTicket : null }))
  }

  if (loading) return <main className="flex h-dvh min-h-0 min-w-0 items-center justify-center overflow-hidden bg-slate-950 px-4 text-slate-100"><div role="status" className="w-full max-w-md"><p className="text-center text-sm font-semibold text-slate-300">Cargando tu portal…</p><div className="mt-4 grid grid-cols-2 gap-3"><div aria-hidden="true" className="aspect-square animate-pulse rounded-2xl border border-slate-800 bg-slate-900/70" /><div aria-hidden="true" className="aspect-square animate-pulse rounded-2xl border border-slate-800 bg-slate-900/70" /></div></div></main>

  const isMobileReview = portalTab === 'catalog' && mobileCheckoutStep === 'review'
  const isCatalog = portalTab === 'catalog'
  const pageClassName = isMobileReview
       ? 'flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-slate-950 px-2 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-slate-100 sm:px-6 sm:pt-8 sm:pb-8 lg:py-8'
    : isCatalog
       ? 'flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-slate-950 px-2 py-3 pb-[calc(8rem+env(safe-area-inset-bottom))] text-slate-100 sm:px-6 sm:py-8 lg:pb-8'
       : 'flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-slate-950 px-2 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-slate-100 sm:px-6 sm:py-8 lg:pb-8'
  const pageShellClassName = isMobileReview
     ? 'mx-auto flex h-full min-h-0 min-w-0 w-full max-w-[90rem] flex-col gap-4 lg:h-full lg:min-h-0'
    : isCatalog
       ? 'mx-auto flex min-h-0 min-w-0 w-full max-w-[90rem] flex-1 flex-col gap-4'
       : 'mx-auto flex min-h-0 min-w-0 w-full max-w-[90rem] flex-1 flex-col gap-4'

   const draftAction = getWholesaleDraftAction(draft)
   const confirmationTitle = draftAction === 'edit' ? 'Confirmar cambios del pedido' : draftAction === 'reorder' ? 'Confirmar nuevo pedido' : 'Confirmar envío'
   const confirmationDescription = draftAction === 'edit' ? 'Los cambios actualizarán el pedido pendiente existente.' : draftAction === 'reorder' ? 'Se enviará un pedido nuevo y se conservará el pedido anterior.' : 'Revisa los datos antes de enviar tu pedido mayorista.'
   const confirmationActionLabel = draftAction === 'edit' ? 'Confirmar cambios' : 'Confirmar y enviar'
   const confirmationLoadingLabel = draftAction === 'edit' ? 'Guardando cambios…' : 'Enviando…'

   return <main className={pageClassName}><div className={pageShellClassName}>
       <header className="ops-navbar-header ops-module-header flex min-w-0 shrink-0 items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 py-3 pl-3 shadow-xl sm:rounded-3xl sm:py-5 sm:pl-5"><div className="flex min-w-0 flex-1 items-center gap-1"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-400">Paletixa Mayoristas</p><h1 className="mt-1 min-w-0 text-lg font-black tracking-tight text-white sm:text-xl"><span className="block truncate" title={session.customer.name}>{session.customer.name}</span></h1></div><InfoButton id="wholesale-customer-info" label="Información del portal mayorista" open={customerInfoOpen} onToggle={() => setCustomerInfoOpen((current) => !current)} className="ops-navbar-action">Arma tu pedido desde el catálogo y consulta aquí tu historial mayorista.</InfoButton></div><div className="ops-navbar-actions ml-auto flex shrink-0 items-center"><CustomerNotificationBell notifications={notifications} onSelect={selectNotification} /><ThemeToggle className="ops-navbar-action" /><ResponsiveActionButton label="Cerrar sesión" title="Cerrar sesión" icon="power" iconOnly onClick={() => setLogoutConfirmationOpen(true)} className="ops-navbar-action shrink-0" /></div></header>
    {notice && <div role="status" className="shrink-0 rounded-2xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">{notice}</div>}
     {error && <div role="alert" className="ops-state ops-state-error shrink-0 rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{error}</div>}
     {loadError && <div role="alert" tabIndex={-1} className="ops-state ops-state-error shrink-0 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100"><p className="font-semibold">No se pudieron cargar todos los datos del portal.</p><p className="mt-1 text-sm text-rose-200/80">{loadError}</p><ResponsiveActionButton type="button" label="Reintentar carga" icon="refresh" onClick={() => void refresh(true).catch(() => undefined)} className="mt-4" /></div>}
      {portalTab === 'catalog' ? <div className={`${isMobileReview ? 'grid' : 'flex flex-col'} min-h-0 min-w-0 flex-1 items-stretch gap-4 overflow-hidden lg:grid lg:min-h-0 lg:flex-1 lg:items-stretch lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] lg:grid-rows-[minmax(0,1fr)] lg:gap-5`}>
          <div className={`ops-panel-frame min-w-0 rounded-2xl border border-slate-800 bg-slate-950 p-3 shadow-xl sm:p-4 ${mobileCheckoutStep === 'catalog' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'} lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden`}><DraftCatalog draft={draft} catalog={catalog} portalTab={portalTab} onChange={(items) => setDraft((current) => ({ ...current, items }))} onPortalTabChange={setPortalTab} /></div>
        <form noValidate onSubmit={submitDraft} className={`min-w-0 ${mobileCheckoutStep === 'review' ? '' : 'hidden'} lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden ${isMobileReview ? 'flex min-h-0 flex-1 flex-col gap-2 overflow-hidden' : ''}`}>
          <div className="mb-0 flex shrink-0 flex-wrap items-center justify-between gap-2 lg:hidden"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-400">Paso 2 de 2</p><p className="mt-1 text-sm font-semibold text-slate-300">Revisa tu pedido antes de enviarlo.</p></div><ResponsiveActionButton type="button" label="Volver al catálogo" icon="chevron-left" showLabel onClick={() => setMobileCheckoutStep('catalog')} /></div>
          <CustomerOrderSummary draft={draft} catalog={catalog} ticketBusy={ticketBusy} submitBusy={submitBusy} mobileReview={isMobileReview} onChange={(items) => setDraft((current) => ({ ...current, items }))} onClear={clearDraft} onPaymentChange={changePaymentMethod} onTicketSelect={(event) => void selectTicket(event)} onTicketRemove={removeDraftTicket} />
        </form>
       </div> : <section aria-labelledby="wholesale-orders-title" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3"><div><h2 id="wholesale-orders-title" className="text-xl font-black text-white">Mis pedidos</h2><p className="mt-1 text-sm text-slate-400">Los pedidos pendientes se pueden editar, cancelar o eliminar hasta que la administración cambie su estado.</p></div><PortalTabs activeTab={portalTab} onChange={setPortalTab} /></div><div ref={ordersRegionRef} className="ops-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"><div className="grid gap-3">{orders.map((order) => <CustomerOrderCard key={order.id} sessionToken={session.sessionToken} order={order} focused={focusedOrderId === order.id} onReorder={reorder} onEdit={editOrder} onRefresh={refresh} onMutationStart={suppressSelfNotification} />)}{orders.length === 0 && <p role="status" className="ops-state ops-state-empty rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">Todavía no tienes pedidos.</p>}</div></div>
       </section>}
        {portalTab === 'catalog' && mobileCheckoutStep === 'catalog' && <MobileBottomActionBar>
            <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{draftItemCount} {draftItemCount === 1 ? 'artículo' : 'artículos'}</p><p className="mt-1 truncate text-lg font-black text-white">{formatWholesaleMoney(draftTotal)}</p></div></div>
            <ResponsiveActionButton type="button" label="Revisar pedido" icon="chevron-right" showLabel disabled={draftItemCount === 0} onClick={() => setMobileCheckoutStep('review')} className="w-full bg-sky-600 text-white hover:bg-sky-500" />
        </MobileBottomActionBar>}
    </div>
    <LogoutConfirmationModal open={logoutConfirmationOpen} variant="wholesale" onClose={() => setLogoutConfirmationOpen(false)} onConfirm={onLogout} />
    {confirmationOpen && <Modal
       title={confirmationTitle}
       description={confirmationDescription}
       closeLabel="Cerrar confirmación"
       onClose={() => setConfirmationOpen(false)}
       busy={submitBusy}
       closeDisabled={submitBusy}
       maxWidthClassName="max-w-md"
       headerActions={<ResponsiveActionButton type="button" label={confirmationActionLabel} icon={draftAction === 'edit' ? 'save' : 'send'} showLabel loading={submitBusy} loadingLabel={confirmationLoadingLabel} onClick={() => void confirmDraft()} className="bg-sky-600 text-white hover:bg-sky-500" />}
    >
      <div className="grid gap-4 p-4 sm:p-6">
         <p className="text-sm leading-relaxed text-slate-300">{draftAction === 'edit' ? 'Al confirmar, se guardarán estos cambios en el pedido pendiente original.' : draftAction === 'reorder' ? 'Al confirmar, se enviará un pedido nuevo para que la administración lo procese.' : 'Al confirmar, el pedido se enviará para que la administración lo procese.'}</p>
        <dl className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm">
          <div className="flex items-center justify-between gap-3"><dt className="text-slate-400">Artículos</dt><dd className="font-bold text-white">{draftItemCount}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-slate-400">Total</dt><dd className="font-black text-sky-300">{formatWholesaleMoney(draftTotal)}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-slate-400">Método de pago</dt><dd className="font-bold text-white">{draft.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'}</dd></div>
        </dl>
       </div>
    </Modal>}
  </main>
 }

export function WholesaleCustomerPortal() {
  const [session, setSession] = useState<WholesaleCustomerSession | null>(() => loadWholesaleCustomerSession())

  async function logout() {
    if (session) {
      try { await logoutWholesaleCustomer(session.sessionToken, createWholesaleRequestId()) } catch { /* local sign-out still clears the customer boundary */ }
    }
    clearWholesaleCustomerSession()
    setSession(null)
  }

  return session ? <CustomerPortalHome session={session} onLogout={logout} /> : <CustomerLogin onLogin={setSession} />
}
