import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./features/auth/ui/AdminBoundary', () => ({ AdminBoundary: ({ children }: { children: ReactNode }) => children }))
vi.mock('./features/products/ui/ProductWorkspace', () => ({ ProductWorkspace: () => <div data-testid="catalog-view">Catálogo</div> }))
vi.mock('./features/sales/ui/SalesWorkspace', () => ({ SalesWorkspace: ({ channel }: { channel: string }) => <div data-testid={`${channel}-view`}>{channel}</div> }))
vi.mock('./features/sales/ui/SalesReportWorkspace', () => ({ SalesReportWorkspace: () => <div data-testid="reports-view">Reportes</div> }))
vi.mock('./features/branches/ui/BranchWorkspace', () => ({ BranchWorkspace: () => <div data-testid="branches-view">Sucursales</div> }))

describe('App module selection', () => {
  afterEach(cleanup)

  it.each([
    ['Catálogo', 'catalog-view'],
    ['Punto de venta', 'pos-view'],
    ['Mayoristas', 'wholesale-view'],
    ['Eventos', 'event-view'],
    ['Reportes', 'reports-view'],
    ['Sucursales', 'branches-view'],
  ])('renders the dedicated %s workspace', (label, testId) => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}$`) }))
    expect(screen.getByTestId(testId)).toBeInTheDocument()
  })
})
