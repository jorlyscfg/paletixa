import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AppProviders } from './app/AppProviders'
import { AppShell, type AdminNotification } from './app/AppShell'
import { APP_MODULES, type AppModule } from './app/appModules'
import { ResponsiveActionButton } from './app/components/ResponsiveActionButton'
import { isSessionRecord, isSessionString, useAdminSessionPersistence } from './app/sessionPersistence'
import { ThemeToggle } from './app/components/ThemeToggle'
import { ADMIN_LOGIN_PATH, isAdminLoginPath, isEventReservationPortalPath, isPublicLandingPath, isWholesaleCustomerPortalPath } from './app/publicRoutes'
import { AdminBoundary } from './features/auth/ui/AdminBoundary'
import type { AccessContext } from './features/auth/api/adminAccess'
import { BranchWorkspace } from './features/branches/ui/BranchWorkspace'
import { ProductWorkspace } from './features/products/ui/ProductWorkspace'
import { DashboardWorkspace } from './features/sales/ui/SalesReportWorkspace'
import { SalesReportWorkspace } from './features/sales/ui/SalesReportWorkspace'
import { SalesWorkspace } from './features/sales/ui/SalesWorkspace'
import { PosShiftWorkspace, type PosShiftHeaderState } from './features/sales/ui/PosShiftWorkspace'
import { WholesaleAdminWorkspace } from './features/wholesale/ui/WholesaleAdminWorkspace'
import { WholesaleCustomerPortal } from './features/wholesale/ui/WholesaleCustomerPortal'
import { WholesaleCustomersWorkspace } from './features/wholesale/ui/WholesaleCustomersWorkspace'
import { listWholesaleOrders } from './features/wholesale/api/orders'
import { subscribeToWholesaleOrderEvents } from './features/wholesale/api/realtime'
import { EventCustomerPortal } from './features/events/ui/EventCustomerPortal'
import { EventReservationWorkspace } from './features/events/ui/EventReservationWorkspace'
import { listEventReservations } from './features/events/api/reservations'
import { subscribeToEventReservationEvents } from './features/events/api/realtime'
import { ConfigurationWorkspace } from './features/configuration/ui/ConfigurationWorkspace'
import { PublicCatalogLanding } from './features/public/ui/PublicCatalogLanding'

function CashierWorkspace({ context, closeSession }: { context: AccessContext; closeSession: () => Promise<void> }) {
  const branchName = context.branch?.name ?? 'Sucursal asignada'
  const cashierName = context.displayName ?? 'Cajero asignado'
  const [shiftHeaderState, setShiftHeaderState] = useState<PosShiftHeaderState | null>(null)
  const handleShiftHeaderStateChange = useCallback((state: PosShiftHeaderState | null) => {
    setShiftHeaderState(state)
  }, [])
  const showCashierHeader = !context.branch || shiftHeaderState?.status === 'open' || shiftHeaderState?.status === 'reconciled'

  return <main id="main-content" className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-slate-950 text-slate-100">
    {showCashierHeader && <header className="sticky top-0 z-50 shrink-0 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="ops-navbar-header mx-auto flex min-h-16 w-full items-center gap-3 pl-3 sm:pl-6">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-400">Paletixa Operaciones</p>
          <h1 className="mt-1 truncate text-xl font-black tracking-tight text-white sm:text-2xl">Punto de venta</h1>
        </div>
        <div className="ops-navbar-actions ml-auto flex min-w-0 shrink-0 items-center">
          {shiftHeaderState && <div className="ops-navbar-actions flex shrink-0 items-center">
            {shiftHeaderState.onInfoRequest && <ResponsiveActionButton label="Ver control de caja" icon="info" iconOnly onClick={shiftHeaderState.onInfoRequest} className="ops-navbar-action" />}
            {shiftHeaderState.onCloseRequest && <ResponsiveActionButton label="Cerrar y reconciliar turno" icon="close" iconOnly onClick={shiftHeaderState.onCloseRequest} className="ops-navbar-action" />}
            {shiftHeaderState.status === 'open'
              ? <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-200">Abierto</span>
              : shiftHeaderState.status === 'reconciled'
                ? <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11px] font-bold text-white">Reconciliado</span>
                : <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-bold text-amber-100">Apertura requerida</span>}
          </div>}
          <div className="flex min-w-0 max-w-[42vw] flex-col items-end text-right sm:max-w-none">
            <p className="max-w-full truncate text-[11px] font-semibold text-white sm:text-sm">Sucursal: <span className="text-slate-400">{branchName}</span></p>
            <p className="max-w-full truncate text-[11px] font-semibold text-white sm:text-sm">Cajero: <span className="text-slate-400">{cashierName}</span></p>
          </div>
           {shiftHeaderState?.onOpenRequest && <ResponsiveActionButton label="Abrir turno" icon="sale" showLabel onClick={shiftHeaderState.onOpenRequest} className="ops-navbar-action" />}<ThemeToggle className="ops-navbar-action" />
        </div>
      </div>
    </header>}
    <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-[90rem] flex-1 overflow-hidden px-3 py-3 sm:px-6 sm:py-4">
      {context.branch ? <PosShiftWorkspace branchId={context.branch.id} branchName={branchName} cashierName={context.displayName} onHeaderStateChange={handleShiftHeaderStateChange} onShiftClosed={closeSession} onLogout={closeSession} /> : <section role="alert" className="flex min-h-0 min-w-0 flex-1 flex-col items-start gap-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-100"><p>No hay una sucursal activa asignada a este cajero.</p><ResponsiveActionButton type="button" label="Cerrar sesión" icon="power" showLabel onClick={() => void closeSession()} /></section>}
    </div>
  </main>
}

