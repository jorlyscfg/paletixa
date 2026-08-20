import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminBoundary } from '../../auth/ui/AdminBoundary'
import * as authApi from '../../auth/api/adminAccess'
import * as productApi from '../api/products'
import { ProductWorkspace } from './ProductWorkspace'

vi.mock('../../auth/api/adminAccess', () => ({ getAdminAccess: vi.fn(), signIn: vi.fn() }))
vi.mock('../api/products', () => ({ listProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), deactivateProduct: vi.fn() }))

const product: productApi.Product = { id: 'product-1', name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true, imageUrl: 'https://cdn.example.com/mango.jpg', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }
const renderProtected = () => render(<AdminBoundary><ProductWorkspace /></AdminBoundary>)

describe('admin product workspace', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks(); vi.mocked(authApi.getAdminAccess).mockResolvedValue(true); vi.mocked(productApi.listProducts).mockResolvedValue([])
  })

  it('does not load protected products when admin access is denied', async () => {
    vi.mocked(authApi.getAdminAccess).mockResolvedValue(false)
    renderProtected()
    expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument()
    expect(productApi.listProducts).not.toHaveBeenCalled()
  })

  it('shows authorized loading and the empty catalog', async () => {
    let resolve!: (products: productApi.Product[]) => void
    vi.mocked(productApi.listProducts).mockReturnValue(new Promise((done) => { resolve = done }))
    renderProtected()
    expect(await screen.findByText('Cargando productos…')).toHaveAttribute('role', 'status')
    resolve([])
    expect(await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')).toBeInTheDocument()
  })

  it('filters catalog cards by search terms and category', async () => {
    const strawberry: productApi.Product = { ...product, id: 'product-2', name: 'Strawberry', sku: 'S-02', category: 'Ice cream', imageUrl: null, active: false }
    vi.mocked(productApi.listProducts).mockResolvedValue([product, strawberry])
    renderProtected()

    expect(await screen.findByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Strawberry' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Imagen de Mango' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Imagen de Mango' })).toHaveAttribute('src', 'https://cdn.example.com/mango.jpg')
    expect(screen.getByRole('img', { name: 'Imagen de Strawberry' })).toHaveAttribute('aria-label', 'Imagen de Strawberry')
    expect(screen.getAllByText('$42.50 MXN')).toHaveLength(2)
    expect(screen.getAllByText('$35.00 MXN')).toHaveLength(2)
    expect(screen.getByText('Inactivo')).toBeInTheDocument()

    const search = screen.getByRole('searchbox', { name: 'Buscar productos' })
    fireEvent.change(search, { target: { value: 'straw' } })
    expect(screen.getByRole('heading', { name: 'Strawberry' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mango' })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Filtrar por Ice cream' }))
    expect(screen.getByRole('heading', { name: 'Strawberry' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mango' })).not.toBeInTheDocument()
  })

  it('creates a product from the catalog form', async () => {
    vi.mocked(productApi.createProduct).mockResolvedValue(product)
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mango' } }); fireEvent.change(screen.getByLabelText('SKU / código'), { target: { value: 'M-01' } }); fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Paletas' } }); fireEvent.change(screen.getByLabelText('Precio de menudeo (MXN)'), { target: { value: '42.5' } }); fireEvent.change(screen.getByLabelText('Precio mayorista (MXN)'), { target: { value: '35' } }); fireEvent.change(screen.getByLabelText('URL de imagen (opcional)'), { target: { value: 'https://cdn.example.com/mango.jpg' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Crear producto' }))
    expect(await screen.findByText('Producto creado.')).toBeInTheDocument(); expect(productApi.createProduct).toHaveBeenCalledWith({ name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42.5, wholesalePriceMxn: 35, imageUrl: 'https://cdn.example.com/mango.jpg', active: true })
  })

  it('updates and deactivates an existing product', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product]); vi.mocked(productApi.updateProduct).mockResolvedValue({ ...product, name: 'Mango Grande' }); vi.mocked(productApi.deactivateProduct).mockResolvedValue({ ...product, active: false })
    renderProtected(); await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar Mango' })); fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mango Grande' } }); fireEvent.submit(screen.getByRole('form', { name: 'Editar Mango' }))
    expect(await screen.findByText('Producto actualizado.')).toBeInTheDocument(); expect(productApi.updateProduct).toHaveBeenCalledWith('product-1', expect.objectContaining({ name: 'Mango Grande' }))
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar Mango Grande' })); expect(await screen.findByText('Producto desactivado.')).toBeInTheDocument(); expect(productApi.deactivateProduct).toHaveBeenCalledWith('product-1')
  })
})
