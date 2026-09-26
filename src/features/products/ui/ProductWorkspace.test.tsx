import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminBoundary } from '../../auth/ui/AdminBoundary'
import * as authApi from '../../auth/api/adminAccess'
import { normalizeCapitalizedText } from '../../../lib/textNormalization'
import * as categoryApi from '../api/productCategories'
import { normalizeSku, suggestUniqueProductSku } from '../api/productSku'
import * as tagApi from '../api/productTags'
import * as productApi from '../api/products'
import { ProductWorkspace } from './ProductWorkspace'

vi.mock('../../auth/api/adminAccess', () => ({ getAccessContext: vi.fn(), signIn: vi.fn() }))
vi.mock('../api/productCategories', () => ({
  listProductCategories: vi.fn(),
  createProductCategory: vi.fn(),
  updateProductCategory: vi.fn(),
  deleteProductCategory: vi.fn(),
  getProductCategoryErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'No se pudo actualizar la categoría.',
}))
vi.mock('../api/productTags', () => ({ listProductTags: vi.fn() }))
vi.mock('../api/products', () => ({
  listProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deactivateProduct: vi.fn(),
  replaceProductImage: vi.fn(),
  removeProductImage: vi.fn(),
  MAX_PRODUCT_SKU_LENGTH: 80,
  normalizeSku,
  suggestUniqueProductSku,
  normalizeProductTags: (value: unknown) => {
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    return value.map((tag) => normalizeCapitalizedText(String(tag))).filter((tag) => tag !== '' && !seen.has(tag.toLocaleLowerCase()) && seen.add(tag.toLocaleLowerCase()))
  },
  MAX_PRODUCT_TAG_LENGTH: 48,
  MAX_PRODUCT_TAGS: 20,
  PRODUCT_IMAGE_MAX_BYTES: 5 * 1024 * 1024,
  PRODUCT_IMAGE_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
}))

const category: categoryApi.ProductCategory = { id: 'category-1', name: 'Paletas', normalizedName: 'paletas', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }
const productTag: tagApi.ProductTag = { id: 'tag-1', name: 'Mango', normalizedName: 'mango', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }
const product: productApi.Product = { id: 'product-1', name: 'Mango', sku: 'M-01', category: 'Paletas', categoryId: category.id, retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true, tags: ['fruta', 'con chile'], imageUrl: 'https://cdn.example.com/mango.jpg', imageKey: 'products/product-1/mango.jpg', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }
const renderProtected = () => render(<AdminBoundary><ProductWorkspace /></AdminBoundary>)