const moduleCapabilities: Partial<Record<AppModule, string>> = { reports: 'reports.view', configuration: 'configuration.manage' }

type AppSessionState = { activeModule: AppModule; focusedOrderId: string | null; focusedReservationId: string | null }
const appModuleIds = new Set<string>(APP_MODULES.map(({ id }) => id))
function isAppSessionState(value: unknown): value is AppSessionState {
  if (!isSessionRecord(value) || !isSessionString(value.activeModule) || !appModuleIds.has(value.activeModule)) return false
  return (value.focusedOrderId === null || isSessionString(value.focusedOrderId)) && (value.focusedReservationId === null || isSessionString(value.focusedReservationId))
}

function visibleAdminModules(context: AccessContext) {
  return APP_MODULES.filter(({ id }) => {
    const requiredCapability = moduleCapabilities[id]
    return requiredCapability === undefined || context.capabilities.includes(requiredCapability)
  }).map(({ id }) => id)
}

function AdminShell({ context, activeModule, onModuleChange, onLogout, onNotificationSelect, children }: { context: AccessContext; activeModule: AppModule; onModuleChange: (module: AppModule) => void; onLogout: () => Promise<void>; onNotificationSelect?: (notification: AdminNotification) => void; children: ReactNode }) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([])

  const refreshNotifications = useCallback(async () => {
    try {
      const [ordersResult, reservationsResult] = await Promise.allSettled([listWholesaleOrders(false), listEventReservations(false)])
      const orders = ordersResult.status === 'fulfilled' ? ordersResult.value.filter((order) => order.status === 'pending' && order.adminSeenAt === null) : []
      const reservations = reservationsResult.status === 'fulfilled' ? reservationsResult.value.filter((reservation) => reservation.status === 'pending' && reservation.adminSeenAt === null) : []
      return [...orders, ...reservations]
    } catch {
      // Notifications are additive; an unavailable bell must not block the admin shell.
      return null
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const refresh = () => { void refreshNotifications().then((nextNotifications) => { if (mounted && nextNotifications !== null) setNotifications(nextNotifications) }) }
    queueMicrotask(() => { if (mounted) refresh() })
    let stop: (() => void) | undefined
    void Promise.allSettled([
      subscribeToWholesaleOrderEvents(() => { if (mounted) refresh() }),
      subscribeToEventReservationEvents(() => { if (mounted) refresh() }),
    ]).then((results) => {
      const cleanups = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
      stop = () => cleanups.forEach((cleanup) => cleanup())
    })
    return () => { mounted = false; stop?.() }
  }, [refreshNotifications])

  const handleNotificationSelect = useCallback((notification: AdminNotification) => {
    setNotifications((current) => current.filter((candidate) => candidate.id !== notification.id))
    onNotificationSelect?.(notification)
  }, [onNotificationSelect])

  return <AppShell activeModule={activeModule} onModuleChange={onModuleChange} onLogout={onLogout} notifications={notifications} onNotificationSelect={handleNotificationSelect} visibleModules={visibleAdminModules(context)}>{children}</AppShell>
}

