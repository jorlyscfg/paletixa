import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminBoundary } from '../../auth/ui/AdminBoundary'
import * as authApi from '../../auth/api/adminAccess'
import * as productApi from '../../products/api/products'
import * as salesApi from '../api/sales'
import { SalesWorkspace } from './SalesWorkspace'

vi.mock('../../auth/api/adminAccess', () => ({ getAdminAccess: vi.fn(), signIn: vi.fn() }))
vi.mock('../../products/api/products', () => ({ listProducts: vi.fn() }))
vi.mock('../api/sales', () => ({ SALES_CHANNELS: ['pos', 'wholesale', 'event'], recordSale: vi.fn() }))

const product: productApi.Product = { id: 'product-1', name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }
const receipt: salesApi.SaleReceipt = { id: 'sale-1', channel: 'pos', totalMxn: 85, createdAt: '2026-08-20T00:00:00Z', replayed: false }
const renderProtected = () => render(<AdminBoundary><SalesWorkspace /></AdminBoundary>)

describe('sales workspace', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(authApi.getAdminAccess).mockResolvedValue(true)
    vi.mocked(productApi.listProducts).mockResolvedValue([product])
    vi.mocked(salesApi.recordSale).mockResolvedValue(receipt)
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'request-1') })
  })

  it('does not load protected products when admin access is denied', async () => {
    vi.mocked(authApi.getAdminAccess).mockResolvedValue(false)
    renderProtected()
    expect(await screen.findByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument()
    expect(productApi.listProducts).not.toHaveBeenCalled()
  })

  it('shows an empty active catalog', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([])
    renderProtected()
    expect(await screen.findByText('No active products are in the catalog. Add an active product before recording a sale.')).toBeInTheDocument()
  })

  it('recovers when the catalog request fails', async () => {
    vi.mocked(productApi.listProducts).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([product])
    renderProtected()
    expect(await screen.findByRole('alert')).toHaveTextContent('Products could not be loaded.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(productApi.listProducts).toHaveBeenCalledTimes(2)
  })

  it('changes channels and displays the channel price', async () => {
    renderProtected()
    expect(await screen.findByText('POS price $42.50 MXN')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Wholesale' }))
    expect(screen.getByText('Wholesale price $35.00 MXN')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Event' }))
    expect(screen.getByText('Event price $42.50 MXN')).toBeInTheDocument()
  })

  it('validates positive integer quantities before review', async () => {
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.change(screen.getByLabelText('Quantity for Mango'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review sale' }))
    expect(screen.getByRole('alert')).toHaveTextContent('positive whole number')
    fireEvent.change(screen.getByLabelText('Quantity for Mango'), { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review sale' }))
    expect(screen.getByRole('alert')).toHaveTextContent('positive whole number')
    expect(salesApi.recordSale).not.toHaveBeenCalled()
  })

  it('submits a reviewed sale and shows the server receipt', async () => {
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.change(screen.getByLabelText('Quantity for Mango'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review sale' }))
    expect(await screen.findByRole('heading', { name: 'Review sale' })).toBeInTheDocument()
    expect(salesApi.recordSale).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Submit sale' }))
    expect(await screen.findByRole('heading', { name: 'Sale recorded' })).toBeInTheDocument()
    expect(screen.getByText('Server total').parentElement).toHaveTextContent('$85.00 MXN')
    expect(salesApi.recordSale).toHaveBeenCalledWith({ requestId: 'request-1', channel: 'pos', items: [{ productId: 'product-1', quantity: 2 }] })
  })

  it('recovers from a sale API error with an idempotent retry', async () => {
    vi.mocked(salesApi.recordSale).mockRejectedValueOnce(new Error('server')).mockResolvedValueOnce(receipt)
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.change(screen.getByLabelText('Quantity for Mango'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review sale' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Submit sale' }))
    expect(await screen.findByText('The sale could not be recorded. Try again.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry sale' }))
    expect(await screen.findByRole('heading', { name: 'Sale recorded' })).toBeInTheDocument()
    expect(salesApi.recordSale).toHaveBeenCalledTimes(2)
    const calls = vi.mocked(salesApi.recordSale).mock.calls
    expect(calls[0][0].requestId).toBe(calls[1][0].requestId)
  })
})