describe('admin product workspace', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks(); vi.mocked(authApi.getAccessContext).mockResolvedValue({ role: 'admin', userId: 'admin-1', displayName: null, capabilities: ['catalog.manage'], branch: null }); vi.mocked(productApi.listProducts).mockResolvedValue([]); vi.mocked(categoryApi.listProductCategories).mockResolvedValue([category]); vi.mocked(tagApi.listProductTags).mockResolvedValue([productTag])
  })

  it('does not load protected products when admin access is denied', async () => {
    vi.mocked(authApi.getAccessContext).mockResolvedValue(null)
    renderProtected()
    expect(await screen.findByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
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

  it('opens the product form from the header and closes it with Escape or the header close action', async () => {
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    const search = screen.getByRole('searchbox', { name: 'Buscar productos' })
    const addButton = screen.getByRole('button', { name: 'Agregar producto' })
    const controls = search.parentElement?.parentElement
    expect(search.closest('header')).not.toBeNull()
    expect(controls).toHaveClass('flex', 'w-full', 'min-w-0', 'items-center', 'gap-3')
    expect(controls).not.toHaveClass('flex-col', 'sm:flex-row')
    expect(search.parentElement).toHaveClass('min-w-0', 'flex-1')
    expect(addButton).toHaveClass('h-11', 'w-11', 'min-h-11', 'min-w-11', 'px-0', 'shrink-0')
    expect(addButton.querySelector('[data-icon="plus"]')).toBeInTheDocument()
    expect(addButton).not.toHaveTextContent('Agregar producto')
    expect(addButton).toHaveAttribute('title', 'Agregar producto')
    expect(screen.queryByRole('form', { name: 'Crear producto' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    const dialog = screen.getByRole('dialog', { name: 'Agregar producto' })
    const heading = screen.getByRole('heading', { name: 'Agregar producto' })
    const modalHeader = heading.closest('header')
    expect(dialog).toBeInTheDocument()
    expect(heading).toBeInTheDocument()
    expect(modalHeader).toHaveClass('flex', 'shrink-0', 'gap-3')
    expect(modalHeader).toHaveAttribute('data-modal-header', 'true')
    expect(modalHeader?.querySelector('[data-modal-header-actions]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Crear producto' }).closest('header')).toBe(modalHeader)
    expect(screen.getByRole('button', { name: 'Crear producto' })).toHaveAttribute('form', 'product-form')
    expect(screen.getByRole('form', { name: 'Crear producto' })).toHaveAttribute('id', 'product-form')
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Crear producto' })).not.toContainElement(heading)
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

  })

  it('filters category options, supports keyboard selection, and rejects unselected text', async () => {
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    const categoryInput = screen.getByLabelText('Categoría')
    expect(screen.queryByRole('listbox', { name: 'Categorías disponibles' })).not.toBeInTheDocument()
    fireEvent.focus(categoryInput)
    expect(screen.queryByRole('listbox', { name: 'Categorías disponibles' })).not.toBeInTheDocument()
    fireEvent.change(categoryInput, { target: { value: '  pal   ' } })
    const categoryList = screen.getByRole('listbox', { name: 'Categorías disponibles' })
    expect(categoryList.closest('[data-floating-layer]')?.parentElement).toBe(document.body)
    expect(categoryList.closest('[data-floating-layer]')).toHaveStyle({ position: 'fixed', zIndex: '70' })
    expect(screen.getByRole('option', { name: 'Paletas' })).toHaveClass('ops-option')
    fireEvent.keyDown(categoryInput, { key: 'ArrowDown' })
    fireEvent.keyDown(categoryInput, { key: 'Enter' })
    expect(categoryInput).toHaveValue('Paletas')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    fireEvent.blur(categoryInput)
    expect(screen.queryByRole('listbox', { name: 'Categorías disponibles' })).not.toBeInTheDocument()

    fireEvent.change(categoryInput, { target: { value: 'No existe' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mango' } })
    fireEvent.change(screen.getByLabelText('SKU / código'), { target: { value: 'M-01' } })
    fireEvent.change(screen.getByLabelText('Precio de menudeo'), { target: { value: '42' } })
    fireEvent.change(screen.getByLabelText('Precio mayorista'), { target: { value: '35' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Crear producto' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona una categoría existente de la lista antes de guardar.')
    expect(productApi.createProduct).not.toHaveBeenCalled()
  })

  it('shows tag suggestions only while focused with text and keeps multiple selected chips', async () => {
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    const tagInput = screen.getByLabelText('Etiquetas')
    expect(screen.queryByRole('listbox', { name: 'Etiquetas disponibles' })).not.toBeInTheDocument()

    fireEvent.focus(tagInput)
    expect(screen.queryByRole('listbox', { name: 'Etiquetas disponibles' })).not.toBeInTheDocument()
    fireEvent.change(tagInput, { target: { value: 'man' } })
    const tagList = screen.getByRole('listbox', { name: 'Etiquetas disponibles' })
    expect(tagList.closest('[data-floating-layer]')?.parentElement).toBe(document.body)
    expect(tagList.closest('[data-floating-layer]')).toHaveStyle({ position: 'fixed', zIndex: '70' })
    expect(screen.getByRole('option', { name: 'Mango' })).toHaveClass('ops-option')
    fireEvent.keyDown(tagInput, { key: 'ArrowDown' }); fireEvent.keyDown(tagInput, { key: 'Enter' })
    expect(screen.getByLabelText('Etiquetas seleccionadas')).toHaveTextContent('Mango')

    fireEvent.change(tagInput, { target: { value: 'mANGO  CON   CHILE' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    expect(screen.getByLabelText('Etiquetas seleccionadas')).toHaveTextContent('Mango con chile')
    expect(screen.getByLabelText('Etiquetas seleccionadas').querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Quitar etiqueta Mango' })).toHaveClass('ops-icon-button', 'border-transparent', 'bg-transparent', 'hover:border-transparent', 'hover:bg-transparent', 'active:bg-transparent')
    fireEvent.blur(tagInput)
    expect(screen.queryByRole('listbox', { name: 'Etiquetas disponibles' })).not.toBeInTheDocument()
  })

  it('keeps product text controls and autocomplete actions at the 44px minimum', async () => {
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    const productForm = screen.getByRole('form', { name: 'Crear producto' })
    expect(productForm).toHaveClass('grid', 'gap-4')
    const fieldGrid = productForm.firstElementChild as HTMLElement
    expect(fieldGrid).toHaveClass('grid', 'gap-3', 'sm:grid-cols-2')
    expect(fieldGrid.children).toHaveLength(6)
    expect(fieldGrid.children[0]).toContainElement(screen.getByLabelText('Nombre'))
    expect(fieldGrid.children[1]).toContainElement(screen.getByLabelText('SKU / código'))
    expect(fieldGrid.children[2]).toContainElement(screen.getByLabelText('Categoría'))
    expect(fieldGrid.children[3]).toContainElement(screen.getByLabelText('Precio de menudeo'))
    expect(fieldGrid.children[4]).toContainElement(screen.getByLabelText('Precio mayorista'))
    expect(fieldGrid.children[5]).toContainElement(screen.getByLabelText('Etiquetas'))
    expect(fieldGrid).toHaveClass('sm:grid-cols-2')
    expect(fieldGrid.children[4]).toHaveClass('grid', 'content-start', 'gap-1.5')
    expect(fieldGrid.children[5]).toHaveClass('grid', 'content-start', 'gap-1.5', 'sm:col-span-2', 'lg:col-span-1')
    for (const label of ['Información sobre SKU', 'Información sobre categoría', 'Información sobre precio mayorista', 'Información sobre etiquetas']) {
      expect(screen.getByRole('button', { name: label })).toHaveClass('h-5', 'w-5', 'min-h-5', 'min-w-5', 'p-0')
    }
    expect(screen.getByLabelText('Nombre').parentElement).toHaveClass('gap-1.5')
    for (const label of ['Nombre', 'SKU / código', 'Categoría', 'Precio de menudeo', 'Precio mayorista', 'Etiquetas']) {
      expect(screen.getByLabelText(label)).toHaveClass('ops-control')
    }
    expect(screen.getByLabelText('Precio de menudeo')).toHaveAttribute('min', '0.01')
    expect(screen.getByLabelText('Precio mayorista')).toHaveAttribute('min', '0')
    expect(screen.getByLabelText('Precio mayorista')).not.toHaveAttribute('required')
    expect(screen.getByLabelText('Precio de menudeo')).toHaveAttribute('step', '0.01')
    expect(screen.getByLabelText('Precio mayorista')).toHaveAttribute('step', '0.01')
    const categoryButton = screen.getByRole('button', { name: 'Administrar categorías' })
    expect(categoryButton).toHaveClass('ops-icon-button', 'border-transparent', 'bg-transparent', 'hover:border-transparent', 'hover:bg-transparent', 'active:bg-transparent')
    const closeButton = screen.getByRole('button', { name: 'Cerrar formulario de producto' })
    expect(closeButton).toHaveClass('ops-icon-button')
    expect((screen.getByLabelText('Precio de menudeo') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Precio mayorista') as HTMLInputElement).value).toBe('')
    fireEvent.change(screen.getByLabelText('Precio de menudeo'), { target: { value: '42' } })
    expect((screen.getByLabelText('Precio de menudeo') as HTMLInputElement).value).toBe('42')
    const addTagButton = screen.getByRole('button', { name: 'Agregar etiqueta' })
    expect(addTagButton).toHaveClass('ops-icon-button', 'border-transparent', 'bg-transparent', 'absolute', 'right-1', 'top-1/2', '-translate-y-1/2')
    expect(addTagButton.parentElement).toBe(screen.getByLabelText('Etiquetas').parentElement)
    expect(screen.getByLabelText('Etiquetas')).toHaveClass('pr-14')
    expect(addTagButton.querySelector('[data-icon="plus"]')).toBeInTheDocument()
  })

  it('moves the wholesale price and tag guidance into exact adjacent info tooltips', async () => {
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))

    const wholesaleHelp = screen.getByRole('button', { name: 'Información sobre precio mayorista' })
    const tagHelp = screen.getByRole('button', { name: 'Información sobre etiquetas' })
    const wholesaleText = 'El precio de menudeo debe ser mayor que cero. El precio mayorista es opcional: deja el campo vacío o usa 0 si aún no está definido; no puede ser negativo. Los importes positivos deben ser de al menos $0.01.'
    const tagText = 'Usa etiquetas libres para familias como paletas, eskimos, bolis, nieves en vaso, aguas frescas o sandwiches, además de sabores, presentaciones y atributos. Hasta 20 etiquetas de 48 caracteres.'

    expect(wholesaleHelp.parentElement?.previousElementSibling).toHaveTextContent('Precio mayorista')
    expect(tagHelp.parentElement?.previousElementSibling).toHaveTextContent('Etiquetas')
    expect(screen.queryByText(wholesaleText)).not.toBeInTheDocument()
    expect(screen.queryByText(tagText)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Precio mayorista')).not.toHaveAttribute('aria-describedby')
    expect(screen.getByLabelText('Etiquetas')).not.toHaveAttribute('aria-describedby')

    fireEvent.click(wholesaleHelp)
    expect(screen.getByRole('tooltip').textContent).toBe(wholesaleText)
    fireEvent.click(wholesaleHelp)
    fireEvent.click(tagHelp)
    expect(screen.getByRole('tooltip').textContent).toBe(tagText)
  })

  it('moves SKU and category guidance into exact adjacent info tooltips', async () => {
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))

    const skuHelp = screen.getByRole('button', { name: 'Información sobre SKU' })
    const categoryHelp = screen.getByRole('button', { name: 'Información sobre categoría' })
    const skuText = 'Se sugiere con la categoría, el nombre y las etiquetas; puedes editarlo.'
    const categoryText = 'Escribe para filtrar y selecciona una categoría existente.'

    expect(skuHelp.parentElement?.previousElementSibling).toHaveTextContent('SKU / código')
    expect(categoryHelp.parentElement?.previousElementSibling).toHaveTextContent('Categoría')
    expect(screen.queryByText(skuText)).not.toBeInTheDocument()
    expect(screen.queryByText(categoryText)).not.toBeInTheDocument()
    expect(screen.getByLabelText('SKU / código')).not.toHaveAttribute('aria-describedby')
    expect(screen.getByLabelText('Categoría')).not.toHaveAttribute('aria-describedby')

    fireEvent.click(skuHelp)
    expect(screen.getByRole('tooltip')).toHaveTextContent(skuText)
    fireEvent.click(skuHelp)
    fireEvent.click(categoryHelp)
    expect(screen.getByRole('tooltip')).toHaveTextContent(categoryText)
  })

  it('keeps the saved SKU guidance when editing a product', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product])
    renderProtected(); await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar Mango' }))

    const skuHelp = screen.getByRole('button', { name: 'Información sobre SKU' })
    const skuText = 'Se conserva el SKU guardado; puedes editarlo.'
    expect(screen.queryByText(skuText)).not.toBeInTheDocument()
    fireEvent.click(skuHelp)
    expect(screen.getByRole('tooltip')).toHaveTextContent(skuText)
  })

  it('shows a specific accessible error when prices are not positive', async () => {
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mango' } })
    fireEvent.focus(screen.getByLabelText('Categoría')); fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'pal' } }); fireEvent.click(screen.getByRole('option', { name: 'Paletas' }))
    fireEvent.change(screen.getByLabelText('Precio mayorista'), { target: { value: '35' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Crear producto' }))
    expect(screen.getByRole('alert')).toHaveTextContent('El precio de menudeo debe ser mayor que cero.')
    expect(productApi.createProduct).not.toHaveBeenCalled()
  })

  it('accepts a blank wholesale price and sends the zero sentinel', async () => {
    vi.mocked(productApi.createProduct).mockResolvedValue(product)
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mango' } })
    fireEvent.focus(screen.getByLabelText('Categoría')); fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'pal' } }); fireEvent.click(screen.getByRole('option', { name: 'Paletas' }))
    fireEvent.change(screen.getByLabelText('Precio de menudeo'), { target: { value: '42' } })
    expect((screen.getByLabelText('Precio mayorista') as HTMLInputElement).value).toBe('')
    fireEvent.submit(screen.getByRole('form', { name: 'Crear producto' }))

    expect(await screen.findByText('Producto creado.')).toBeInTheDocument()
    expect(productApi.createProduct).toHaveBeenCalledWith(expect.objectContaining({ retailPriceMxn: 42, wholesalePriceMxn: 0 }))
  })

  it('rejects negative wholesale prices with actionable copy', async () => {
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mango' } })
    fireEvent.focus(screen.getByLabelText('Categoría')); fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'pal' } }); fireEvent.click(screen.getByRole('option', { name: 'Paletas' }))
    fireEvent.change(screen.getByLabelText('Precio de menudeo'), { target: { value: '42' } })
    fireEvent.change(screen.getByLabelText('Precio mayorista'), { target: { value: '-1' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Crear producto' }))

    expect(screen.getByRole('alert')).toHaveTextContent('El precio mayorista puede quedar vacío o ser 0, pero no puede ser negativo')
    expect(screen.getByRole('alert')).toHaveTextContent('debe ser de al menos $0.01')
    expect(productApi.createProduct).not.toHaveBeenCalled()
  })

  it('suggests a collision-safe SKU and preserves a manual override', async () => {
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mango' } })
    fireEvent.focus(screen.getByLabelText('Categoría')); fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'pal' } }); fireEvent.click(screen.getByRole('option', { name: 'Paletas' }))
    fireEvent.change(screen.getByLabelText('Etiquetas'), { target: { value: 'chile' } }); fireEvent.keyDown(screen.getByLabelText('Etiquetas'), { key: 'Enter' })
    expect(screen.getByLabelText('SKU / código')).toHaveValue('PAL-MAN-CHI')
    const skuHelp = screen.getByRole('button', { name: 'Información sobre SKU' })
    expect(screen.queryByText('Se sugiere con la categoría, el nombre y las etiquetas; puedes editarlo.')).not.toBeInTheDocument()
    fireEvent.click(skuHelp)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Se sugiere con la categoría, el nombre y las etiquetas; puedes editarlo.')
    fireEvent.click(skuHelp)
    fireEvent.change(screen.getByLabelText('SKU / código'), { target: { value: 'manual sku' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mango grande' } })
    expect(screen.getByLabelText('SKU / código')).toHaveValue('manual sku')
  })

  it('opens the category manager as a sibling modal and closes only the top layer with Escape', async () => {
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Administrar categorías' }))
    expect(screen.getByRole('dialog', { name: 'Agregar producto' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Administrar categorías' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText('Nueva categoría'), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Administrar categorías' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Agregar producto' })).toBeInTheDocument()
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
    expect(screen.getAllByText('$42.50')).toHaveLength(2)
    expect(screen.getAllByText('$35.00')).toHaveLength(2)
    expect(screen.getByRole('status', { name: 'Inactivo Strawberry' })).toBeInTheDocument()
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

  it('keeps product card actions side-by-side with mobile icon controls and accessible labels', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product])
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })

    const card = screen.getByRole('heading', { name: 'Mango' }).closest('li')
    expect(card).not.toBeNull()
     const actionGrid = card?.querySelector('.mt-3.flex.justify-end.gap-2')
     expect(actionGrid).not.toBeNull()
     expect(card).toHaveClass('rounded-2xl', 'p-3')
     expect(card?.querySelector('img, [role="img"]')?.parentElement).toHaveClass('mb-3')

    const actions = within(actionGrid as HTMLElement)
    const editButton = actions.getByRole('button', { name: 'Editar Mango' })
    const toggleButton = actions.getByRole('button', { name: 'Desactivar Mango' })
    for (const button of [editButton, toggleButton]) {
      expect(button).toHaveClass('h-11', 'w-11', 'min-h-11', 'min-w-11', 'px-0')
      expect(button).toHaveAttribute('title', button.getAttribute('aria-label'))
      expect(button).not.toHaveTextContent('Editar')
      expect(button).not.toHaveTextContent('Desactivar')
    }
    expect(editButton.querySelector('[data-icon="edit"]')).toBeInTheDocument()
    expect(toggleButton.querySelector('[data-icon="power"]')).toBeInTheDocument()
  })

  it('bounds the workspace, keeps catalog scrolling internal, and switches views without reloading', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product])
    renderProtected()
    expect(await screen.findByRole('heading', { name: 'Mango' })).toBeInTheDocument()

    const workspace = screen.getByRole('region', { name: 'Módulo Productos' })
    expect(workspace).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col', 'overflow-hidden')
    expect(workspace).toHaveClass('ops-workspace-frame', 'min-w-0')

    const categoryTabs = screen.getByTestId('product-category-tabs')
    expect(categoryTabs).toHaveClass('touch-pan-x', 'overflow-x-auto')

    const productList = screen.getByTestId('product-list-scroll')
    expect(productList).toHaveClass('min-h-0', 'flex-1', 'touch-pan-y', 'overflow-y-auto', 'overscroll-contain')
    expect(productList).toHaveClass('ops-scroll-region')
    expect(productList).not.toHaveClass('max-h-[min(32rem,calc(100dvh-22rem))]')
    expect([...productList.classList].filter((className) => className.startsWith('h-'))).toHaveLength(0)

    const updateButton = screen.getByRole('button', { name: 'Actualizar productos' })
    expect(updateButton).toHaveClass('h-11', 'w-11', 'min-h-11', 'min-w-11', 'px-0')
    expect(updateButton.querySelector('[data-icon="refresh"]')).toBeInTheDocument()
    expect(updateButton).not.toHaveTextContent('Actualizar productos')
    expect(updateButton).toHaveAttribute('title', 'Actualizar productos')

    const gridToggle = screen.getByRole('button', { name: 'Vista de tarjetas' })
    const tableToggle = screen.getByRole('button', { name: 'Vista de tabla' })
    expect(gridToggle).toHaveAttribute('aria-pressed', 'true')
    expect(tableToggle).toHaveAttribute('aria-pressed', 'false')
    expect(gridToggle).toHaveAttribute('title', 'Vista de tarjetas')
    expect(tableToggle).toHaveAttribute('title', 'Vista de tabla')
    expect(productApi.listProducts).toHaveBeenCalledTimes(1)

    fireEvent.click(tableToggle)
    expect(tableToggle).toHaveAttribute('aria-pressed', 'true')
    expect(gridToggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('table', { name: 'Catálogo de productos filtrados' })).toBeInTheDocument()
    expect(productApi.listProducts).toHaveBeenCalledTimes(1)

    fireEvent.click(gridToggle)
    expect(gridToggle).toHaveAttribute('aria-pressed', 'true')
    expect(tableToggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(productApi.listProducts).toHaveBeenCalledTimes(1)
  })

  it('maps mouse-wheel movement to overflowing category tabs without hijacking page scrolling', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product])
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })

    const categoryTabs = screen.getByTestId('product-category-tabs')
    Object.defineProperties(categoryTabs, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 600 },
    })
    const categoryButton = within(categoryTabs).getByRole('tab', { name: 'Filtrar por Todas las categorías' })
    const overflowingWheel = new Event('wheel', { bubbles: true, cancelable: true })
    Object.defineProperty(overflowingWheel, 'deltaY', { value: 120 })
    const overflowingPreventDefault = vi.fn()
    Object.defineProperty(overflowingWheel, 'preventDefault', { value: overflowingPreventDefault })
    categoryButton.dispatchEvent(overflowingWheel)

    expect(categoryTabs.scrollLeft).toBe(120)
    expect(overflowingPreventDefault).toHaveBeenCalledOnce()

    Object.defineProperty(categoryTabs, 'scrollWidth', { configurable: true, value: 200 })
    categoryTabs.scrollLeft = 0
    const pageWheel = new Event('wheel', { bubbles: true, cancelable: true })
    Object.defineProperty(pageWheel, 'deltaY', { value: 120 })
    const pagePreventDefault = vi.fn()
    Object.defineProperty(pageWheel, 'preventDefault', { value: pagePreventDefault })
    categoryButton.dispatchEvent(pageWheel)

    expect(categoryTabs.scrollLeft).toBe(0)
    expect(pagePreventDefault).not.toHaveBeenCalled()
  })

  it('drags an overflowing table from an internal cell and clamps its scroll position', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product])
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Vista de tabla' }))

    const tableWrapper = screen.getByTestId('products-table-wrapper')
    const table = screen.getByRole('table', { name: 'Catálogo de productos filtrados' })
    const internalCell = within(table).getByText('M-01')
    Object.defineProperties(tableWrapper, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 600 },
    })

    fireEvent.pointerDown(internalCell, { button: 0, pointerId: 12, pointerType: 'mouse', clientX: 180 })
    fireEvent.pointerMove(internalCell, { pointerId: 12, pointerType: 'mouse', clientX: 100 })
    fireEvent.pointerUp(internalCell, { button: 0, pointerId: 12, pointerType: 'mouse', clientX: 100 })

    expect(tableWrapper.scrollLeft).toBe(80)

    tableWrapper.scrollLeft = 0
    fireEvent.pointerDown(internalCell, { button: 0, pointerId: 13, pointerType: 'mouse', clientX: 180 })
    fireEvent.pointerMove(internalCell, { pointerId: 13, pointerType: 'mouse', clientX: 260 })
    fireEvent.pointerUp(internalCell, { button: 0, pointerId: 13, pointerType: 'mouse', clientX: 260 })

    expect(tableWrapper.scrollLeft).toBe(0)

    tableWrapper.scrollLeft = 400
    fireEvent.pointerDown(internalCell, { button: 0, pointerId: 14, pointerType: 'mouse', clientX: 180 })
    fireEvent.pointerMove(internalCell, { pointerId: 14, pointerType: 'mouse', clientX: 100 })
    fireEvent.pointerUp(internalCell, { button: 0, pointerId: 14, pointerType: 'mouse', clientX: 100 })

    expect(tableWrapper.scrollLeft).toBe(400)
  })

  it('drags an overflowing table on a primary touch pointer across both axes', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product])
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Vista de tabla' }))

    const tableWrapper = screen.getByTestId('products-table-wrapper')
    const table = screen.getByRole('table', { name: 'Catálogo de productos filtrados' })
    const internalCell = within(table).getByText('M-01')
    Object.defineProperties(tableWrapper, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 600 },
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 600 },
    })
    tableWrapper.scrollLeft = 50
    tableWrapper.scrollTop = 180

    fireEvent.pointerDown(internalCell, { button: 0, isPrimary: true, pointerId: 17, pointerType: 'touch', clientX: 180, clientY: 220 })
    fireEvent.pointerMove(internalCell, { isPrimary: true, pointerId: 17, pointerType: 'touch', clientX: 100, clientY: 140 })
    fireEvent.pointerUp(internalCell, { button: 0, isPrimary: true, pointerId: 17, pointerType: 'touch', clientX: 100, clientY: 140 })

    expect(tableWrapper.scrollLeft).toBe(130)
    expect(tableWrapper.scrollTop).toBe(260)
  })

  it('scrolls an overflowing table vertically from an internal cell and respects boundaries', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product])
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Vista de tabla' }))

    const tableWrapper = screen.getByTestId('products-table-wrapper')
    const table = screen.getByRole('table', { name: 'Catálogo de productos filtrados' })
    const internalCell = within(table).getByText('M-01')
    Object.defineProperties(tableWrapper, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 600 },
    })

    const advancingWheel = new Event('wheel', { bubbles: true, cancelable: true })
    const advancingPreventDefault = vi.fn()
    Object.defineProperty(advancingWheel, 'deltaY', { value: 120 })
    Object.defineProperty(advancingWheel, 'preventDefault', { value: advancingPreventDefault })
    internalCell.dispatchEvent(advancingWheel)
    expect(tableWrapper.scrollTop).toBe(120)
    expect(advancingPreventDefault).toHaveBeenCalledOnce()

    Object.defineProperty(tableWrapper, 'scrollHeight', { configurable: true, value: 200 })
    tableWrapper.scrollTop = 0
    const noOverflowWheel = new Event('wheel', { bubbles: true, cancelable: true })
    const noOverflowPreventDefault = vi.fn()
    Object.defineProperty(noOverflowWheel, 'deltaY', { value: 120 })
    Object.defineProperty(noOverflowWheel, 'preventDefault', { value: noOverflowPreventDefault })
    internalCell.dispatchEvent(noOverflowWheel)
    expect(tableWrapper.scrollTop).toBe(0)
    expect(noOverflowPreventDefault).not.toHaveBeenCalled()

    Object.defineProperty(tableWrapper, 'scrollHeight', { configurable: true, value: 600 })
    tableWrapper.scrollTop = 400
    const endWheel = new Event('wheel', { bubbles: true, cancelable: true })
    const endPreventDefault = vi.fn()
    Object.defineProperty(endWheel, 'deltaY', { value: 120 })
    Object.defineProperty(endWheel, 'preventDefault', { value: endPreventDefault })
    internalCell.dispatchEvent(endWheel)
    expect(tableWrapper.scrollTop).toBe(400)
    expect(endPreventDefault).not.toHaveBeenCalled()
  })

  it('registers the table wheel listener as non-passive and removes it outside table view', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product])
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })

    const addEventListener = vi.spyOn(HTMLDivElement.prototype, 'addEventListener')
    const removeEventListener = vi.spyOn(HTMLDivElement.prototype, 'removeEventListener')
    expect(addEventListener.mock.calls.some(([type]) => type === 'wheel')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Vista de tabla' }))

    const wheelRegistrationIndex = addEventListener.mock.calls.findIndex(([type]) => type === 'wheel')
    const wheelRegistration = wheelRegistrationIndex >= 0 ? addEventListener.mock.calls[wheelRegistrationIndex] : undefined
    expect(wheelRegistration).toBeDefined()
    expect(wheelRegistration?.[2]).toEqual({ passive: false })
    expect(addEventListener.mock.instances[wheelRegistrationIndex]).toBe(screen.getByTestId('products-table-wrapper'))

    fireEvent.click(screen.getByRole('button', { name: 'Vista de tarjetas' }))
    expect(removeEventListener).toHaveBeenCalledWith('wheel', wheelRegistration?.[1])
  })

  it('suppresses a dragged table action button but keeps a normal click active', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product])
    vi.mocked(productApi.deactivateProduct).mockResolvedValue({ ...product, active: false })
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Vista de tabla' }))

    const tableWrapper = screen.getByTestId('products-table-wrapper')
    const toggleButton = within(screen.getByRole('table', { name: 'Catálogo de productos filtrados' })).getByRole('button', { name: 'Desactivar Mango' })
    Object.defineProperties(tableWrapper, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 600 },
      setPointerCapture: { configurable: true, value: vi.fn() },
    })

    fireEvent.pointerDown(toggleButton, { button: 0, pointerId: 15, pointerType: 'mouse', clientX: 180 })
    expect(tableWrapper.setPointerCapture).not.toHaveBeenCalled()
    fireEvent.pointerMove(toggleButton, { pointerId: 15, pointerType: 'mouse', clientX: 100 })
    expect(tableWrapper.setPointerCapture).toHaveBeenCalledWith(15)
    fireEvent.pointerUp(toggleButton, { button: 0, pointerId: 15, pointerType: 'mouse', clientX: 100 })
    fireEvent.click(toggleButton, { detail: 1 })

    expect(tableWrapper.scrollLeft).toBe(80)
    expect(productApi.deactivateProduct).not.toHaveBeenCalled()

    fireEvent.pointerDown(toggleButton, { button: 0, pointerId: 16, pointerType: 'mouse', clientX: 100 })
    fireEvent.pointerUp(toggleButton, { button: 0, pointerId: 16, pointerType: 'mouse', clientX: 100 })
    fireEvent.click(toggleButton, { detail: 1 })

    expect(await screen.findByText('Producto desactivado.')).toBeInTheDocument()
    expect(productApi.deactivateProduct).toHaveBeenCalledWith('product-1')
  })

  it('keeps selecting a category when a button interaction does not move', async () => {
    const categoryProducts = ['Aguas', 'Bolis', 'Helados', 'Nieves'].map((categoryName, index) => ({ ...product, id: `product-${index + 1}`, name: categoryName, category: categoryName }))
    vi.mocked(productApi.listProducts).mockResolvedValue(categoryProducts)
    renderProtected()
    await screen.findByRole('heading', { name: 'Aguas' })

    const categoryButton = within(screen.getByTestId('product-category-tabs')).getByRole('tab', { name: 'Filtrar por Helados' })
    fireEvent.pointerDown(categoryButton, { button: 0, pointerId: 8, pointerType: 'mouse', clientX: 180 })
    fireEvent.pointerUp(categoryButton, { button: 0, pointerId: 8, pointerType: 'mouse', clientX: 180 })
    fireEvent.click(categoryButton, { detail: 1 })

    expect(categoryButton).toHaveAttribute('aria-selected', 'true')
  })

  it('drags desktop category tabs without selecting the dragged category', async () => {
    const categoryProducts = ['Aguas', 'Bolis', 'Helados', 'Nieves'].map((categoryName, index) => ({ ...product, id: `product-${index + 1}`, name: categoryName, category: categoryName }))
    vi.mocked(productApi.listProducts).mockResolvedValue(categoryProducts)
    renderProtected()
    await screen.findByRole('heading', { name: 'Aguas' })

    const categoryTabs = screen.getByTestId('product-category-tabs')
    Object.defineProperties(categoryTabs, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 600 },
    })
    const draggedCategory = within(categoryTabs).getByRole('tab', { name: 'Filtrar por Helados' })
    fireEvent.pointerDown(draggedCategory, { button: 0, pointerId: 7, pointerType: 'mouse', clientX: 180 })
    fireEvent.pointerMove(draggedCategory, { pointerId: 7, pointerType: 'mouse', clientX: 100 })
    fireEvent.pointerUp(draggedCategory, { button: 0, pointerId: 7, pointerType: 'mouse', clientX: 100 })
    fireEvent.click(draggedCategory, { detail: 1 })

    expect(categoryTabs.scrollLeft).toBe(80)
    expect(draggedCategory).toHaveAttribute('aria-selected', 'false')
    expect(within(categoryTabs).getByRole('tab', { name: 'Filtrar por Todas las categorías' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(draggedCategory, { detail: 0 })
    expect(draggedCategory).toHaveAttribute('aria-selected', 'true')
  })

  it('renders filtered table columns and preserves edit and status actions', async () => {
    const strawberry: productApi.Product = { ...product, id: 'product-2', name: 'Strawberry', sku: 'S-02', category: 'Ice cream', tags: [], imageUrl: null, imageKey: null, active: false }
    vi.mocked(productApi.listProducts).mockResolvedValue([product, strawberry])
    vi.mocked(productApi.deactivateProduct).mockResolvedValue({ ...product, active: false })
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Vista de tabla' }))

    const table = screen.getByRole('table', { name: 'Catálogo de productos filtrados' })
    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toEqual(['Imagen', 'Producto', 'SKU', 'Categoría', 'Etiquetas', 'Menudeo', 'Mayorista', 'Estado', 'Acciones'])
    expect(within(table).getByRole('row', { name: /Mango/ })).toHaveTextContent('M-01')
    expect(within(table).getByRole('row', { name: /Mango/ })).toHaveTextContent('con chile')
    expect(within(table).getByRole('row', { name: /Mango/ })).toHaveTextContent('$42.50')
    expect(within(table).getByRole('row', { name: /Mango/ })).toHaveTextContent('Activo')
    expect(within(table).queryByRole('row', { name: /Strawberry/ })).toBeInTheDocument()

    const productRow = within(table).getByRole('row', { name: /Mango/ })
    const editButton = within(productRow).getByRole('button', { name: 'Editar Mango' })
    const toggleButton = within(productRow).getByRole('button', { name: 'Desactivar Mango' })
    for (const button of [editButton, toggleButton]) {
      expect(button).toHaveClass('h-11', 'w-11', 'min-h-11', 'min-w-11', 'px-0')
      expect(button).not.toHaveTextContent('Editar')
      expect(button).not.toHaveTextContent('Desactivar')
      expect(button).toHaveAttribute('title', button.getAttribute('aria-label'))
    }
    expect(editButton.querySelector('[data-icon="edit"]')).toBeInTheDocument()
     expect(toggleButton.querySelector('[data-icon="power"]')).toBeInTheDocument()
     const productList = screen.getByTestId('product-list-scroll')
       const tableWrapper = screen.getByTestId('products-table-wrapper')
       expect(tableWrapper).toHaveClass('mt-4', 'min-h-0', 'flex-1', 'touch-none', 'overflow-x-auto', 'overflow-y-auto', 'overscroll-contain')
       expect(tableWrapper).toHaveClass('ops-scroll-region', 'ops-horizontal-scroll')
      expect(productList).toHaveClass('flex', 'min-h-0', 'flex-1', 'overflow-hidden')
      expect(productList).not.toHaveClass('overflow-y-auto')
      expect(table.querySelector('thead')).toHaveClass('sticky', 'top-0', 'z-10', 'bg-slate-900')
      expect(within(table).getAllByRole('columnheader').at(-1)).toHaveClass('min-w-24', 'px-2', 'py-2')

    const search = screen.getByRole('searchbox', { name: 'Buscar productos' })
    fireEvent.change(search, { target: { value: 'chile' } })
    expect(within(table).getByRole('row', { name: /Mango/ })).toBeInTheDocument()
    expect(within(table).queryByRole('row', { name: /Strawberry/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Editar Mango' }))
    expect(screen.getByRole('dialog', { name: 'Editar producto' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar formulario de producto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar Mango' }))
    expect(await screen.findByText('Producto desactivado.')).toBeInTheDocument()
    expect(productApi.deactivateProduct).toHaveBeenCalledWith('product-1')
  })

  it('marks products without wholesale pricing in gray in both catalog views', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([{ ...product, wholesalePriceMxn: 0 }])
    renderProtected()
    const card = (await screen.findByRole('heading', { name: 'Mango' })).closest('li') as HTMLElement
    expect(within(card).getByText('Sin precio mayorista')).toHaveClass('text-slate-400')

    fireEvent.click(screen.getByRole('button', { name: 'Vista de tabla' }))
    const row = within(screen.getByRole('table', { name: 'Catálogo de productos filtrados' })).getByRole('row', { name: /Mango/ })
    expect(within(row).getByText('Sin precio mayorista')).toHaveClass('text-slate-400')
  })

  it('creates a product from the catalog form', async () => {
    vi.mocked(productApi.createProduct).mockResolvedValue(product)
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'nIEVE  dE  fRESA' } }); fireEvent.change(screen.getByLabelText('SKU / código'), { target: { value: 'SKU-01' } }); fireEvent.focus(screen.getByLabelText('Categoría')); fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'pal' } }); fireEvent.click(screen.getByRole('option', { name: 'Paletas' })); fireEvent.change(screen.getByLabelText('Precio de menudeo'), { target: { value: '42.5' } }); fireEvent.change(screen.getByLabelText('Precio mayorista'), { target: { value: '35' } }); fireEvent.change(screen.getByLabelText('Etiquetas'), { target: { value: 'fruta' } }); fireEvent.keyDown(screen.getByLabelText('Etiquetas'), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }))
    expect(await screen.findByText('Producto creado.')).toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(productApi.createProduct).toHaveBeenCalledWith({ name: 'Nieve de fresa', sku: 'SKU-01', categoryId: 'category-1', retailPriceMxn: 42.5, wholesalePriceMxn: 35, tags: ['Fruta'], active: true })
  })

  it('updates and deactivates an existing product', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product]); vi.mocked(productApi.updateProduct).mockResolvedValue({ ...product, name: 'Mango Grande' }); vi.mocked(productApi.deactivateProduct).mockResolvedValue({ ...product, active: false })
    renderProtected(); await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar Mango' })); expect(screen.getByRole('dialog', { name: 'Editar producto' })).toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'Editar producto' })).toBeInTheDocument(); expect(screen.getByLabelText('Precio de menudeo')).toHaveValue(42.5); expect(screen.getByLabelText('Precio mayorista')).toHaveValue(35); expect(screen.getByLabelText('SKU / código')).toHaveValue('M-01'); expect(screen.getByLabelText('Producto activo en los canales de venta')).toBeChecked(); expect(screen.getByLabelText('Producto activo en los canales de venta')).toHaveAttribute('form', 'product-form'); fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'mANGO  GRANDE' } }); expect(screen.getByRole('button', { name: 'Guardar producto' })).toHaveAttribute('form', 'product-form'); fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }))
    expect(await screen.findByText('Producto actualizado.')).toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(productApi.updateProduct).toHaveBeenCalledWith('product-1', expect.objectContaining({ name: 'Mango grande', sku: 'M-01' }))
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar Mango Grande' })); expect(await screen.findByText('Producto desactivado.')).toBeInTheDocument(); expect(productApi.deactivateProduct).toHaveBeenCalledWith('product-1')
  })

  it('selects an image for preview and replaces it only after saving', async () => {
    const created = { ...product, imageUrl: null, imageKey: null, tags: [] }
    const uploaded = { ...created, imageUrl: 'https://storage.example.com/mango.webp', imageKey: 'products/product-1/new.webp' }
    vi.mocked(productApi.createProduct).mockResolvedValue(created)
    vi.mocked(productApi.replaceProductImage).mockResolvedValue(uploaded)
    renderProtected(); await screen.findByText('Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))

    expect(screen.getByRole('img', { name: 'Vista previa de producto' }).parentElement).toHaveClass('w-32', 'max-w-32')
    const file = new File(['image'], 'mango.webp', { type: 'image/webp' })
     const imagePicker = screen.getByTitle('Seleccionar imagen')
     expect(imagePicker).toHaveClass('ops-icon-button')
    expect(imagePicker?.querySelector('[data-icon="plus"]')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Seleccionar imagen'), { target: { files: [file] } })
    expect(await screen.findByText('Lista para optimizar y guardar: mango.webp')).toBeInTheDocument()
    fireEvent.focus(screen.getByLabelText('Categoría')); fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'pal' } })
    fireEvent.click(screen.getByRole('option', { name: 'Paletas' }))
    fireEvent.change(screen.getByLabelText('Precio de menudeo'), { target: { value: '42' } }); fireEvent.change(screen.getByLabelText('Precio mayorista'), { target: { value: '35' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Crear producto' }))

    expect(await screen.findByText('Producto creado.')).toBeInTheDocument()
    expect(productApi.replaceProductImage).toHaveBeenCalledWith('product-1', created, file)
  })

  it('keeps existing image replacement and removal controls in one horizontal row', async () => {
    vi.mocked(productApi.listProducts).mockResolvedValue([product])
    renderProtected(); await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar Mango' }))

    const actions = screen.getByTestId('product-image-actions')
    const replaceControl = screen.getByTitle('Reemplazar imagen')
    const removeControl = screen.getByRole('button', { name: 'Quitar imagen' })
    expect(screen.getByText('Se muestra la imagen actual del catálogo.').nextElementSibling).toBe(actions)
    expect(actions).toHaveClass('flex', 'flex-row', 'flex-nowrap', 'items-center', 'gap-2')
    expect(actions).not.toHaveClass('flex-col', 'sm:flex-row')
    expect(actions).toContainElement(replaceControl)
    expect(actions).toContainElement(removeControl)

    fireEvent.click(removeControl)
    expect(actions).toHaveClass('flex-row', 'flex-nowrap')
    expect(within(actions).getByRole('button', { name: 'Restaurar imagen actual' })).toBeInTheDocument()
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
