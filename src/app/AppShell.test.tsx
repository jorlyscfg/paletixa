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
    fireEvent.click(within(desktopNav).getByRole('button', { name: /^Punto de venta$/ }))
    expect(onModuleChange).toHaveBeenCalledWith('pos' satisfies AppModule)
    expect(screen.getByText('Contenido del catálogo')).toBeInTheDocument()
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