function AdminApp({ showLogin }: { showLogin: boolean }) {
  const navigateToLogin = useCallback(() => {
    window.history.replaceState(null, '', ADMIN_LOGIN_PATH)
    window.dispatchEvent(new Event('popstate'))
  }, [])

  return <AppProviders><a href="#main-content" className="sr-only z-10 rounded-md bg-slate-950 px-4 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">Saltar al contenido principal</a><AdminBoundary showLogin={showLogin} onSessionClosed={navigateToLogin} admin={(closeSession, context) => <AdminAppContentWithLogout context={context} closeSession={closeSession} />} cashier={(context, closeSession) => <CashierWorkspace context={context} closeSession={closeSession} />}>{null}</AdminBoundary></AppProviders>
}

function AdminAppContentWithLogout({ context, closeSession }: { context: AccessContext; closeSession: () => Promise<void> }) {
  const persistence = useAdminSessionPersistence()
  const [restored] = useState(() => persistence?.read('app', isAppSessionState) ?? null)
  const [activeModule, setActiveModule] = useState<AppModule>(() => restored?.activeModule ?? 'dashboard')
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(() => restored?.focusedOrderId ?? null)
  const [focusedReservationId, setFocusedReservationId] = useState<string | null>(() => restored?.focusedReservationId ?? null)
  const handleNotificationSelect = useCallback((notification: AdminNotification) => {
    if ('eventDate' in notification) {
      setActiveModule('events')
      setFocusedOrderId(null)
      setFocusedReservationId(notification.id)
      return
    }
    setActiveModule('wholesale')
    setFocusedReservationId(null)
    setFocusedOrderId(notification.id)
  }, [])
  const allowedModules = visibleAdminModules(context)
  const safeActiveModule = allowedModules.includes(activeModule) ? activeModule : (allowedModules[0] ?? 'catalog')
  useEffect(() => {
    persistence?.write('app', { activeModule: safeActiveModule, focusedOrderId, focusedReservationId })
  }, [activeModule, focusedOrderId, focusedReservationId, persistence, safeActiveModule])
  const view = safeActiveModule === 'dashboard'
    ? <DashboardWorkspace />
    : safeActiveModule === 'catalog'
      ? <ProductWorkspace />
      : safeActiveModule === 'wholesale'
      ? <WholesaleAdminWorkspace focusOrderId={focusedOrderId} />
      : safeActiveModule === 'customers'
        ? <WholesaleCustomersWorkspace />
        : safeActiveModule === 'reports'
          ? <SalesReportWorkspace context={context} />
          : safeActiveModule === 'branches'
            ? <BranchWorkspace />
            : safeActiveModule === 'events'
              ? <EventReservationWorkspace focusReservationId={focusedReservationId} />
              : safeActiveModule === 'configuration'
                ? <ConfigurationWorkspace />
                : <SalesWorkspace key={safeActiveModule} channel={safeActiveModule} />
  return <AdminShell context={context} activeModule={safeActiveModule} onModuleChange={setActiveModule} onLogout={closeSession} onNotificationSelect={handleNotificationSelect}>{view}</AdminShell>
}

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  if (isPublicLandingPath(pathname)) return <AppProviders><PublicCatalogLanding /></AppProviders>
  if (isWholesaleCustomerPortalPath(pathname)) return <AppProviders><WholesaleCustomerPortal /></AppProviders>
  if (isEventReservationPortalPath(pathname)) return <AppProviders><EventCustomerPortal /></AppProviders>
  return <AdminApp showLogin={isAdminLoginPath(pathname)} />
}

export default App
