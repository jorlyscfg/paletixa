import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import type { EventReservation } from '../features/events/api/types'
import type { WholesaleOrder } from '../features/wholesale/api/types'
import { LogoutConfirmationModal } from './components/LogoutConfirmationModal'
import { ResponsiveActionButton } from './components/ResponsiveActionButton'
import { ThemeToggle } from './components/ThemeToggle'
import { Icon } from './components/icons'
import { APP_MODULES, type AppModule } from './appModules'
import { NavigationDrawerOpenContext } from './navigationDrawerContext'

export type { AppModule } from './appModules'
export type AdminNotification = WholesaleOrder | EventReservation

function formatNotificationMoney(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function ModuleNavigation({ activeModule, onModuleChange, visibleModules }: { activeModule: AppModule; onModuleChange: (module: AppModule) => void; visibleModules: readonly AppModule[] }) {
  return <nav aria-label="Navegación de módulos" className="grid gap-1">
    {APP_MODULES.filter((module) => visibleModules.includes(module.id)).map((module) => <button key={module.id} type="button" aria-label={module.label} aria-current={activeModule === module.id ? 'page' : undefined} onPointerUp={(event) => { if (event.button === 0) onModuleChange(module.id) }} onClick={(event) => { if (event.detail === 0) onModuleChange(module.id) }} className="ops-nav-button ops-focus">
      <Icon name={module.icon} className="h-5 w-5 shrink-0 text-slate-300" /><span className="min-w-0"><span className="block text-sm font-semibold text-slate-200">{module.label}</span><span className="block truncate text-xs text-slate-500">{module.description}</span></span>
    </button>)}
  </nav>
}

function isEventNotification(notification: AdminNotification): notification is EventReservation {
  return 'eventDate' in notification
}

function notificationCopy(notifications: AdminNotification[]) {
  if (notifications.length > 0 && notifications.every(isEventNotification)) return 'reservas pendientes sin revisar'
  if (notifications.every((notification) => !isEventNotification(notification))) return 'pedidos pendientes sin revisar'
  return 'operaciones pendientes sin revisar'
}

export function AppShell({ activeModule, onModuleChange, onLogout, notificationCount = 0, notifications, onNotificationSelect, onNotificationsClick, visibleModules = APP_MODULES.map(({ id }) => id), children }: { activeModule: AppModule; onModuleChange: (module: AppModule) => void; onLogout?: () => void | Promise<void>; notificationCount?: number; notifications?: AdminNotification[]; onNotificationSelect?: (notification: AdminNotification) => void; onNotificationsClick?: () => void; visibleModules?: readonly AppModule[]; children: ReactNode }) {
  const [localMenuOpen, setLocalMenuOpen] = useState(false)
  const navigationDrawer = useContext(NavigationDrawerOpenContext)
  const menuOpen = navigationDrawer?.isOpen ?? localMenuOpen
  const setMenuOpen = navigationDrawer?.setIsOpen ?? setLocalMenuOpen
  const setSharedMenuOpen = navigationDrawer?.setIsOpen
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false)
  const shellId = useId().replace(/:/g, '')
  const drawerId = `navigation-drawer-${shellId}`
  const drawerTriggerId = `navigation-trigger-${shellId}`
  const notificationsId = `admin-notifications-${shellId}`
  const drawerRef = useRef<HTMLDivElement>(null)
  const menuWasOpenRef = useRef(false)
  const notificationsRegionRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const active = APP_MODULES.find((module) => module.id === activeModule) ?? APP_MODULES[0]
  const notificationItems = notifications ?? []
  const visibleNotificationCount = notifications === undefined ? notificationCount : notificationItems.length
  const notificationDescription = notificationCopy(notificationItems)

  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    const syncViewport = () => {
      const viewport = window.visualViewport
      const viewportHeight = viewport && viewport.height > 0 ? viewport.height : window.innerHeight
      const viewportTop = viewport?.offsetTop ?? 0
      const layoutViewportHeight = window.innerHeight || document.documentElement.clientHeight
      const bottomInset = Math.max(0, layoutViewportHeight - viewportTop - viewportHeight)

      shell.style.setProperty('--ops-viewport-height', `${viewportHeight}px`)
      shell.style.setProperty('--ops-viewport-top', `${viewportTop}px`)
      shell.style.setProperty('--ops-viewport-bottom-inset', `${bottomInset}px`)
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('scroll', syncViewport)

    return () => {
      window.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('scroll', syncViewport)
    }
  }, [])

  useEffect(() => () => setSharedMenuOpen?.(false), [setSharedMenuOpen])

  useEffect(() => {
    if (!menuOpen) {
      if (menuWasOpenRef.current) {
        menuWasOpenRef.current = false
        document.getElementById(drawerTriggerId)?.focus()
      }
      return
    }
    menuWasOpenRef.current = true
    drawerRef.current?.querySelector<HTMLElement>('[data-drawer-initial-focus]')?.focus()
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen, drawerTriggerId, setMenuOpen])

  useEffect(() => {
    if (!notificationsOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setNotificationsOpen(false) }
    const closeOnOutsidePointer = (event: MouseEvent | TouchEvent) => {
      if (event.target instanceof Node && !notificationsRegionRef.current?.contains(event.target)) setNotificationsOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('mousedown', closeOnOutsidePointer)
    document.addEventListener('touchstart', closeOnOutsidePointer)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('mousedown', closeOnOutsidePointer)
      document.removeEventListener('touchstart', closeOnOutsidePointer)
    }
  }, [notificationsOpen])

  function selectModule(module: AppModule) {
    onModuleChange(module)
    setMenuOpen(false)
  }

  function toggleNavigation() {
    setNotificationsOpen(false)
    setMenuOpen((current) => !current)
  }

  function keepMenuFocusInside(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    const drawer = drawerRef.current
    if (!drawer) return
    const candidates = drawer.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    const focusable = Array.from(candidates).filter((element) => element.tabIndex >= 0)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) {
      event.preventDefault()
      return
    }
    const activeElementIsOutside = !drawer.contains(document.activeElement)
    if (activeElementIsOutside || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function toggleNotifications() {
    if (notifications === undefined) {
      onNotificationsClick?.()
      return
    }
    setNotificationsOpen((current) => !current)
  }

  function selectNotification(notification: AdminNotification) {
    setNotificationsOpen(false)
    if (onNotificationSelect) onNotificationSelect(notification)
    else onNotificationsClick?.()
  }

  return <div ref={shellRef} className="ops-shell fixed inset-x-0 flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-slate-950 text-slate-100" style={{ top: 'var(--ops-viewport-top, 0px)', height: 'var(--ops-viewport-height, 100dvh)' }}>
    <header className="sticky top-0 z-50 shrink-0 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="ops-navbar-header flex min-h-16 items-center gap-3 pl-4 sm:pl-6">
        <ResponsiveActionButton id={drawerTriggerId} label={menuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'} icon={menuOpen ? 'close' : 'menu'} className="ops-navbar-action" onClick={toggleNavigation} aria-expanded={menuOpen} aria-controls={drawerId} />
        <div aria-hidden={menuOpen} inert={menuOpen} className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-lg font-black text-white">P</span>
          <div className="min-w-0"><p className="truncate text-sm font-bold tracking-tight text-white sm:text-base">Paletixa Operaciones</p><p className="block text-xs text-slate-400">{active.label}</p></div>
        </div>
       <div aria-hidden={menuOpen} inert={menuOpen} className="ops-navbar-actions ml-auto flex items-center text-right"><span className="hidden text-xs text-slate-400 sm:block">Espacio administrativo</span><ThemeToggle className="ops-navbar-action" />{(onNotificationsClick || notifications) && <div ref={notificationsRegionRef} className="relative shrink-0"><ResponsiveActionButton label={visibleNotificationCount > 0 ? `Notificaciones: ${visibleNotificationCount} ${notificationDescription}` : `Notificaciones: no hay ${notificationDescription}`} icon="bell" iconOnly onClick={toggleNotifications} aria-expanded={notifications !== undefined ? notificationsOpen : undefined} aria-controls={notifications !== undefined ? notificationsId : undefined} aria-haspopup={notifications !== undefined ? 'dialog' : undefined} className="ops-navbar-action" />{visibleNotificationCount > 0 && <span aria-hidden="true" className="pointer-events-none absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-slate-950 bg-rose-500 px-1 text-[10px] font-black text-white">{visibleNotificationCount > 99 ? '99+' : visibleNotificationCount}</span>}{notificationsOpen && notifications !== undefined && <div id={notificationsId} role="dialog" aria-label="Notificaciones pendientes" className="absolute right-0 top-14 z-[70] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-left shadow-2xl"><div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3"><div><p className="text-sm font-bold text-white">Notificaciones</p><p className="mt-1 text-xs text-slate-400">{notificationDescription}</p></div><span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-slate-300">{visibleNotificationCount}</span></div>{notificationItems.length === 0 ? <p role="status" className="px-4 py-6 text-sm text-slate-400">No hay notificaciones pendientes.</p> : <div className="max-h-[min(28rem,calc(100dvh-6rem))] overflow-y-auto p-2"><ul className="grid gap-1">{notificationItems.map((notification) => <li key={notification.id}><button type="button" onClick={() => selectNotification(notification)} className="ops-focus grid min-h-11 w-full gap-1 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-800"><span className="truncate text-sm font-bold text-white">{notification.customerName}</span><span className="text-xs font-semibold text-sky-200">{isEventNotification(notification) ? `Reserva ${notification.id.slice(0, 8)}` : `Pedido ${notification.id.slice(0, 8)} · ${notification.items.length} ${notification.items.length === 1 ? 'artículo' : 'artículos'}`}</span><span className="truncate text-xs text-slate-400">{isEventNotification(notification) ? `${notification.eventDate} · ${formatNotificationMoney(notification.totalMxn)} · ${formatNotificationDate(notification.createdAt)}` : `${notification.customerMobile} · ${formatNotificationMoney(notification.totalMxn)} · ${formatNotificationDate(notification.createdAt)}`}</span></button></li>)}</ul></div>}</div>}</div>}{onLogout && <ResponsiveActionButton aria-hidden={menuOpen} inert={menuOpen} label="Cerrar sesión" icon="power" iconOnly onClick={() => setLogoutConfirmationOpen(true)} className="ops-navbar-action" />}</div>
      </div>
    </header>

    <div aria-hidden={menuOpen} inert={menuOpen} className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-950"><main id="main-content" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 py-4 text-slate-100 sm:px-6 sm:py-6 lg:px-8"><div className="mx-auto flex min-h-0 min-w-0 w-full max-w-[90rem] flex-1 flex-col">{children}</div></main></div>
    </div>

    {menuOpen && <div id={drawerId} ref={drawerRef} onKeyDown={keepMenuFocusInside} role="dialog" aria-modal="true" aria-label="Navegación de módulos" className="fixed inset-x-0 bottom-0 top-16 z-40"><button type="button" tabIndex={-1} aria-label="Cerrar menú de navegación" title="Cerrar menú de navegación" className="ops-focus absolute inset-0 h-full w-full bg-slate-950/70" onClick={() => setMenuOpen(false)} /><aside className="absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-3rem))] max-w-full flex-col overflow-y-auto border-r border-slate-800 bg-slate-950 px-4 py-6 shadow-2xl"><div className="mb-3 flex items-center justify-between gap-3 px-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Módulos</p><ResponsiveActionButton data-drawer-initial-focus="true" label="Cerrar navegación de módulos" icon="close" iconOnly className="ops-navbar-action" onClick={() => setMenuOpen(false)} /></div><ModuleNavigation activeModule={activeModule} onModuleChange={selectModule} visibleModules={visibleModules} /><p className="mt-auto px-3 pt-8 text-xs leading-relaxed text-slate-400">Administra el catálogo, registra ventas y consulta los reportes del MVP.</p></aside></div>}
    {onLogout && <LogoutConfirmationModal open={logoutConfirmationOpen} variant="admin" onClose={() => setLogoutConfirmationOpen(false)} onConfirm={onLogout} />}
  </div>
}
