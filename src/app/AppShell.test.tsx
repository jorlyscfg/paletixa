import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WholesaleOrder } from '../features/wholesale/api/types'
import { AppShell, type AppModule } from './AppShell'

describe('AppShell', () => {
  afterEach(cleanup)

  it('marks the active module and changes modules without routing', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Contenido del catálogo</p></AppShell>)
    const desktopNav = screen.getByRole('navigation', { name: 'Navegación de módulos de escritorio' })
    expect(within(desktopNav).getByRole('button', { name: /Catálogo/ })).toHaveAttribute('aria-current', 'page')
    const icons = { 'Dashboard': 'dashboard', 'Catálogo': 'catalog', 'Punto de venta': 'sale', 'Mayoristas': 'package', 'Eventos': 'calendar', 'Reportes': 'reports', 'Sucursales': 'branches' }
    for (const [label, icon] of Object.entries(icons)) {
      const button = within(desktopNav).getByRole('button', { name: new RegExp(`^${label}`) })
      expect(button.querySelector(`[data-icon="${icon}"]`)).not.toBeNull()
    }
    expect(within(desktopNav).getByRole('button', { name: /Catálogo/ })).toHaveClass('ops-nav-button')
    expect(desktopNav.firstElementChild).toHaveTextContent('Dashboard')
    fireEvent.click(within(desktopNav).getByRole('button', { name: /^Punto de venta$/ }))
    expect(onModuleChange).toHaveBeenCalledWith('pos' satisfies AppModule)
    expect(screen.getByText('Contenido del catálogo')).toBeInTheDocument()
  })

  it('activates a desktop module on the first pointer interaction', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Contenido del catálogo</p></AppShell>)

    fireEvent.pointerUp(screen.getByRole('button', { name: /^Punto de venta$/ }), { button: 0, pointerType: 'mouse' })

    expect(onModuleChange).toHaveBeenCalledTimes(1)
    expect(onModuleChange).toHaveBeenCalledWith('pos')
  })

  it('keeps the application header sticky with the shared backdrop treatment', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="pos" onModuleChange={onModuleChange}><p>Punto de venta</p></AppShell>)
    const header = screen.getByRole('banner')
    expect(header).toHaveClass('sticky', 'top-0', 'z-50', 'backdrop-blur')
    expect(within(header).getByText('Paletixa Operaciones')).toBeInTheDocument()
    const themeToggle = within(header).getByRole('button', { name: 'Cambiar a modo claro' })
    expect(themeToggle).toHaveClass('ops-navbar-action')
    const activeLabel = within(header).getByText('Punto de venta', { exact: true })
    expect(activeLabel).toHaveClass('block', 'text-xs')
    expect(activeLabel).not.toHaveClass('hidden')
    expect(within(header).queryByText('Catálogo y ventas compartidas')).not.toBeInTheDocument()
  })

  it('confirms administrator logout and lets the user cancel first', () => {
    const onModuleChange = vi.fn()
    const onLogout = vi.fn(() => new Promise<void>(() => undefined))
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange} onLogout={onLogout}><p>Contenido del catálogo</p></AppShell>)

    const logoutButton = screen.getByRole('button', { name: 'Cerrar sesión' })
    expect(logoutButton).toHaveClass('ops-navbar-action')
    expect(logoutButton.querySelector('[data-icon="power"]')).toBeInTheDocument()
    fireEvent.click(logoutButton)
    const dialog = screen.getByRole('dialog', { name: '¿Cerrar la sesión administrativa?' })
    expect(dialog).toHaveTextContent('Se cerrará tu acceso al espacio administrativo.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(onLogout).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: '¿Cerrar la sesión administrativa?' })).not.toBeInTheDocument()

    fireEvent.click(logoutButton)
    const confirmation = screen.getByRole('dialog', { name: '¿Cerrar la sesión administrativa?' })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cerrar sesión' }))
    expect(onLogout).toHaveBeenCalledOnce()
    expect(within(confirmation).getByRole('button', { name: 'Cerrando sesión…' })).toBeDisabled()
    expect(within(confirmation).getByRole('button', { name: 'Cancelar cierre de sesión' })).toBeDisabled()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cerrando sesión…' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('shows the unread wholesale notification count and navigates to Mayoristas', () => {
    const onModuleChange = vi.fn()
    const onNotificationsClick = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange} notificationCount={3} onNotificationsClick={onNotificationsClick}><p>Contenido del catálogo</p></AppShell>)

    const notificationButton = screen.getByRole('button', { name: 'Notificaciones: 3 pedidos pendientes sin revisar' })
    expect(notificationButton).toHaveClass('ops-navbar-action')
    expect(notificationButton.querySelector('[data-icon="bell"]')).toBeInTheDocument()
    expect(notificationButton.parentElement).toHaveTextContent('3')
    fireEvent.click(notificationButton)

    expect(onNotificationsClick).toHaveBeenCalledOnce()
  })

  it('opens unread order notifications and selects the exact order', () => {
    const onModuleChange = vi.fn()
    const onNotificationSelect = vi.fn()
    const notification = { id: 'order-12345678', customerName: 'Tienda La Plaza', customerMobile: '+525512345678', totalMxn: 125, createdAt: '2026-08-24T12:00:00Z', items: [{ id: 'line-1' }] } as unknown as WholesaleOrder
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange} notifications={[notification]} onNotificationSelect={onNotificationSelect}><p>Contenido del catálogo</p></AppShell>)

    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones: 1 pedidos pendientes sin revisar' }))
    const popover = screen.getByRole('dialog', { name: 'Notificaciones pendientes' })
    expect(popover).toHaveTextContent('Tienda La Plaza')
    expect(popover).toHaveTextContent('Pedido order-1')
    fireEvent.click(within(popover).getByRole('button', { name: /Tienda La Plaza/ }))

    expect(onNotificationSelect).toHaveBeenCalledWith(notification)
    expect(screen.queryByRole('dialog', { name: 'Notificaciones pendientes' })).not.toBeInTheDocument()
  })

  it('shows an empty notification state and dismisses the popover on outside click or escape', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange} notifications={[]}><p>Contenido del catálogo</p></AppShell>)

    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones: no hay pedidos pendientes sin revisar' }))
    expect(screen.getByRole('status')).toHaveTextContent('No hay notificaciones pendientes.')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Notificaciones pendientes' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones: no hay pedidos pendientes sin revisar' }))
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog', { name: 'Notificaciones pendientes' })).not.toBeInTheDocument()
  })

  it('lets the main content use the available shell width', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Contenido del catálogo</p></AppShell>)
    const content = screen.getByRole('main').firstElementChild
    expect(content).toHaveClass('mx-auto', 'w-full')
    expect(content).not.toHaveClass('max-w-6xl')
  })

  it('bounds the shell to the viewport and leaves scrolling to its content regions', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Contenido del catálogo</p></AppShell>)

    const main = screen.getByRole('main')
    const shell = main.closest('.ops-shell')
    expect(shell).toHaveClass('h-dvh', 'min-h-0', 'flex', 'flex-col', 'overflow-hidden')
    expect(main).toHaveClass('min-h-0', 'flex-1', 'overflow-hidden')
    expect(main.parentElement).toHaveClass('min-h-0', 'flex', 'flex-1', 'flex-col', 'overflow-hidden')
    expect(screen.getByRole('complementary')).toHaveClass('min-h-0', 'shrink-0')
  })

  it('uses the neutral active state for wholesale operations', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="wholesale" onModuleChange={onModuleChange}><p>Espacio mayorista</p></AppShell>)
    const button = screen.getByRole('button', { name: /Mayoristas/ })
    expect(button).toHaveClass('ops-nav-button')
    expect(button).toHaveAttribute('aria-current', 'page')
  })

  it('opens a mobile menu, supports escape, and closes after selecting a module', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Espacio de trabajo</p></AppShell>)
    const menuButton = screen.getByRole('button', { name: 'Abrir menú de navegación' })
    expect(menuButton).toHaveClass('ops-navbar-action')
    fireEvent.click(menuButton)
    const menu = screen.getByRole('dialog', { name: 'Navegación de módulos' })
    expect(within(menu).getByRole('button', { name: /Reportes/ })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Navegación de módulos' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Navegación de módulos' })).getByRole('button', { name: /Sucursales/ }))
    expect(onModuleChange).toHaveBeenCalledWith('branches')
    expect(screen.queryByRole('dialog', { name: 'Navegación de módulos' })).not.toBeInTheDocument()
  })

  it('activates and closes the mobile menu on the first pointer interaction', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Espacio de trabajo</p></AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }))

    fireEvent.pointerUp(within(screen.getByRole('dialog', { name: 'Navegación de módulos' })).getByRole('button', { name: /^Punto de venta$/ }), { button: 0, pointerType: 'touch' })

    expect(onModuleChange).toHaveBeenCalledWith('pos')
    expect(screen.queryByRole('dialog', { name: 'Navegación de módulos' })).not.toBeInTheDocument()
  })
})
