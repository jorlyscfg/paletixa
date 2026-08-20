import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell, type AppModule } from './AppShell'

describe('AppShell', () => {
  afterEach(cleanup)

  it('marks the active module and changes modules without routing', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Catalog content</p></AppShell>)
    const desktopNav = screen.getByRole('navigation', { name: 'Desktop module navigation' })
    expect(within(desktopNav).getByRole('button', { name: /Catalog/ })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(within(desktopNav).getByRole('button', { name: /^Sales$/ }))
    expect(onModuleChange).toHaveBeenCalledWith('sales' satisfies AppModule)
    expect(screen.getByText('Catalog content')).toBeInTheDocument()
  })

  it('opens a mobile menu, supports escape, and closes after selecting a module', () => {
    const onModuleChange = vi.fn()
    render(<AppShell activeModule="catalog" onModuleChange={onModuleChange}><p>Workspace</p></AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    const menu = screen.getByRole('dialog', { name: 'Module navigation' })
    expect(within(menu).getByRole('button', { name: /Reports/ })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Module navigation' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Module navigation' })).getByRole('button', { name: /Branches/ }))
    expect(onModuleChange).toHaveBeenCalledWith('branches')
    expect(screen.queryByRole('dialog', { name: 'Module navigation' })).not.toBeInTheDocument()
  })
})
