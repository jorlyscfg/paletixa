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

const products: productApi.Product[] = [
  { id: 'product-1', name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' },
  { id: 'product-2', name: 'Strawberry', sku: 'S-02', category: 'Creams', retailPriceMxn: 28, wholesalePriceMxn: 22, active: true, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' },
]
const receipt: salesApi.SaleReceipt = { id: 'sale-1', channel: 'pos', totalMxn: 85, createdAt: '2026-08-20T00:00:00Z', replayed: false }
const renderProtected = () => render(<AdminBoundary><SalesWorkspace /></AdminBoundary>)

describe('sales workspace', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(authApi.getAdminAccess).mockResolvedValue(true)
    vi.mocked(productApi.listProducts).mockResolvedValue(products)
    vi.mocked(salesApi.recordSale).mockResolvedValue(receipt)
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'request-1') })
  })

  it('does not load protected products when admin access is denied', async () => {
    vi.mocked(authApi.getAdminAccess).mockResolvedValue(false)
    renderProtected()
    expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument()
    expect(productApi.listProducts).not.toHaveBeenCalled()
  })

  it('shows an empty active catalog', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([])
    renderProtected()
    expect(await screen.findByText('No hay productos activos en el catálogo. Agrega un producto activo antes de registrar una venta.')).toBeInTheDocument()
  })

  it('recovers when the catalog request fails', async () => {
    vi.mocked(productApi.listProducts).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(products)
    renderProtected()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los productos.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(productApi.listProducts).toHaveBeenCalledTimes(2)
  })

  it('searches the catalog and filters by category', async () => {
    renderProtected()
    expect(await screen.findByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Strawberry' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'straw' } })
    expect(screen.queryByRole('heading', { name: 'Mango' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Strawberry' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Paletas' }))
    expect(screen.getByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Strawberry' })).not.toBeInTheDocument()
  })

  it('changes channels and displays the active channel price', async () => {
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    expect(screen.getAllByText(/Precio de menudeo/).some((element) => element.textContent?.includes('$42.50 MXN'))).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Mayoristas' }))
    expect(screen.getAllByText(/Precio de mayoreo/).some((element) => element.textContent?.includes('$35.00 MXN'))).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Eventos' }))
    expect(screen.getAllByText(/Precio de menudeo/).some((element) => element.textContent?.includes('$42.50 MXN'))).toBe(true)
  })

  it('changes cart quantities with touch-sized stepper controls', async () => {
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    expect(screen.getByLabelText('Cantidad de Mango')).toHaveValue('1')
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Mango' }))
    expect(screen.getByLabelText('Cantidad de Mango')).toHaveValue('2')
    fireEvent.click(screen.getByRole('button', { name: 'Disminuir cantidad de Mango' }))
    expect(screen.getByLabelText('Cantidad de Mango')).toHaveValue('1')
  })

  it('validates positive integer quantities before review', async () => {
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    fireEvent.change(screen.getByLabelText('Cantidad de Mango'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar venta' }))
    expect(screen.getByRole('alert')).toHaveTextContent('número entero positivo')
    fireEvent.change(screen.getByLabelText('Cantidad de Mango'), { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar venta' }))
    expect(screen.getByRole('alert')).toHaveTextContent('número entero positivo')
    expect(salesApi.recordSale).not.toHaveBeenCalled()
  })

  it('submits a reviewed sale and shows the server receipt', async () => {
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Mango' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar venta' }))
    expect(await screen.findByRole('heading', { name: 'Revisar venta' })).toBeInTheDocument()
    expect(salesApi.recordSale).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }))
    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument()
    expect(screen.getByText('Total confirmado').parentElement).toHaveTextContent('$85.00 MXN')
    expect(salesApi.recordSale).toHaveBeenCalledWith({ requestId: 'request-1', channel: 'pos', items: [{ productId: 'product-1', quantity: 2 }] })
  })

  it('recovers from a sale API error with an idempotent retry', async () => {
    vi.mocked(salesApi.recordSale).mockRejectedValueOnce(new Error('server')).mockResolvedValueOnce(receipt)
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar venta' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar venta' }))
    expect(await screen.findByText('No se pudo registrar la venta. Inténtalo de nuevo.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar venta' }))
    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument()
    expect(salesApi.recordSale).toHaveBeenCalledTimes(2)
    const calls = vi.mocked(salesApi.recordSale).mock.calls
    expect(calls[0][0].requestId).toBe(calls[1][0].requestId)
  })
})
