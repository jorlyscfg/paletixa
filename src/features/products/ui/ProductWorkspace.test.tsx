import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminBoundary } from '../../auth/ui/AdminBoundary'
import * as authApi from '../../auth/api/adminAccess'
import * as productApi from '../api/products'
import { ProductWorkspace } from './ProductWorkspace'

vi.mock('../../auth/api/adminAccess', () => ({ getAdminAccess: vi.fn(), signIn: vi.fn() }))
vi.mock('../api/products', () => ({
  listProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deactivateProduct: vi.fn(),
  replaceProductImage: vi.fn(),
  removeProductImage: vi.fn(),
  normalizeProductTags: (value: unknown) => Array.isArray(value) ? value.map((tag) => String(tag).trim()).filter(Boolean) : [],
  MAX_PRODUCT_TAG_LENGTH: 48,
  MAX_PRODUCT_TAGS: 20,
  PRODUCT_IMAGE_MAX_BYTES: 5 * 1024 * 1024,
  PRODUCT_IMAGE_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
}))

const product: productApi.Product = { id: 'product-1', name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true, tags: ['fruta', 'con chile'], imageUrl: 'https://cdn.example.com/mango.jpg', imageKey: 'products/product-1/mango.jpg', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }
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
    expect(screen.queryByRole('form', { name: 'Crear producto' })).not.toBeInTheDocument()
    resolve([])
    expect(await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Crear producto' })).not.toBeInTheDocument()
  })

  it('opens the product form from the header and closes it with Escape, close, or Cancel', async () => {
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    expect(screen.getByRole('heading', { name: 'Productos' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar productos' }).closest('header')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Agregar producto' })).toHaveTextContent('+')
    expect(screen.queryByRole('form', { name: 'Crear producto' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    const dialog = screen.getByRole('dialog', { name: 'Agregar producto' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Agregar producto' })).toBeInTheDocument()
    expect(screen.queryByText('Configuración del catálogo')).not.toBeInTheDocument()
    expect(screen.queryByText('Mantén el catálogo compartido listo para Punto de venta, Mayoristas y Eventos.')).not.toBeInTheDocument()
    expect(dialog).toHaveClass('flex', 'min-h-0', 'flex-col', 'overflow-hidden')
    expect(dialog).not.toHaveClass('overflow-y-auto')
    expect(dialog.querySelector('.min-h-0.flex-1.overflow-y-auto.overscroll-contain')).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Agregar producto' })).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar formulario de producto' }))
    expect(screen.queryByRole('dialog', { name: 'Agregar producto' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog', { name: 'Agregar producto' })).not.toBeInTheDocument()
  })

  it('filters catalog cards by search terms and category', async () => {
    const strawberry: productApi.Product = { ...product, id: 'product-2', name: 'Strawberry', sku: 'S-02', category: 'Ice cream', tags: [], imageUrl: null, imageKey: null, active: false }
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
    expect(screen.getByText('con chile')).toBeInTheDocument()

    const search = screen.getByRole('searchbox', { name: 'Buscar productos' })
    expect(search.closest('header')).not.toBeNull()
    fireEvent.change(search, { target: { value: 'straw' } })
    expect(screen.getByRole('heading', { name: 'Strawberry' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mango' })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'chile' } })
    expect(screen.getByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Strawberry' })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Filtrar por Ice cream' }))
    expect(screen.getByRole('heading', { name: 'Strawberry' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mango' })).not.toBeInTheDocument()
  })

  it('creates a product from the catalog form', async () => {
    vi.mocked(productApi.createProduct).mockResolvedValue(product)
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mango' } }); fireEvent.change(screen.getByLabelText('SKU / código'), { target: { value: 'M-01' } }); fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Paletas' } }); fireEvent.change(screen.getByLabelText('Precio de menudeo (MXN)'), { target: { value: '42.5' } }); fireEvent.change(screen.getByLabelText('Precio mayorista (MXN)'), { target: { value: '35' } }); fireEvent.change(screen.getByLabelText('Etiquetas'), { target: { value: 'fruta' } }); fireEvent.keyDown(screen.getByLabelText('Etiquetas'), { key: 'Enter' })
    fireEvent.submit(screen.getByRole('form', { name: 'Crear producto' }))
    expect(await screen.findByText('Producto creado.')).toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(productApi.createProduct).toHaveBeenCalledWith({ name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42.5, wholesalePriceMxn: 35, tags: ['fruta'], active: true })
  })

  it('updates and deactivates an existing product', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product]); vi.mocked(productApi.updateProduct).mockResolvedValue({ ...product, name: 'Mango Grande' }); vi.mocked(productApi.deactivateProduct).mockResolvedValue({ ...product, active: false })
    renderProtected(); await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar Mango' })); expect(screen.getByRole('dialog', { name: 'Editar producto' })).toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'Editar producto' })).toBeInTheDocument(); fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mango Grande' } }); fireEvent.submit(screen.getByRole('form', { name: 'Editar Mango' }))
    expect(await screen.findByText('Producto actualizado.')).toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(productApi.updateProduct).toHaveBeenCalledWith('product-1', expect.objectContaining({ name: 'Mango Grande' }))
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar Mango Grande' })); expect(await screen.findByText('Producto desactivado.')).toBeInTheDocument(); expect(productApi.deactivateProduct).toHaveBeenCalledWith('product-1')
  })

  it('selects an image for preview and replaces it only after saving', async () => {
    const created = { ...product, imageUrl: null, imageKey: null, tags: [] }
    const uploaded = { ...created, imageUrl: 'https://storage.example.com/mango.webp', imageKey: 'products/product-1/new.webp' }
    vi.mocked(productApi.createProduct).mockResolvedValue(created)
    vi.mocked(productApi.replaceProductImage).mockResolvedValue(uploaded)
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))

    const file = new File(['image'], 'mango.webp', { type: 'image/webp' })
    fireEvent.change(screen.getByLabelText('Seleccionar imagen'), { target: { files: [file] } })
    expect(await screen.findByText('Lista para guardar: mango.webp')).toBeInTheDocument()
    fireEvent.submit(screen.getByRole('form', { name: 'Crear producto' }))

    expect(await screen.findByText('Producto creado.')).toBeInTheDocument()
    expect(productApi.replaceProductImage).toHaveBeenCalledWith('product-1', created, file)
  })

  it('shows a validation error for unsupported image files', async () => {
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    fireEvent.change(screen.getByLabelText('Seleccionar imagen'), { target: { files: [new File(['svg'], 'mango.svg', { type: 'image/svg+xml' })] } })
    expect(screen.getByRole('alert', { name: '' })).toHaveTextContent('Selecciona una imagen JPEG, PNG o WebP.')
    expect(productApi.createProduct).not.toHaveBeenCalled()
  })

  it('marks an existing image for removal and calls the explicit lifecycle operation', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product])
    vi.mocked(productApi.updateProduct).mockResolvedValue(product)
    vi.mocked(productApi.removeProductImage).mockResolvedValue({ ...product, imageUrl: null, imageKey: null })
    renderProtected(); await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar Mango' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar imagen' }))
    fireEvent.submit(screen.getByRole('form', { name: 'Editar Mango' }))

    expect(await screen.findByText('Producto actualizado.')).toBeInTheDocument()
    expect(productApi.removeProductImage).toHaveBeenCalledWith('product-1', product)
  })
})
