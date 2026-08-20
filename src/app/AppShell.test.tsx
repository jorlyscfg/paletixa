import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell, type AppModule } from './AppShell'

describe('AppShell', () => {
  afterEach(cleanup)

  it('marks the active module and changes modules without routing', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Contenido del catálogo</p></AppShell>)
    const desktopNav = screen.getByRole('navigation', { name: 'Navegación de módulos de escritorio' })
    expect(within(desktopNav).getByRole('button', { name: /Catálogo/ })).toHaveAttribute('aria-current', 'page')
    const icons = { 'Catálogo': 'catalog', 'Punto de venta': 'sale', 'Mayoristas': 'package', 'Eventos': 'calendar', 'Reportes': 'reports', 'Sucursales': 'branches' }
    for (const [label, icon] of Object.entries(icons)) {
      const button = within(desktopNav).getByRole('button', { name: new RegExp(`^${label}`) })
      expect(button.querySelector(`[data-icon="${icon}"]`)).not.toBeNull()
    }
    expect(within(desktopNav).getByRole('button', { name: /Catálogo/ })).toHaveClass('bg-sky-700')
    fireEvent.click(within(desktopNav).getByRole('button', { name: /^Punto de venta$/ }))
    expect(onModuleChange).toHaveBeenCalledWith('pos' satisfies AppModule)
    expect(screen.getByText('Contenido del catálogo')).toBeInTheDocument()
  })

  it('uses the module-specific active state for wholesale operations', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="wholesale" onModuleChange={onModuleChange}><p>Espacio mayorista</p></AppShell>)
    expect(screen.getByRole('button', { name: /Mayoristas/ })).toHaveClass('bg-amber-600')
  })

  it('opens a mobile menu, supports escape, and closes after selecting a module', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Espacio de trabajo</p></AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }))
    const menu = screen.getByRole('dialog', { name: 'Navegación de módulos' })
    expect(within(menu).getByRole('button', { name: /Reportes/ })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Navegación de módulos' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Navegación de módulos' })).getByRole('button', { name: /Sucursales/ }))
    expect(onModuleChange).toHaveBeenCalledWith('branches')
    expect(screen.queryByRole('dialog', { name: 'Navegación de módulos' })).not.toBeInTheDocument()
  })
})
