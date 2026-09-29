import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WholesaleOrder } from '../features/wholesale/api/types'
import { AppShell, type AppModule } from './AppShell'

describe('AppShell', () => {
  afterEach(cleanup)

  it('marks the active module and changes modules from the navigation drawer', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Contenido del catálogo</p></AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }))
    const nav = within(screen.getByRole('dialog', { name: 'Navegación de módulos' })).getByRole('navigation', { name: 'Navegación de módulos' })
    expect(within(nav).getByRole('button', { name: /Catálogo/ })).toHaveAttribute('aria-current', 'page')
    const icons = { 'Dashboard': 'dashboard', 'Catálogo': 'catalog', 'Punto de venta': 'sale', 'Mayoristas': 'package', 'Eventos': 'calendar', 'Reportes': 'reports', 'Sucursales': 'branches' }
    for (const [label, icon] of Object.entries(icons)) {
      const button = within(nav).getByRole('button', { name: new RegExp(`^${label}`) })
      expect(button.querySelector(`[data-icon="${icon}"]`)).not.toBeNull()
    }
    expect(within(nav).getByRole('button', { name: /Catálogo/ })).toHaveClass('ops-nav-button')
    expect(nav.firstElementChild).toHaveTextContent('Dashboard')
    fireEvent.click(within(nav).getByRole('button', { name: /^Punto de venta$/ }))
    expect(onModuleChange).toHaveBeenCalledWith('pos' satisfies AppModule)
    expect(screen.getByText('Contenido del catálogo')).toBeInTheDocument()
  })

  it('activates a module on the first pointer interaction inside the drawer', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Contenido del catálogo</p></AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }))

    fireEvent.pointerUp(within(screen.getByRole('dialog', { name: 'Navegación de módulos' })).getByRole('button', { name: /^Punto de venta$/ }), { button: 0, pointerType: 'mouse' })

    expect(onModuleChange).toHaveBeenCalledTimes(1)
    expect(onModuleChange).toHaveBeenCalledWith('pos')
  })

  it('sizes the admin shell and fixed action bars from the visible viewport', () => {
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')
    const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')
    const viewport = new EventTarget() as unknown as VisualViewport
    Object.defineProperties(viewport, {
      height: { configurable: true, writable: true, value: 935 },
      offsetTop: { configurable: true, writable: true, value: 25 },
    })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1024 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })

    const { container, unmount } = render(<AppShell activeModule="pos" onModuleChange={() => {}}><p>Punto de venta</p></AppShell>)
    const shell = container.querySelector<HTMLElement>('.ops-shell')

    expect(shell).not.toBeNull()
    expect(shell?.style.height).toBe('var(--ops-viewport-height, 100dvh)')
    expect(shell?.style.getPropertyValue('--ops-viewport-height')).toBe('935px')
    expect(shell?.style.getPropertyValue('--ops-viewport-top')).toBe('25px')
    expect(shell?.style.getPropertyValue('--ops-viewport-bottom-inset')).toBe('64px')

    Object.defineProperty(viewport, 'height', { configurable: true, writable: true, value: 700 })
    Object.defineProperty(viewport, 'offsetTop', { configurable: true, writable: true, value: 40 })
    act(() => viewport.dispatchEvent(new Event('resize')))

    expect(shell?.style.getPropertyValue('--ops-viewport-height')).toBe('700px')
    expect(shell?.style.getPropertyValue('--ops-viewport-top')).toBe('40px')
    expect(shell?.style.getPropertyValue('--ops-viewport-bottom-inset')).toBe('284px')

    unmount()
    if (originalVisualViewport) Object.defineProperty(window, 'visualViewport', originalVisualViewport)
    else Reflect.deleteProperty(window, 'visualViewport')
    if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight)
    else Reflect.deleteProperty(window, 'innerHeight')
  })

  it('keeps the application header sticky with the shared backdrop treatment', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="pos" onModuleChange={onModuleChange}><p>Punto de venta</p></AppShell>)
    const header = screen.getByRole('banner')
    expect(header).toHaveClass('sticky', 'top-0', 'z-50', 'backdrop-blur')
    expect(within(header).getByText('Paletixa Operaciones')).toBeInTheDocument()
    const themeToggle = within(header).getByRole('button', { name: 'Cambiar al tema claro' })
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
    expect(screen.getByRole('button', { name: 'Abrir menú de navegación' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('uses the neutral active state for wholesale operations', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="wholesale" onModuleChange={onModuleChange}><p>Espacio mayorista</p></AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }))
    const button = within(screen.getByRole('dialog', { name: 'Navegación de módulos' })).getByRole('button', { name: /Mayoristas/ })
    expect(button).toHaveClass('ops-nav-button')
    expect(button).toHaveAttribute('aria-current', 'page')
  })

  it('opens the navigation drawer, supports escape, and closes after selecting a module', () => {
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

  it('uses the hamburger and over-content drawer at every viewport size', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Espacio de trabajo</p></AppShell>)

    const menuButton = screen.getByRole('button', { name: 'Abrir menú de navegación' })
    const header = screen.getByRole('banner')
    expect(menuButton).toHaveClass('ops-navbar-action')
    expect(menuButton).not.toHaveClass('hidden', 'md:hidden', 'lg:hidden', 'xl:hidden')
    expect(header).toHaveClass('z-50')
    expect(menuButton.closest('header')).toBe(header)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()

    fireEvent.click(menuButton)
    const drawer = screen.getByRole('dialog', { name: 'Navegación de módulos' })
    expect(drawer).toHaveClass('fixed', 'inset-x-0', 'top-16', 'bottom-0', 'z-40')
    // JSDOM does not model painted stacking; these classes preserve the intended
    // contract that the header trigger sits above the drawer layer.
    expect(drawer).not.toHaveClass('hidden', 'md:hidden', 'lg:hidden', 'xl:hidden')
    const sidebar = within(drawer).getByRole('complementary')
    expect(sidebar).toHaveClass('absolute', 'inset-y-0', 'left-0', 'flex')
    expect(within(sidebar).getByRole('navigation', { name: 'Navegación de módulos' })).toBeInTheDocument()

    // The same visible hamburger can close the drawer; JSDOM verifies the
    // interaction handler, while the z-index assertions above cover its CSS contract.
    fireEvent.click(menuButton)
    expect(screen.queryByRole('dialog', { name: 'Navegación de módulos' })).not.toBeInTheDocument()

    fireEvent.click(menuButton)
    const reopenedDrawer = screen.getByRole('dialog', { name: 'Navegación de módulos' })
    fireEvent.click(within(reopenedDrawer).getByRole('button', { name: 'Cerrar menú de navegación' }))
    expect(screen.queryByRole('dialog', { name: 'Navegación de módulos' })).not.toBeInTheDocument()

    fireEvent.click(menuButton)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Navegación de módulos' })).getByRole('button', { name: 'Cerrar navegación de módulos' }))
    expect(screen.queryByRole('dialog', { name: 'Navegación de módulos' })).not.toBeInTheDocument()
  })

  it('keeps only the hamburger and drawer controls available while navigation is open', () => {
    render(<AppShell activeModule="catalog" onModuleChange={vi.fn()} notifications={[]} onLogout={vi.fn()}><p>Espacio de trabajo</p></AppShell>)
    const header = screen.getByRole('banner')
    const notificationButton = screen.getByRole('button', { name: 'Notificaciones: no hay pedidos pendientes sin revisar' })
    fireEvent.click(notificationButton)
    expect(screen.getByRole('dialog', { name: 'Notificaciones pendientes' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }))
    const drawer = screen.getByRole('dialog', { name: 'Navegación de módulos' })
    const hamburger = within(header).getByRole('button', { name: 'Cerrar menú de navegación' })

    expect(screen.queryByRole('dialog', { name: 'Notificaciones pendientes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cambiar al tema claro' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Tema visual' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Notificaciones:/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
    expect(header.querySelector('.ops-navbar-actions')).toHaveAttribute('inert')
    expect(header.querySelector('.ops-navbar-header > div[aria-hidden="true"]')).toHaveAttribute('inert')
    const appContent = screen.getByText('Espacio de trabajo').closest('main')?.parentElement?.parentElement
    expect(appContent).toHaveAttribute('inert')
    expect(within(header).getAllByRole('button')).toEqual([hamburger])
    expect(within(drawer).getByRole('button', { name: 'Cerrar navegación de módulos' })).toBeInTheDocument()
    expect(within(drawer).getByRole('navigation', { name: 'Navegación de módulos' })).toBeInTheDocument()
    expect(screen.getAllByRole('button').every((button) => button === hamburger || drawer.contains(button))).toBe(true)
  })

  it('moves focus into the drawer, traps Tab, and restores focus to the hamburger', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Espacio de trabajo</p></AppShell>)
    const menuButton = screen.getByRole('button', { name: 'Abrir menú de navegación' })

    fireEvent.click(menuButton)
    const drawer = screen.getByRole('dialog', { name: 'Navegación de módulos' })
    const closeButton = within(drawer).getByRole('button', { name: 'Cerrar navegación de módulos' })
    const navigation = within(drawer).getByRole('navigation', { name: 'Navegación de módulos' })
    const lastNavigationButton = within(navigation).getAllByRole('button').at(-1)

    expect(document.activeElement).toBe(closeButton)
    expect(lastNavigationButton).toBeDefined()
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(lastNavigationButton)
    fireEvent.keyDown(lastNavigationButton!, { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Navegación de módulos' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(menuButton)
  })

  it('activates and closes the navigation drawer on the first pointer interaction', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Espacio de trabajo</p></AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }))

    fireEvent.pointerUp(within(screen.getByRole('dialog', { name: 'Navegación de módulos' })).getByRole('button', { name: /^Punto de venta$/ }), { button: 0, pointerType: 'touch' })

    expect(onModuleChange).toHaveBeenCalledWith('pos')
    expect(screen.queryByRole('dialog', { name: 'Navegación de módulos' })).not.toBeInTheDocument()
  })
})
