import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminSessionPersistenceProvider, createAdminSessionPersistence } from '../../../app/sessionPersistence'
import * as customerApi from '../api/customers'
import * as orderApi from '../api/orders'
import { WholesaleCustomersWorkspace } from './WholesaleCustomersWorkspace'

vi.mock('../api/customers', () => ({
  listWholesaleCustomers: vi.fn(),
  createWholesaleCustomer: vi.fn(),
  deleteWholesaleCustomer: vi.fn(),
  regenerateWholesaleCustomerPin: vi.fn(),
  setWholesaleCustomerStatus: vi.fn(),
  updateWholesaleCustomer: vi.fn(),
}))
vi.mock('../api/orders', () => ({ listWholesaleOrders: vi.fn() }))

describe('WholesaleCustomersWorkspace', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(customerApi.listWholesaleCustomers).mockResolvedValue([{
      id: 'customer-1',
      name: 'Tienda La Plaza',
      mobile: '+525512345678',
      email: null,
      status: 'active',
      currentPin: '0042',
      failedLoginAttempts: 0,
    }] as never)
    vi.mocked(orderApi.listWholesaleOrders).mockResolvedValue([])
  })

  it('bounds the customer workspace and gives the customer list its own scroll region', async () => {
    render(<WholesaleCustomersWorkspace />)

    const workspace = await screen.findByRole('region', { name: 'Módulo Clientes' })
    expect(workspace).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col', 'overflow-hidden')
    expect(workspace).toHaveClass('ops-workspace-frame', 'min-w-0')
    const listPanel = screen.getByText('1 de 1 clientes mostrados').parentElement?.parentElement
    expect(listPanel).toHaveClass('min-h-0', 'flex-1', 'flex-col', 'overflow-hidden')
    expect(listPanel?.lastElementChild).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'overscroll-contain')
    expect(listPanel?.lastElementChild).toHaveClass('ops-scroll-region')
  })

  it('restores an editor draft and resets it when starting a new customer', async () => {
    const scope = { userId: 'user-1', branchId: 'branch-1' }
    createAdminSessionPersistence(scope).write('wholesale-customers', {
      query: '',
      infoOpen: false,
      editor: { customerId: null, name: 'Cliente en progreso', mobile: '5550001111', email: 'draft@example.com' },
    })

    render(<AdminSessionPersistenceProvider scope={scope}><WholesaleCustomersWorkspace /></AdminSessionPersistenceProvider>)

    expect(await screen.findByDisplayValue('Cliente en progreso')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar formulario de cliente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo cliente' }))

    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Celular' })).toHaveValue('')
  })
})
