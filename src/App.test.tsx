import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import * as authApi from './features/auth/api/adminAccess'
import type { AccessContext } from './features/auth/api/adminAccess'
import type { EventReservation } from './features/events/api/types'
import { createAdminSessionStorageKey } from './app/sessionPersistence'
import App from './App'

vi.mock('./features/auth/api/adminAccess', () => ({ getAccessContext: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('./features/products/ui/ProductWorkspace', () => ({ ProductWorkspace: () => <div data-testid="catalog-view">Catálogo</div> }))
vi.mock('./features/sales/ui/SalesWorkspace', () => ({ SalesWorkspace: ({ channel }: { channel: string }) => <div data-testid={`${channel}-view`}>{channel}</div> }))
vi.mock('./features/wholesale/ui/WholesaleAdminWorkspace', () => ({ WholesaleAdminWorkspace: ({ focusOrderId }: { focusOrderId?: string | null }) => <div data-testid="wholesale-view" data-focus-order-id={focusOrderId ?? ''}>Mayoristas</div> }))
vi.mock('./features/wholesale/ui/WholesaleCustomersWorkspace', () => ({ WholesaleCustomersWorkspace: () => <div data-testid="customers-view">Clientes</div> }))
vi.mock('./features/wholesale/ui/WholesaleCustomerPortal', () => ({ WholesaleCustomerPortal: () => <div data-testid="customer-portal-view">Portal mayorista</div> }))
vi.mock('./features/events/ui/EventCustomerPortal', () => ({ EventCustomerPortal: () => <div data-testid="event-customer-portal-view">Portal de eventos</div> }))
vi.mock('./features/public/ui/PublicCatalogLanding', () => ({ PublicCatalogLanding: () => <div data-testid="public-landing-view">Catálogo público</div> }))
vi.mock('./features/events/ui/EventReservationWorkspace', () => ({ EventReservationWorkspace: ({ focusReservationId }: { focusReservationId?: string | null }) => <div data-testid="event-view" data-focus-reservation-id={focusReservationId ?? ''}>Eventos</div> }))
const wholesaleNotificationApi = vi.hoisted(() => ({ list: vi.fn(), subscribe: vi.fn() }))
const eventNotificationApi = vi.hoisted(() => ({ list: vi.fn(), subscribe: vi.fn() }))
vi.mock('./features/wholesale/api/orders', () => ({ listWholesaleOrders: wholesaleNotificationApi.list }))
vi.mock('./features/wholesale/api/realtime', () => ({ subscribeToWholesaleOrderEvents: wholesaleNotificationApi.subscribe }))
vi.mock('./features/events/api/reservations', () => ({ listEventReservations: eventNotificationApi.list }))
vi.mock('./features/events/api/realtime', () => ({ subscribeToEventReservationEvents: eventNotificationApi.subscribe }))
vi.mock('./features/sales/ui/SalesReportWorkspace', () => ({
  DashboardWorkspace: () => <div data-testid="dashboard-view">Dashboard</div>,
  SalesReportWorkspace: () => <div data-testid="reports-view">Reportes</div>,
}))
vi.mock('./features/branches/ui/BranchWorkspace', () => ({ BranchWorkspace: () => <div data-testid="branches-view">Sucursales</div> }))
vi.mock('./features/configuration/ui/ConfigurationWorkspace', () => ({ ConfigurationWorkspace: () => <div data-testid="configuration-view">Configuración</div> }))
type MockShiftHeaderState = {
  status: 'open' | 'opening'
  onInfoRequest?: () => void
  onOpenRequest?: () => void
  onCloseRequest?: () => void
}

const posShiftHeaderMock = vi.hoisted(() => ({
  status: 'open' as 'open' | 'opening',
  onOpenRequest: vi.fn(),
  deferHeaderState: false,
  emit: null as ((state: MockShiftHeaderState | null) => void) | null,
}))
vi.mock('./features/sales/ui/PosShiftWorkspace', () => ({
  PosShiftWorkspace: ({ branchId, branchName, cashierName, onHeaderStateChange }: { branchId: string; branchName: string; cashierName?: string | null; onHeaderStateChange?: (state: MockShiftHeaderState | null) => void }) => {
    useEffect(() => {
      posShiftHeaderMock.emit = onHeaderStateChange ?? null
      if (posShiftHeaderMock.deferHeaderState) return
      onHeaderStateChange?.(posShiftHeaderMock.status === 'opening'
        ? { status: 'opening', onOpenRequest: posShiftHeaderMock.onOpenRequest }
        : { status: 'open', onInfoRequest: vi.fn(), onCloseRequest: vi.fn() })
      return () => { posShiftHeaderMock.emit = null }
    }, [onHeaderStateChange])
    return <div data-testid="pos-shift-workspace" data-branch-id={branchId} data-branch-name={branchName} data-cashier-name={cashierName ?? ''}>Punto de venta POS</div>
  },
}))

const adminContext: AccessContext = {
  role: 'admin',
  userId: 'admin-1',
  displayName: 'Admin',
  capabilities: ['reports.view', 'configuration.manage'],
  branch: null,
}

async function openModuleNavigation() {
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir menú de navegación' }))
  return screen.findByRole('dialog', { name: 'Navegación de módulos' })
}

describe('App module selection and cashier workspace', () => {
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/')
  })
  beforeEach(() => {
    vi.resetAllMocks()
    window.history.replaceState(null, '', '/admin')
    posShiftHeaderMock.status = 'open'
    posShiftHeaderMock.onOpenRequest = vi.fn()
    posShiftHeaderMock.deferHeaderState = false
    posShiftHeaderMock.emit = null
    vi.mocked(authApi.getAccessContext).mockResolvedValue(adminContext)
    wholesaleNotificationApi.list.mockResolvedValue([])
    wholesaleNotificationApi.subscribe.mockResolvedValue(() => undefined)
    eventNotificationApi.list.mockResolvedValue([])
    eventNotificationApi.subscribe.mockResolvedValue(() => undefined)
  })

  it('renders the public promotional catalog at the root without entering the admin boundary', async () => {
    window.history.replaceState(null, '', '/')

    render(<App />)

    expect(await screen.findByTestId('public-landing-view')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Inicio de sesión' })).not.toBeInTheDocument()
    expect(authApi.getAccessContext).not.toHaveBeenCalled()
  })

  it('renders the existing admin login only at /app', async () => {
    window.history.replaceState(null, '', '/app')
    vi.mocked(authApi.getAccessContext).mockResolvedValue(null)

    render(<App />)

    expect(await screen.findByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
  })

  it('continues authenticated administrators into the admin app from /app', async () => {
    window.history.replaceState(null, '', '/app')

    render(<App />)

    expect(await screen.findByTestId('dashboard-view')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Inicio de sesión' })).not.toBeInTheDocument()
  })

  it('isolates the global skip link while the admin navigation drawer is open', async () => {
    render(<App />)

    await screen.findByTestId('dashboard-view')
    const skipLink = screen.getByRole('link', { name: 'Saltar al contenido principal' })
    expect(skipLink).not.toHaveAttribute('inert')
    expect(skipLink).not.toHaveAttribute('aria-hidden', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }))

    const drawer = await screen.findByRole('dialog', { name: 'Navegación de módulos' })
    expect(skipLink).toHaveAttribute('inert')
    expect(skipLink).toHaveAttribute('aria-hidden', 'true')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(drawer).not.toBeInTheDocument())
    expect(skipLink).not.toHaveAttribute('inert')
    expect(skipLink).toHaveAttribute('aria-hidden', 'false')
  })

  it('keeps unrecognized protected paths gated without exposing the login form there', async () => {
    window.history.replaceState(null, '', '/admin/catalog')
    vi.mocked(authApi.getAccessContext).mockResolvedValue(null)

    render(<App />)

    expect(await screen.findByRole('region', { name: 'Acceso administrativo' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Inicio de sesión' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ir a iniciar sesión/ })).toHaveAttribute('href', '/app')
  })

  it('preserves both customer-facing portal routes', () => {
    window.history.replaceState(null, '', '/mayoristas')
    const wholesaleView = render(<App />)
    expect(screen.getByTestId('customer-portal-view')).toBeInTheDocument()
    wholesaleView.unmount()

    window.history.replaceState(null, '', '/reservas/request-1')
    render(<App />)
    expect(screen.getByTestId('event-customer-portal-view')).toBeInTheDocument()
  })

  it('starts administrative navigation on the Dashboard module', async () => {
    render(<App />)

    expect(await screen.findByTestId('dashboard-view')).toBeInTheDocument()
    const drawer = await openModuleNavigation()
    expect(within(drawer).getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  })

  it('restores the last allowed administrative module after a fresh render', async () => {
    const first = render(<App />)
    const firstDrawer = await openModuleNavigation()
    fireEvent.click(within(firstDrawer).getByRole('button', { name: 'Reportes' }))
    expect(screen.getByTestId('reports-view')).toBeInTheDocument()
    first.unmount()

    render(<App />)
    expect(await screen.findByTestId('reports-view')).toBeInTheDocument()
    const restoredDrawer = await openModuleNavigation()
    expect(within(restoredDrawer).getByRole('button', { name: 'Reportes' })).toHaveAttribute('aria-current', 'page')
  })

  it.each([
    ['Dashboard', 'dashboard-view'],
    ['Catálogo', 'catalog-view'],
    ['Punto de venta', 'pos-view'],
    ['Mayoristas', 'wholesale-view'],
    ['Eventos', 'event-view'],
    ['Clientes', 'customers-view'],
    ['Reportes', 'reports-view'],
    ['Sucursales', 'branches-view'],
    ['Configuración', 'configuration-view'],
  ])('renders the dedicated %s workspace', async (label, testId) => {
    render(<App />)
    const drawer = await openModuleNavigation()
    fireEvent.click(within(drawer).getByRole('button', { name: new RegExp(`^${label}$`) }))
    expect(screen.getByTestId(testId)).toBeInTheDocument()
  })

  it('bounds the admin POS workspace to the shell height remaining below its header', async () => {
    render(<App />)
    const drawer = await openModuleNavigation()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Punto de venta' }))

    const shell = document.querySelector('.ops-shell')
    const main = document.getElementById('main-content')
    const heightFrame = screen.getByTestId('admin-pos-height-frame')
    expect(shell).toHaveClass('h-dvh', 'min-h-0', 'flex-col', 'overflow-hidden')
    expect(main).toHaveClass('min-h-0', 'flex-1', 'flex-col', 'overflow-hidden')
    expect(heightFrame).toHaveClass('grid', 'min-h-0', 'min-w-0', 'flex-1', 'grid-rows-[minmax(0,1fr)]')
    expect(heightFrame).toContainElement(screen.getByTestId('pos-view'))
  })

  it('hides report and configuration entries when their capabilities are absent', async () => {
    vi.mocked(authApi.getAccessContext).mockResolvedValue({ ...adminContext, capabilities: ['reports.view'] })
    render(<App />)
    let drawer = await openModuleNavigation()
    expect(within(drawer).getByRole('button', { name: 'Reportes' })).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Configuración' })).not.toBeInTheDocument()

    vi.mocked(authApi.getAccessContext).mockResolvedValue({ ...adminContext, capabilities: [] })
    cleanup()
    render(<App />)
    drawer = await openModuleNavigation()
    expect(within(drawer).queryByRole('button', { name: 'Reportes' })).not.toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Configuración' })).not.toBeInTheDocument()
  })

  it('refreshes unread wholesale notifications from realtime and focuses the selected order', async () => {
    let notify: ((message: { status?: string }) => void) | undefined
    const notification = { id: 'order-notification', customerName: 'Tienda La Plaza', customerMobile: '+525512345678', totalMxn: 125, createdAt: '2026-08-24T12:00:00Z', status: 'pending', adminSeenAt: null, items: [{ id: 'line-1' }] }
    wholesaleNotificationApi.list.mockResolvedValueOnce([notification]).mockResolvedValue([notification])
    wholesaleNotificationApi.subscribe.mockImplementation(async (listener: (message: { status?: string }) => void) => {
      notify = listener
      return () => undefined
    })
    render(<App />)

    const bell = await screen.findByRole('button', { name: 'Notificaciones: 1 pedidos pendientes sin revisar' })
    act(() => notify?.({ status: 'pending' }))
    await waitFor(() => expect(wholesaleNotificationApi.list).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'Notificaciones: 1 pedidos pendientes sin revisar' })).toBeInTheDocument()

    fireEvent.click(bell)
    expect(screen.getByRole('dialog', { name: 'Notificaciones pendientes' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Tienda La Plaza/ }))
    expect(screen.getByTestId('wholesale-view')).toBeInTheDocument()
    expect(screen.getByTestId('wholesale-view')).toHaveAttribute('data-focus-order-id', 'order-notification')
  })

  it('refreshes unread event reservations from realtime and focuses the selected reservation', async () => {
    let notify: (() => void) | undefined
    const notification = {
      id: 'reservation-notification', requestId: 'request-notification', customerName: 'Mariana Torres', customerPhone: '+525512345678', customerEmail: null,
       eventDate: '2099-09-12', cartAllocated: false, status: 'pending', origin: 'public', paymentPlan: 'advance', totalMxn: 125,
      declaredPaymentAmount: 50, declaredPaymentMethod: 'cash', declaredPaymentReference: null, confirmedPaymentAmount: null, confirmedPaymentMethod: null,
      confirmedPaymentReference: null, confirmedPaymentNote: null, paymentConfirmedAt: null, paymentConfirmedBy: null, remainingPaymentAmount: 0, remainingPaymentMethod: null,
      remainingPaymentNote: null, reservedAt: null, reservedBy: null, completedAt: null, cancelledAt: null, cancelledBy: null,
      cancellationReason: null, saleId: null, createdBy: null, createdAt: '2099-08-01T12:00:00Z', updatedAt: '2099-08-01T12:00:00Z', adminSeenAt: null, adminSeenBy: null, items: [],
      transferTicket: null,
    } as EventReservation
    eventNotificationApi.list.mockResolvedValueOnce([notification]).mockResolvedValue([notification])
    eventNotificationApi.subscribe.mockImplementation(async (listener: () => void) => {
      notify = listener
      return () => undefined
    })
    render(<App />)

    const bell = await screen.findByRole('button', { name: 'Notificaciones: 1 reservas pendientes sin revisar' })
    act(() => notify?.())
    await waitFor(() => expect(eventNotificationApi.list).toHaveBeenCalledTimes(2))
    fireEvent.click(bell)
    fireEvent.click(screen.getByRole('button', { name: /Mariana Torres/ }))
    expect(screen.getByTestId('event-view')).toHaveAttribute('data-focus-reservation-id', 'reservation-notification')
  })

  it('shows admin logout and returns to login through the boundary session path', async () => {
    vi.mocked(authApi.signOut).mockResolvedValue(undefined)
    vi.mocked(authApi.getAccessContext).mockResolvedValueOnce(adminContext).mockResolvedValueOnce(null)
    render(<App />)

    const logoutButton = await screen.findByRole('button', { name: 'Cerrar sesión' })
    expect(logoutButton.querySelector('[data-icon="power"]')).toBeInTheDocument()
    fireEvent.click(logoutButton)
    fireEvent.click(within(screen.getByRole('dialog', { name: '¿Cerrar la sesión administrativa?' })).getByRole('button', { name: 'Cerrar sesión' }))

    expect(authApi.signOut).toHaveBeenCalledOnce()
    expect(await screen.findByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
    expect(sessionStorage.getItem(createAdminSessionStorageKey({ userId: 'admin-1', branchId: null }, 'app')!)).toBeNull()
  })

  it('keeps branch authorization data internal while using a sticky accessible header', async () => {
     vi.mocked(authApi.getAccessContext).mockResolvedValue({
      role: 'cashier',
      userId: 'employee-1',
      displayName: 'Ana López',
      capabilities: ['pos.use'],
       branch: { id: 'branch-1', name: 'Central' },
     })
    render(<App />)

    const heading = await screen.findByRole('heading', { name: 'Punto de venta' })
    expect(heading).toBeInTheDocument()
    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('button', { name: 'Cambiar al tema claro' })).toBeInTheDocument()
    expect(banner.firstElementChild).toHaveClass('ops-navbar-header')
    expect(within(banner).getByRole('button', { name: 'Cambiar al tema claro' })).toHaveClass('ops-navbar-action')
    expect(banner).toHaveClass('sticky', 'top-0', 'z-50', 'border-b', 'bg-slate-950/95', 'backdrop-blur')
    expect(banner.firstElementChild).toHaveClass('w-full', 'min-h-16')
    expect(banner.firstElementChild).not.toHaveClass('max-w-6xl')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(banner).toHaveTextContent('Sucursal: Central')
    expect(banner).toHaveTextContent('Cajero: Ana López')
    const branchValue = screen.getByText('Central', { exact: true })
    const cashierValue = screen.getByText('Ana López', { exact: true })
    expect(branchValue).toHaveClass('text-slate-400')
    expect(cashierValue).toHaveClass('text-slate-400')
    expect(branchValue.parentElement).toHaveClass('text-white')
    expect(cashierValue.parentElement).toHaveClass('text-white')
    expect(branchValue.parentElement?.parentElement).toHaveClass('items-end', 'text-right', 'flex-col')
    expect(branchValue.parentElement?.parentElement).not.toHaveClass('sm:flex-row')
    expect(branchValue.parentElement?.parentElement).toContainElement(cashierValue)
    expect(heading.parentElement).not.toContainElement(branchValue)
    expect(heading.parentElement).not.toContainElement(cashierValue)
    expect(await screen.findByRole('button', { name: 'Ver control de caja' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Cerrar y reconciliar turno' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver control de caja' })).toHaveClass('ops-navbar-action')
    expect(screen.getByRole('button', { name: 'Cerrar y reconciliar turno' })).toHaveClass('ops-navbar-action')
    await waitFor(() => expect(screen.getByText('Abierto')).toBeInTheDocument())
    expect(screen.queryByText('Turno activo')).not.toBeInTheDocument()

    const posWorkspace = screen.getByTestId('pos-shift-workspace')
    expect(posWorkspace).not.toHaveTextContent('Sucursal: Central')
    expect(posWorkspace).not.toHaveTextContent('Cajero: Ana López')
    expect(posWorkspace).toHaveAttribute('data-branch-id', 'branch-1')
    expect(posWorkspace).toHaveAttribute('data-branch-name', 'Central')
    expect(posWorkspace).toHaveAttribute('data-cashier-name', 'Ana López')
    expect(screen.getByRole('main').lastElementChild).toHaveClass('w-full')
    expect(screen.getByRole('main').lastElementChild).not.toHaveClass('max-w-6xl')
    expect(screen.getByRole('main').lastElementChild).toHaveClass('py-3', 'sm:py-4')
    expect(screen.getByRole('main')).toHaveClass('h-dvh', 'min-h-0', 'flex', 'flex-col', 'overflow-hidden')
    expect(screen.getByRole('main').lastElementChild).toHaveClass('min-h-0', 'flex-1', 'overflow-hidden')
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
   })

  it('hides the cashier navbar until shift opening resolves and reveals it after success', async () => {
    posShiftHeaderMock.status = 'opening'
    posShiftHeaderMock.deferHeaderState = true
    vi.mocked(authApi.getAccessContext).mockResolvedValue({
      role: 'cashier',
      userId: 'employee-1',
      displayName: 'Ana López',
      capabilities: ['pos.use'],
      branch: { id: 'branch-1', name: 'Central' },
    })
    render(<App />)

    await screen.findByTestId('pos-shift-workspace')
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()

    act(() => { posShiftHeaderMock.emit?.({ status: 'opening', onOpenRequest: posShiftHeaderMock.onOpenRequest }) })
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()

    act(() => { posShiftHeaderMock.emit?.({ status: 'open', onInfoRequest: vi.fn(), onCloseRequest: vi.fn() }) })
    const banner = await screen.findByRole('banner')
    expect(banner).toHaveClass('sticky', 'top-0', 'z-50')
    expect(banner).toHaveTextContent('Abierto')
    expect(await screen.findByRole('button', { name: 'Ver control de caja' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
  })

  it('provides a logout escape when a cashier has no active branch', async () => {
    vi.mocked(authApi.getAccessContext).mockResolvedValue({
      role: 'cashier',
      userId: 'employee-1',
      displayName: 'Ana López',
      capabilities: ['pos.use'],
      branch: null,
    })
    vi.mocked(authApi.signOut).mockResolvedValue(undefined)
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay una sucursal activa asignada')
    const logout = screen.getByRole('button', { name: 'Cerrar sesión' })
    expect(logout).toBeInTheDocument()
    expect(logout).toHaveAccessibleName('Cerrar sesión')
    fireEvent.click(logout)

    expect(authApi.signOut).toHaveBeenCalledOnce()
    expect(await screen.findByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
  })
})
