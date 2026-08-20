import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminBoundary } from '../../auth/ui/AdminBoundary'
import * as authApi from '../../auth/api/adminAccess'
import * as productApi from '../api/products'
import { ProductWorkspace } from './ProductWorkspace'

vi.mock('../../auth/api/adminAccess', () => ({ getAdminAccess: vi.fn(), signIn: vi.fn() }))
vi.mock('../api/products', () => ({ listProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), deactivateProduct: vi.fn() }))

const product: productApi.Product = { id: 'product-1', name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }
const renderProtected = () => render(<AdminBoundary><ProductWorkspace /></AdminBoundary>)

describe('admin product workspace', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks(); vi.mocked(authApi.getAdminAccess).mockResolvedValue(true); vi.mocked(productApi.listProducts).mockResolvedValue([])
  })

  it('does not load protected products when admin access is denied', async () => {
    vi.mocked(authApi.getAdminAccess).mockResolvedValue(false)
    renderProtected()
    expect(await screen.findByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument()
    expect(productApi.listProducts).not.toHaveBeenCalled()
  })

  it('shows authorized loading and the empty catalog', async () => {
    let resolve!: (products: productApi.Product[]) => void
    vi.mocked(productApi.listProducts).mockReturnValue(new Promise((done) => { resolve = done }))
    renderProtected()
    expect(await screen.findByText('Loading products…')).toHaveAttribute('role', 'status')
    resolve([])
    expect(await screen.findByText('No products yet. Add the first product to start the shared catalog.')).toBeInTheDocument()
  })

  it('creates a product from the catalog form', async () => {
    vi.mocked(productApi.createProduct).mockResolvedValue(product)
    renderProtected(); await screen.findByText('No products yet. Add the first product to start the shared catalog.')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mango' } }); fireEvent.change(screen.getByLabelText('SKU / code'), { target: { value: 'M-01' } }); fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Paletas' } }); fireEvent.change(screen.getByLabelText('Retail price (MXN)'), { target: { value: '42.5' } }); fireEvent.change(screen.getByLabelText('Wholesale price (MXN)'), { target: { value: '35' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Create product' }))
    expect(await screen.findByText('Product created.')).toBeInTheDocument(); expect(productApi.createProduct).toHaveBeenCalledWith({ name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true })
  })

  it('updates and deactivates an existing product', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product]); vi.mocked(productApi.updateProduct).mockResolvedValue({ ...product, name: 'Mango Grande' }); vi.mocked(productApi.deactivateProduct).mockResolvedValue({ ...product, active: false })
    renderProtected(); await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' })); fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mango Grande' } }); fireEvent.submit(screen.getByRole('form', { name: 'Edit Mango' }))
    expect(await screen.findByText('Product updated.')).toBeInTheDocument(); expect(productApi.updateProduct).toHaveBeenCalledWith('product-1', expect.objectContaining({ name: 'Mango Grande' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' })); expect(await screen.findByText('Product deactivated.')).toBeInTheDocument(); expect(productApi.deactivateProduct).toHaveBeenCalledWith('product-1')
  })
})
