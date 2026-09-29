import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../../app/AppProviders'
import { createAdminSessionStorageKey } from '../../../app/sessionPersistence'
import { NavigationDrawerOpenContext } from '../../../app/navigationDrawerContext'
import { AdminBoundary } from '../../auth/ui/AdminBoundary'
import * as authApi from '../../auth/api/adminAccess'
import * as productApi from '../../products/api/products'
import * as salesApi from '../api/sales'
import type { PosShift } from '../api/posShifts'
import { SalesWorkspace } from './SalesWorkspace'
import { PosTicketPreview } from './PosTicketPreview'
import { createRequestId } from './posUtils'
import type { SalesReceiptConfiguration } from '../../configuration/api/salesReceipt'

const realtimeApi = vi.hoisted(() => ({
  connect: vi.fn(),
  subscribe: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  unsubscribe: vi.fn(),
  handler: null as ((payload?: unknown) => void) | null,
}))
const configurationApi = vi.hoisted(() => ({ get: vi.fn() }))
const receiptConfigurationApi = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('../../auth/api/adminAccess', () => ({ getAccessContext: vi.fn(), signIn: vi.fn() }))
vi.mock('../../products/api/products', () => ({ listProducts: vi.fn(), listActiveProductsForPos: vi.fn(), MAX_PRODUCT_TAG_LENGTH: 48, MAX_PRODUCT_TAGS: 20, PRODUCT_IMAGE_MAX_BYTES: 5 * 1024 * 1024, PRODUCT_IMAGE_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'], normalizeProductTags: (value: unknown) => Array.isArray(value) ? value.map((tag) => String(tag).trim()).filter(Boolean) : [] }))
vi.mock('../../configuration/api/configuration', () => ({ getOperationalConfiguration: configurationApi.get }))
vi.mock('../../configuration/api/salesReceipt', () => ({ getSalesReceiptConfiguration: receiptConfigurationApi.get }))
vi.mock('../../../lib/insforge', () => ({ insforge: { realtime: realtimeApi } }))
vi.mock('../api/sales', () => ({
   POS_PAYMENT_METHODS: ['cash', 'card'],
   POS_PAYMENT_CURRENCIES: ['mxn', 'usd'],
  WHOLESALE_DELIVERY_METHODS: ['delivery', 'pickup'],
  WHOLESALE_PAYMENT_METHODS: ['credit', 'cash', 'transfer'],
  recordSale: vi.fn(),
}))

const products: productApi.Product[] = [
  { id: 'product-1', name: 'Mango', sku: 'M-01', category: 'Paletas', categoryId: 'category-1', retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true, tags: ['fruta'], imageUrl: 'https://cdn.example.com/mango.jpg', imageKey: null, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' },
  { id: 'product-2', name: 'Strawberry', sku: 'S-02', category: 'Creams', categoryId: 'category-2', retailPriceMxn: 28, wholesalePriceMxn: 22, active: true, tags: [], imageUrl: null, imageKey: null, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' },
]
const receipt: salesApi.SaleReceipt = { id: 'sale-1', channel: 'pos', totalMxn: 85, createdAt: '2026-08-20T00:00:00Z', replayed: false }
const usdReceipt: salesApi.SaleReceipt = { ...receipt, paymentMethod: 'cash', paymentCurrency: 'usd', usdMxnRate: 17, usdEquivalent: 5, usdPaid: 6, receivedMxn: 102, changeMxn: 17 }
const renderProtected = (channel: salesApi.SalesChannel = 'pos', branchName?: string, activeShift?: PosShift, initialViewMode: 'products' | 'categories' = 'products') => render(<AppProviders><AdminBoundary><SalesWorkspace channel={channel} branchName={branchName} activeShift={activeShift} initialViewMode={initialViewMode} /></AdminBoundary></AppProviders>)

describe('sales workspace', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    localStorage.clear()
    vi.restoreAllMocks()
  })
  beforeEach(() => {
    vi.resetAllMocks()
    realtimeApi.handler = null
    realtimeApi.connect.mockResolvedValue(undefined)
    realtimeApi.subscribe.mockResolvedValue({ ok: true, channel: 'products', presence: { members: [] } })
    realtimeApi.on.mockImplementation((_event: string, handler: (payload?: unknown) => void) => { realtimeApi.handler = handler })
    vi.mocked(authApi.getAccessContext).mockResolvedValue({ role: 'admin', userId: 'admin-1', displayName: null, capabilities: ['sales.record'], branch: null })
    vi.mocked(productApi.listActiveProductsForPos).mockResolvedValue(products)
    configurationApi.get.mockResolvedValue([
      { key: 'event_daily_capacity', value: 7 },
      { key: 'pos_usd_mxn_rate', value: 15 },
      { key: 'pos_wholesale_threshold', value: 10 },
    ])
    receiptConfigurationApi.get.mockResolvedValue({ logoUrl: null, logoKey: null, companyPhone: null, companyEmail: null, showLogo: true, showBranch: true, showCashier: true, showCustomer: true, showPaymentMethod: true, showCompanyPhone: true, showCompanyEmail: true, showCustomerUrl: true, ownerId: 'admin-1', updatedAt: '2026-08-29T12:00:00.000Z' })
    vi.mocked(salesApi.recordSale).mockResolvedValue(receipt)
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'request-1') })
  })

  it('derives and prints the customer origin as plain text without links', () => {
    const legacyConfiguration = { logoUrl: 'https://cdn.example.com/logo.png', logoKey: 'receipts/logo.png', companyPhone: '+52 999 000 0000', companyEmail: 'hola@paletixa.example', customer_url: 'https://legacy.example/clientes', showLogo: true, showBranch: true, showCashier: true, showCustomer: true, showPaymentMethod: true, showCompanyPhone: true, showCompanyEmail: true, showCustomerUrl: true, ownerId: 'admin-1', updatedAt: '2026-08-29T12:00:00Z' } as unknown as SalesReceiptConfiguration
    render(<PosTicketPreview
      receipt={{ ...receipt, branchName: 'Sucursal Centro', cashierName: 'Ana López', customerName: 'Cliente mostrador' }}
      fallbackLines={[]}
      receiptConfiguration={legacyConfiguration}
    />)

    const ticket = screen.getByTestId('ticket-preview')
    const header = ticket.firstElementChild as HTMLElement
    expect(header.firstElementChild).not.toBeInstanceOf(HTMLImageElement)
    expect(header.lastElementChild).toContainElement(screen.getByRole('img', { name: 'Logo del ticket' }))
    expect(ticket).toHaveTextContent('+52 999 000 0000')
    expect(ticket).toHaveTextContent('hola@paletixa.example')
    expect(ticket).toHaveTextContent(window.location.origin)
    expect(ticket).not.toHaveTextContent('https://legacy.example/clientes')
    expect(within(ticket).queryByRole('link')).not.toBeInTheDocument()
  })

  it('hides the automatic customer origin when its visibility toggle is disabled', () => {
    render(<PosTicketPreview receipt={receipt} fallbackLines={[]} receiptConfiguration={{ logoUrl: null, logoKey: null, companyPhone: null, companyEmail: null, showLogo: true, showBranch: true, showCashier: true, showCustomer: true, showPaymentMethod: true, showCompanyPhone: true, showCompanyEmail: true, showCustomerUrl: false, ownerId: 'admin-1', updatedAt: '2026-08-29T12:00:00Z' }} />)

    expect(screen.getByTestId('ticket-preview')).not.toHaveTextContent(window.location.origin)
  })

  it('does not load protected products when admin access is denied', async () => {
    vi.mocked(authApi.getAccessContext).mockResolvedValue(null)
    renderProtected()
    expect(await screen.findByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
    expect(productApi.listActiveProductsForPos).not.toHaveBeenCalled()
  })

  it('shows an empty active catalog', async () => {
    vi.mocked(productApi.listActiveProductsForPos).mockResolvedValue([])
    renderProtected()
    expect(await screen.findByText('No hay productos activos en el catálogo. Agrega un producto activo antes de registrar una venta.')).toBeInTheDocument()
    expect(screen.getByTestId('pos-catalog-scroll')).toHaveClass('ops-scroll-region', 'min-h-0', 'flex-1', 'overflow-y-auto', 'overscroll-contain')
  })

  it('keeps branch identity internal without showing the POS branch badge or heading block', async () => {
    renderProtected('pos', 'East')
    await screen.findByRole('heading', { name: 'Mango' })
    expect(screen.queryByText('Sucursal East')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Registrar venta en punto de venta' })).not.toBeInTheDocument()
    expect(screen.queryByText('Registra una venta de mostrador con el catálogo compartido. El servidor confirma los precios y el total antes de guardarla.')).not.toBeInTheDocument()
  })

  it('keeps the POS catalog focused without a redundant title or info button', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })

    expect(screen.queryByText('Productos para mostrador')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Explicar selección de productos' })).not.toBeInTheDocument()
    expect(screen.getByRole('tabpanel', { name: 'Productos disponibles' })).toBeInTheDocument()
  })

  it('keeps the POS product catalog bounded by its own vertical scroller', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })

    const catalogColumn = screen.getByTestId('pos-catalog-column')
    const catalog = screen.getByRole('tabpanel', { name: 'Productos disponibles' })
    const scroller = screen.getByTestId('pos-catalog-scroll')
    const catalogHeader = screen.getByTestId('catalog-controls-header')
    expect(catalogColumn).toHaveClass('min-h-0', 'flex', 'flex-col', 'overflow-hidden')
    expect(catalog).toHaveClass('mt-2', 'flex', 'min-h-0', 'flex-1', 'flex-col')
    expect(catalog).not.toHaveClass('lg:flex')
    expect(catalogHeader).toContainElement(screen.getByRole('heading', { name: 'Catálogo de productos' }))
    expect(screen.getAllByTestId('sales-product-card')[0]).toHaveAttribute('data-catalog-selection-card', '')
    expect(screen.getAllByTestId('pos-price-pair')[0]).toHaveAttribute('data-catalog-price-pair', '')
    expect(screen.getAllByTestId('pos-price-pair')[0].querySelectorAll('[data-price-slot]')).toHaveLength(2)
    expect(scroller).toHaveClass('ops-scroll-region', 'min-h-0', 'flex-1', 'overflow-y-auto', 'overscroll-contain')
    expect(scroller).toContainElement(screen.getAllByTestId('sales-product-card')[0])
    expect(scroller).not.toContainElement(screen.getByRole('searchbox'))
  })

  it('matches the cashier workspace bottom padding without changing the in-flow catalog footer', async () => {
    render(<AppProviders><AdminBoundary><SalesWorkspace channel="pos" initialViewMode="products" mobileFooterBleed="cashier" /></AdminBoundary></AppProviders>)
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))

    const workspace = screen.getByTestId('pos-workspace')
    const catalog = screen.getByTestId('pos-catalog-scroll')
    const summary = screen.getByTestId('pos-mobile-summary-bar')
    const summaryDetails = screen.getByTestId('pos-mobile-summary-details')
    expect(workspace).toHaveClass('-mb-3', 'sm:-mb-4', 'lg:mb-0')
    expect(catalog).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'overscroll-contain')
    expect(summary.parentElement).toBe(workspace)
    expect(summary).not.toHaveClass('fixed', 'absolute', 'ops-mobile-action-bar')
    expect(summaryDetails).toHaveClass('flex', 'flex-wrap', 'items-baseline', 'justify-between', 'gap-x-3', 'gap-y-1')
    expect(summaryDetails.children).toHaveLength(2)
    expect(within(summaryDetails).getByText('1 artículo')).toBeInTheDocument()
    expect(within(summaryDetails).getByText(/42\.50/)).toBeInTheDocument()
  })

  it('isolates the in-flow POS summary while the navigation drawer is open', async () => {
    const setDrawerOpen = vi.fn()
    const withDrawerState = (isOpen: boolean) => <AppProviders><AdminBoundary><NavigationDrawerOpenContext.Provider value={{ isOpen, setIsOpen: setDrawerOpen }}><SalesWorkspace channel="pos" initialViewMode="products" /></NavigationDrawerOpenContext.Provider></AdminBoundary></AppProviders>
    const view = render(withDrawerState(true))
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))

    const summary = screen.getByTestId('pos-mobile-summary-bar')
    expect(summary).toHaveAttribute('aria-hidden', 'true')
    expect(summary).toHaveAttribute('inert')
    expect(screen.queryByRole('button', { name: 'Revisar venta' })).not.toBeInTheDocument()

    view.rerender(withDrawerState(false))

    const restoredSummary = screen.getByTestId('pos-mobile-summary-bar')
    expect(restoredSummary).toHaveAttribute('aria-hidden', 'false')
    expect(restoredSummary).not.toHaveAttribute('inert')
    expect(within(restoredSummary).getByRole('button', { name: 'Revisar venta' })).toBeEnabled()
  })

  it('recovers when the catalog request fails', async () => {
    vi.mocked(productApi.listActiveProductsForPos).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(products)
    renderProtected()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los productos.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(productApi.listActiveProductsForPos).toHaveBeenCalledTimes(2)
  })

  it('refetches the catalog when the cashier manually updates it', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar productos' }))

    await waitFor(() => expect(productApi.listActiveProductsForPos).toHaveBeenCalledTimes(2))
  })

  it('coalesces POS realtime catalog changes and cleans up the subscription and debounce timer', async () => {
    const view = renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })
    await waitFor(() => expect(realtimeApi.on).toHaveBeenCalledWith('catalog_changed', expect.any(Function)))
    expect(realtimeApi.connect).toHaveBeenCalled()
    expect(realtimeApi.subscribe).toHaveBeenCalledWith('products')

    realtimeApi.handler?.({ table: 'products', operation: 'update', id: 'product-1' })
    realtimeApi.handler?.({ table: 'product_categories', operation: 'update', id: 'category-1' })
    realtimeApi.handler?.({ table: 'product_tags', operation: 'update', id: 'tag-1' })
    await waitFor(() => expect(productApi.listActiveProductsForPos).toHaveBeenCalledTimes(2))

    view.unmount()
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(productApi.listActiveProductsForPos).toHaveBeenCalledTimes(2)
    expect(realtimeApi.off).toHaveBeenCalledWith('catalog_changed', expect.any(Function))
    expect(realtimeApi.unsubscribe).toHaveBeenCalledWith('products')
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

  it('switches to category cards and adds a generic category line without a product id', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('tab', { name: 'Vista por categoría' }))
    expect(screen.getAllByTestId('sales-category-card')).toHaveLength(2)
    expect(screen.getByRole('img', { name: 'Categoría Paletas' })).toHaveAttribute('src', 'https://cdn.example.com/mango.jpg')
    expect(screen.getByRole('img', { name: 'Categoría Creams' })).toHaveTextContent('Imagen pendiente')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas a la venta' }))
     expect(screen.getByLabelText('Cantidad de Categoría: Paletas')).toHaveValue('1')
     fireEvent.click(screen.getByRole('button', { name: 'Tarjeta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar' }))
    await screen.findByRole('heading', { name: 'Venta registrada' })
    expect(salesApi.recordSale).toHaveBeenCalledWith(expect.objectContaining({ items: [{ lineKind: 'category', categoryId: 'category-1', quantity: 1 }] }))
  })

  it('opens the POS catalog in category view by default', async () => {
    render(<AppProviders><AdminBoundary><SalesWorkspace channel="pos" /></AdminBoundary></AppProviders>)
    expect((await screen.findAllByTestId('sales-category-card')).length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: 'Vista por categoría' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Vista por producto' })).toHaveAttribute('aria-selected', 'false')
  })

   it('keeps the POS review order uniform while preserving the mobile two-step flow', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })

     const reviewButton = screen.getByRole('button', { name: 'Revisar venta' })
       expect(reviewButton).toBeDisabled()
       expect(screen.getByTestId('pos-workspace')).toHaveClass('ops-workspace-frame', 'min-w-0')
      expect(screen.getByTestId('pos-workspace')).not.toHaveClass('h-[calc(100dvh-4rem-1.5rem)]', 'sm:h-[calc(100dvh-4rem-2rem)]')
      expect(screen.getByTestId('pos-workspace')).toHaveClass('min-h-0', 'flex-1', 'overflow-hidden')
      expect(screen.getByTestId('pos-sales-form')).toHaveClass('grid')
      expect(screen.getByTestId('pos-sales-form')).not.toHaveClass('pb-[calc(8rem+env(safe-area-inset-bottom))]', 'lg:pb-0')
      expect(screen.getByTestId('pos-sales-form')).toHaveClass('lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]', 'lg:min-h-0', 'lg:flex-1', 'lg:overflow-hidden')
     expect(screen.getByTestId('pos-catalog-column')).toHaveClass('flex', 'min-h-0', 'flex-col', 'overflow-hidden')
     expect(screen.getByTestId('pos-summary-column')).toHaveClass('hidden', 'lg:flex')
      const catalogScroll = screen.getByTestId('pos-catalog-scroll')
      expect(catalogScroll).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'overscroll-contain')
      expect(catalogScroll).toHaveClass('ops-scroll-region')
     expect(catalogScroll).toContainElement(screen.getAllByTestId('sales-product-card')[0])
     expect(catalogScroll).not.toContainElement(screen.getByRole('searchbox'))

    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    const mobileSummaryBar = screen.getByTestId('pos-mobile-summary-bar')
    const catalogWorkspace = screen.getByTestId('pos-workspace')
    expect(catalogWorkspace).toHaveClass('-mb-4', 'sm:-mb-6', 'lg:mb-0')
    expect(mobileSummaryBar).toHaveClass('shrink-0', 'mt-2', 'border-t', 'lg:hidden')
    expect(mobileSummaryBar).not.toHaveClass('fixed', 'z-30', 'ops-mobile-action-bar')
    expect(mobileSummaryBar.parentElement).toBe(catalogWorkspace)
    expect(mobileSummaryBar.previousElementSibling).toBe(screen.getByTestId('pos-sales-form'))
    expect(catalogWorkspace.lastElementChild).toBe(mobileSummaryBar)
    expect(within(mobileSummaryBar).getByText('1 artículo')).toBeInTheDocument()
    expect(within(mobileSummaryBar).getByText(/42\.50/)).toBeInTheDocument()
    expect(within(mobileSummaryBar).getByRole('button', { name: 'Revisar venta' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar venta' }))

      expect(screen.getByTestId('pos-mobile-review-header')).toBeInTheDocument()
      expect(screen.getByText('Paso 2 de 2')).toBeInTheDocument()
     const workspace = screen.getByTestId('pos-workspace')
     expect(workspace).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col', 'overflow-hidden', 'pb-[calc(1rem+env(safe-area-inset-bottom))]', 'sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]')
     expect(workspace).not.toHaveClass('h-[calc(100dvh-4rem-1.5rem)]', 'sm:h-[calc(100dvh-4rem-2rem)]')
      expect(screen.getByTestId('pos-catalog-column')).toHaveClass('hidden', 'lg:flex')
      const form = screen.getByTestId('pos-sales-form')
      expect(form).toHaveClass('flex', 'flex-col', 'min-h-0', 'flex-1', 'overflow-hidden', 'lg:grid', 'lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]')
     expect(form).not.toHaveClass('overflow-y-auto', 'overscroll-contain')
      const summary = screen.getByTestId('pos-summary-column')
      expect(summary).not.toHaveClass('hidden')
      expect(summary).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col', 'overflow-hidden', 'lg:flex', 'lg:h-full', 'lg:min-h-0', 'lg:overflow-hidden')
     expect(screen.getByTestId('pos-mobile-review-header')).toHaveClass('order-0', 'shrink-0')
     const linesSection = screen.getByTestId('pos-lines-section')
      expect(linesSection).toHaveClass('min-h-0', 'flex', 'flex-col', 'flex-1', 'lg:flex-1')
      expect(linesSection).not.toHaveClass('order-1')
      expect(linesSection).not.toHaveClass('overflow-y-auto', 'overscroll-contain')
      const saleDetails = screen.getByTestId('pos-sale-details')
      expect(saleDetails).toHaveClass('shrink-0', 'lg:shrink-0')
      expect(saleDetails).not.toHaveClass('order-2')
      const selectedLines = screen.getByTestId('pos-selected-lines')
       expect(selectedLines).toHaveClass('min-h-0', 'max-h-[min(28rem,42dvh)]', 'overflow-y-auto', 'overscroll-contain', 'flex-1', 'lg:max-h-none', 'lg:min-h-0', 'lg:flex-1', 'lg:overflow-y-auto', 'lg:overscroll-contain')
      expect(selectedLines).toHaveClass('ops-scroll-region')
      expect(selectedLines).not.toHaveClass('lg:overflow-visible', 'lg:flex-none')
      const visibleEstimate = screen.getByTestId('pos-visible-estimate')
      expect(visibleEstimate).toHaveClass('shrink-0', 'lg:shrink-0')
      expect(visibleEstimate).not.toHaveClass('order-3')
     expect(screen.getByRole('button', { name: 'Explicar estimación visible' })).toBeInTheDocument()
     fireEvent.click(screen.getByRole('button', { name: 'Explicar estimación visible' }))
     expect(screen.getByRole('tooltip')).toHaveTextContent('El total final lo confirma el servidor al registrar la venta.')
     const summaryChildren = Array.from(summary.children)
    expect(summaryChildren.indexOf(linesSection)).toBeLessThan(summaryChildren.indexOf(saleDetails))
    expect(summaryChildren.indexOf(saleDetails)).toBeLessThan(summaryChildren.indexOf(visibleEstimate))
    expect(selectedLines).not.toContainElement(saleDetails)
    expect(selectedLines).not.toContainElement(visibleEstimate)
    expect(visibleEstimate.parentElement).toBe(summary)

    fireEvent.click(screen.getByRole('button', { name: 'Volver al catálogo' }))
    expect(screen.queryByTestId('pos-mobile-review-header')).not.toBeInTheDocument()
     expect(screen.getByRole('button', { name: 'Revisar venta' })).toBeEnabled()
     expect(screen.getByTestId('pos-selected-lines')).not.toHaveClass('overflow-y-auto', 'overscroll-contain', 'flex-1')
     expect(screen.getByTestId('pos-mobile-summary-bar')).toHaveClass('shrink-0', 'lg:hidden')
  })

   it('does not add the mobile POS checkout controls to non-POS channels', async () => {
    renderProtected('wholesale')
    await screen.findByRole('heading', { name: 'Mango' })

    expect(screen.queryByTestId('pos-mobile-summary-bar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pos-mobile-review-header')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revisar venta' })).not.toBeInTheDocument()
    expect(screen.getByTestId('sales-catalog-scroll')).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'overscroll-contain')
  })

  it('updates product, category, and cart labels at the automatic wholesale threshold', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })

    const productCard = screen.getAllByTestId('sales-product-card')[0]
    expect(within(productCard).getByText('Menudeo')).toBeInTheDocument()
     expect(within(productCard).getByText('Menudeo').parentElement).toHaveTextContent('$42.50')
     expect(within(productCard).getByText('Mayorista').parentElement).toHaveTextContent('$35.00')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    const cartItem = screen.getByLabelText('Cantidad de Mango').closest('li')
    expect(cartItem).not.toBeNull()
    const productPricePair = within(productCard).getByTestId('pos-price-pair')
     expect(within(cartItem as HTMLElement).queryByText('Menudeo')).not.toBeInTheDocument()
     expect(within(cartItem as HTMLElement).queryByText('Mayorista')).not.toBeInTheDocument()
     expect(cartItem).not.toHaveTextContent('Aplicado:')
    expect(productPricePair).toHaveAttribute('data-active-price', 'Precio de menudeo')
    expect(productCard).not.toHaveTextContent('Aplicado:')

    for (let index = 1; index < 9; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: index === 0 ? 'Agregar Mango a la venta' : 'Agregar otra unidad de Mango a la venta' }))
    }

    expect(screen.getByText('Estimación visible').parentElement).toHaveTextContent('$382.50 MXN')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otra unidad de Mango a la venta' }))
    expect(screen.getByText('Estimación visible').parentElement).toHaveTextContent('$350.00 MXN')
    expect(productPricePair).toHaveAttribute('data-active-price', 'Precio de mayoreo')
    expect(productCard).not.toHaveTextContent('Aplicado:')
     expect(screen.getByLabelText('Cantidad de Mango').closest('li')).not.toHaveTextContent('Aplicado:')

    fireEvent.click(screen.getByRole('tab', { name: 'Vista por categoría' }))
    const paletasCard = screen.getByRole('heading', { name: 'Paletas' }).closest('[data-testid="sales-category-card"]')
    expect(paletasCard).not.toBeNull()
    expect(paletasCard).toHaveTextContent('Menudeo')
     expect(paletasCard).toHaveTextContent('$42.50')
    expect(paletasCard).toHaveTextContent('Mayorista')
     expect(paletasCard).toHaveTextContent('$35.00')
    expect(within(paletasCard as HTMLElement).getByTestId('pos-price-pair')).toHaveAttribute('data-active-price', 'Precio de mayoreo')
    expect(paletasCard).not.toHaveTextContent('Aplicado:')
  })

  it('applies the active price immediately for category-only quantities at 9 and 10', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('tab', { name: 'Vista por categoría' }))
    const addCategoryButton = () => screen.getByRole('button', { name: 'Agregar categoría Paletas a la venta' })

    fireEvent.click(addCategoryButton())
    for (let index = 1; index < 9; index += 1) fireEvent.click(addCategoryButton())
    const categoryCard = screen.getByRole('heading', { name: 'Paletas' }).closest('[data-testid="sales-category-card"]') as HTMLElement
    const categoryPricePair = within(categoryCard).getByTestId('pos-price-pair')
    expect(categoryPricePair).toHaveAttribute('data-active-price', 'Precio de menudeo')
    expect(categoryCard).not.toHaveTextContent('Aplicado:')
    expect(screen.getByText('Estimación visible').parentElement).toHaveTextContent('$382.50 MXN')

    fireEvent.click(addCategoryButton())
    expect(categoryPricePair).toHaveAttribute('data-active-price', 'Precio de mayoreo')
    expect(categoryCard).not.toHaveTextContent('Aplicado:')
    expect(screen.getByText('Estimación visible').parentElement).toHaveTextContent('$350.00 MXN')
     expect(screen.getByLabelText('Cantidad de Categoría: Paletas').closest('li')).not.toHaveTextContent('Aplicado:')
  })

  it('applies the active price immediately for mixed product and category quantities at 9 and 10', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    for (let index = 1; index < 8; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Agregar otra unidad de Mango a la venta' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Vista por categoría' }))
    const addCategoryButton = () => screen.getByRole('button', { name: 'Agregar categoría Paletas a la venta' })
    fireEvent.click(addCategoryButton())
    expect(screen.getByText('Estimación visible').parentElement).toHaveTextContent('$382.50 MXN')
     expect(screen.getByLabelText('Cantidad de Mango').closest('li')).not.toHaveTextContent('Aplicado:')
     expect(screen.getByLabelText('Cantidad de Categoría: Paletas').closest('li')).not.toHaveTextContent('Aplicado:')

    fireEvent.click(addCategoryButton())
    expect(screen.getByText('Estimación visible').parentElement).toHaveTextContent('$350.00 MXN')
     expect(screen.getByLabelText('Cantidad de Mango').closest('li')).not.toHaveTextContent('Aplicado:')
      expect(screen.getByLabelText('Cantidad de Categoría: Paletas').closest('li')).not.toHaveTextContent('Aplicado:')
  })

   it('falls back to retail and registers a POS sale at the wholesale threshold when wholesale is missing', async () => {
    const missingWholesale = { ...products[0], wholesalePriceMxn: 0 }
    vi.mocked(productApi.listActiveProductsForPos).mockResolvedValue([missingWholesale, products[1]])
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })

    const productCard = screen.getAllByTestId('sales-product-card')[0]
    expect(within(productCard).getByText('Sin precio mayorista')).toHaveClass('text-slate-400')
    expect(productCard).toHaveTextContent('$42.50')
    expect(productCard).not.toHaveTextContent('$0.00')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    for (let index = 1; index < 10; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Agregar otra unidad de Mango a la venta' }))
    }

    const cartItem = screen.getByLabelText('Cantidad de Mango').closest('li') as HTMLElement
    expect(cartItem).toHaveTextContent('$425.00 MXN')
    expect(within(productCard).getByTestId('pos-price-pair')).toHaveAttribute('data-active-price', 'Precio de menudeo')
    expect(screen.getByText('Estimación visible').parentElement).toHaveTextContent('$425.00 MXN')
    fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))

     expect(await screen.findByRole('dialog', { name: 'Confirmar registro de venta' })).toBeInTheDocument()
    expect(salesApi.recordSale).not.toHaveBeenCalled()
     fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar' }))
    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument()
    expect(screen.getByTestId('ticket-preview')).toHaveTextContent('$425.00 MXN')
    expect(salesApi.recordSale).toHaveBeenCalledWith(expect.objectContaining({ items: [{ productId: 'product-1', quantity: 10 }] }))
  })

  it('falls back to retail and marks the applied label for missing wholesale prices in category view', async () => {
    vi.mocked(productApi.listActiveProductsForPos).mockResolvedValue([{ ...products[0], wholesalePriceMxn: 0 }, products[1]])
    renderProtected('pos', undefined, undefined, 'categories')
    await screen.findByRole('heading', { name: 'Paletas' })

    const categoryCard = screen.getByRole('heading', { name: 'Paletas' }).closest('[data-testid="sales-category-card"]') as HTMLElement
    expect(categoryCard).toHaveTextContent('$42.50')
    expect(within(categoryCard).getByText('Sin precio mayorista')).toHaveClass('text-slate-400')
    expect(categoryCard).not.toHaveTextContent('$0.00')

    const addCategoryButton = () => screen.getByRole('button', { name: 'Agregar categoría Paletas a la venta' })
    for (let index = 0; index < 10; index += 1) fireEvent.click(addCategoryButton())
    expect(within(categoryCard).getByTestId('pos-price-pair')).toHaveAttribute('data-active-price', 'Precio de menudeo')
    expect(screen.getByText('Estimación visible').parentElement).toHaveTextContent('$425.00 MXN')
  })

  it('shows the missing wholesale price in the wholesale channel and blocks review', async () => {
    vi.mocked(productApi.listActiveProductsForPos).mockResolvedValue([{ ...products[0], wholesalePriceMxn: 0 }, products[1]])
    renderProtected('wholesale')
    await screen.findByRole('heading', { name: 'Mango' })

    const productCard = screen.getAllByTestId('sales-product-card')[0]
    expect(within(productCard).getByText('Sin precio mayorista')).toHaveClass('text-slate-400')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    const cartItem = screen.getByLabelText('Cantidad de Mango').closest('li') as HTMLElement
    expect(within(cartItem).getByText('Sin precio mayorista')).toHaveClass('text-slate-400')
    fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))

    expect(screen.getAllByRole('alert').some((element) => element.textContent?.includes('Actualiza el precio mayorista en Productos antes de continuar.'))).toBe(true)
    expect(salesApi.recordSale).not.toHaveBeenCalled()
  })

   it('shows compact currency buttons and supports optional USD cash payment', async () => {
     renderProtected('pos')
     await screen.findByRole('heading', { name: 'Mango' })
     fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
      expect(screen.queryByRole('radio', { name: 'Transferencia' })).not.toBeInTheDocument()
      const cashRow = screen.getByTestId('cash-payment-row')
      const currencySelector = screen.getByTestId('pos-payment-currency')
      expect(cashRow).toContainElement(screen.getByRole('spinbutton', { name: 'Efectivo recibido en MXN' }))
      expect(cashRow).toContainElement(currencySelector)
      expect(within(currencySelector).getByText('MXN', { exact: true })).toBeInTheDocument()
      expect(within(currencySelector).getByText('USD', { exact: true })).toBeInTheDocument()
       expect(screen.getByText('Importe recibido', { exact: true })).toBeInTheDocument()
       const paymentMethodSelector = screen.getByRole('group', { name: 'Forma de pago' })
       expect(paymentMethodSelector).toHaveAttribute('role', 'group')
       expect(within(paymentMethodSelector).queryByRole('radio')).not.toBeInTheDocument()
       expect(screen.queryByRole('radio', { name: 'Efectivo' })).not.toBeInTheDocument()
       expect(screen.queryByRole('radio', { name: 'Tarjeta' })).not.toBeInTheDocument()
       const cashButton = within(paymentMethodSelector).getByRole('button', { name: 'Efectivo' })
       const cardButton = within(paymentMethodSelector).getByRole('button', { name: 'Tarjeta' })
       expect(cashButton).toHaveTextContent('Efectivo')
       expect(cardButton).toHaveTextContent('Tarjeta')
       expect(cashButton).toHaveAttribute('aria-pressed', 'true')
       expect(cardButton).toHaveAttribute('aria-pressed', 'false')
       expect(currencySelector).toHaveAttribute('role', 'group')
      expect(currencySelector).toHaveAttribute('aria-label', 'Moneda del pago')
      expect(screen.getByRole('button', { name: 'MXN' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'USD' })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: 'USD' })).toBeEnabled()
      expect(within(currencySelector).queryByRole('radio')).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: 'Pago en MXN' })).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: 'Pago en USD' })).not.toBeInTheDocument()
       fireEvent.click(cardButton)
       expect(cardButton).toHaveAttribute('aria-pressed', 'true')
       expect(cashButton).toHaveAttribute('aria-pressed', 'false')
       expect(screen.getByTestId('pos-card-currency')).toHaveTextContent('MXN')
      expect(screen.queryByTestId('cash-payment-row')).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: 'Pago en MXN' })).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: 'Pago en USD' })).not.toBeInTheDocument()
       fireEvent.click(cashButton)
       expect(cashButton).toHaveAttribute('aria-pressed', 'true')
       expect(cardButton).toHaveAttribute('aria-pressed', 'false')
       expect(screen.getByRole('button', { name: 'MXN' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'USD' })).toBeEnabled()
      fireEvent.click(screen.getByRole('button', { name: 'USD' }))
      const usdInput = screen.getByRole('spinbutton', { name: 'USD recibido' })
      expect(screen.getByTestId('cash-payment-row')).toContainElement(usdInput)
      fireEvent.change(usdInput, { target: { value: '3' } })
      expect(screen.getByRole('status')).toHaveTextContent('Equivalente recibido en MXN: $45.00 MXN')
      fireEvent.click(screen.getByRole('button', { name: 'MXN' }))
      expect(screen.getByRole('spinbutton', { name: 'Efectivo recibido en MXN' })).toBeInTheDocument()
      expect(screen.queryByRole('spinbutton', { name: 'USD recibido' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'USD' }))
      fireEvent.change(screen.getByRole('spinbutton', { name: 'USD recibido' }), { target: { value: '3' } })
      fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar' }))
      await screen.findByRole('heading', { name: 'Venta registrada' })
      expect(salesApi.recordSale).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ paymentCurrency: 'usd', usdMxnRate: 15, usdPaid: 3 }) }))
   })

   it('persists POS product and category quantities and restores them after a fresh render', async () => {
     const storageKey = createAdminSessionStorageKey({ userId: 'admin-1', branchId: null }, 'sales:pos')!
     const view = renderProtected('pos')
     await screen.findByRole('heading', { name: 'Mango' })
     fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     fireEvent.click(screen.getByRole('tab', { name: 'Vista por categoría' }))
     fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas a la venta' }))

     await waitFor(() => expect(JSON.parse(sessionStorage.getItem(storageKey) ?? 'null').state.quantities).toEqual({ 'product-1': '1', 'category:category-1': '1' }))
     view.unmount()

     renderProtected('pos')
     expect(await screen.findByLabelText('Cantidad de Mango')).toHaveValue('1')
     expect(await screen.findByLabelText('Cantidad de Categoría: Paletas')).toHaveValue('1')

     fireEvent.click(screen.getByRole('button', { name: 'Vaciar selección de venta' }))
     await waitFor(() => expect(JSON.parse(sessionStorage.getItem(storageKey) ?? 'null').state.quantities).toEqual({}))
   })

   it.each([
     ['malformed JSON', '{not-json'],
     ['a non-object value', '[]'],
     ['an invalid quantity entry', JSON.stringify({ 'product-1': 1 })],
   ])('ignores %s in the POS quantity draft safely', async (_description, storedValue) => {
      sessionStorage.setItem(createAdminSessionStorageKey({ userId: 'admin-1', branchId: null }, 'sales:pos')!, storedValue)
     renderProtected('pos')
     await screen.findByRole('heading', { name: 'Mango' })
     expect(screen.queryByLabelText('Cantidad de Mango')).not.toBeInTheDocument()
     expect(screen.queryByLabelText('Cantidad de Categoría: Paletas')).not.toBeInTheDocument()
   })

    it('uses the active cashier shift rate for the live USD received amount and payload', async () => {
    const activeShift = { usdMxnRate: 17.25 } as PosShift
    renderProtected('pos', undefined, activeShift)
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'USD' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'USD recibido' }), { target: { value: '6' } })
    expect(screen.getByRole('status')).toHaveTextContent('Equivalente recibido en MXN: $103.50 MXN')
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar' }))
    await screen.findByRole('heading', { name: 'Venta registrada' })
    expect(salesApi.recordSale).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ usdMxnRate: 17.25 }) }))
  })

   it('shows live cash change in MXN for MXN and USD cash payments', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))

     const mxnInput = screen.getByRole('spinbutton', { name: 'Efectivo recibido en MXN' })
     expect(mxnInput).toHaveClass('ops-no-number-spinner')
     expect(mxnInput).not.toHaveClass('pr-40', 'pr-52')
     fireEvent.change(mxnInput, { target: { value: '50' } })
     expect(mxnInput).toHaveClass('pr-40')
    const mxnRow = screen.getByTestId('cash-input-row-mxn')
    const mxnIndicator = screen.getByTestId('cash-change-mxn')
    expect(mxnIndicator.parentElement).toBe(mxnRow)
    expect(mxnRow).toContainElement(mxnInput)
    expect(mxnIndicator).toHaveTextContent('Cambio')
    expect(mxnIndicator).toHaveTextContent('$7.50 MXN')

     fireEvent.click(screen.getByRole('button', { name: 'USD' }))
     const usdInput = screen.getByRole('spinbutton', { name: 'USD recibido' })
     expect(usdInput).toHaveClass('ops-no-number-spinner')
     expect(usdInput).not.toHaveClass('pr-40', 'pr-52')
     fireEvent.change(usdInput, { target: { value: '4' } })
     expect(usdInput).toHaveClass('pr-52')
    const usdRow = screen.getByTestId('cash-input-row-usd')
    const usdIndicator = screen.getByTestId('cash-change-usd')
    expect(usdIndicator.parentElement).toBe(usdRow)
    expect(usdRow).toContainElement(usdInput)
    expect(usdIndicator).toHaveTextContent('Cambio en MXN')
    expect(usdIndicator).toHaveTextContent('$17.50 MXN')
  })

  it('shows a shortage and blocks review when cash is below the visible total', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    const received = screen.getByRole('spinbutton', { name: 'Efectivo recibido en MXN' })
    fireEvent.change(received, { target: { value: '40' } })

    const shortageIndicator = screen.getByTestId('cash-change-mxn')
    expect(shortageIndicator.parentElement).toBe(screen.getByTestId('cash-input-row-mxn'))
    expect(shortageIndicator).toHaveAttribute('role', 'alert')
    expect(shortageIndicator).toHaveAttribute('aria-live', 'polite')
    expect(shortageIndicator).toHaveTextContent('Faltan')
    expect(shortageIndicator).toHaveTextContent('$2.50 MXN')
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))

    expect(screen.getByText('El efectivo recibido debe cubrir el total de la venta.', { selector: 'p' })).toBeInTheDocument()
    expect(received).toHaveAttribute('aria-invalid', 'true')
     expect(screen.queryByRole('dialog', { name: 'Confirmar registro de venta' })).not.toBeInTheDocument()
    expect(salesApi.recordSale).not.toHaveBeenCalled()
  })

   it('validates USD received before review and exposes linked field feedback', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'USD' }))
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))

    const usdInput = screen.getByRole('spinbutton', { name: /USD recibido/ })
    expect(usdInput).toHaveAttribute('aria-invalid', 'true')
    expect(usdInput).toHaveAttribute('aria-describedby', expect.stringContaining('usdPaid'))
    expect(screen.getByText('Captura el monto recibido en USD.', { selector: 'p' })).toBeInTheDocument()

    fireEvent.change(usdInput, { target: { value: '0' } })
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
    expect(screen.getByText('El monto recibido en USD debe ser positivo y finito.', { selector: 'p' })).toBeInTheDocument()
    expect(salesApi.recordSale).not.toHaveBeenCalled()
  })

  it('exposes icons and full accessible names for sales actions', async () => {
     renderProtected()
     expect(await screen.findByRole('heading', { name: 'Mango' })).toBeInTheDocument()
     expect(screen.queryByRole('button', { name: 'Realizar venta' })).not.toBeInTheDocument()
     expect(screen.queryByLabelText('0 artículos')).not.toBeInTheDocument()

     const refreshButton = screen.getByRole('button', { name: 'Actualizar productos' })
    expect(refreshButton.parentElement).toContainElement(screen.getByRole('searchbox'))
    expect(refreshButton.querySelector('[data-icon="refresh"]')).toBeInTheDocument()
    expect(refreshButton).toHaveAttribute('title', 'Actualizar productos')

     const addButton = screen.getByRole('button', { name: 'Agregar Mango a la venta' })
     expect(addButton.querySelector('[data-icon="plus"]')).not.toBeInTheDocument()
     expect(addButton).toHaveAttribute('title', 'Agregar Mango a la venta')
     expect(addButton).toHaveAttribute('tabindex', '0')
     expect(addButton).toHaveClass('cursor-pointer')

     fireEvent.click(addButton)
     const reviewButton = screen.getByRole('button', { name: 'Realizar venta' })
     expect(reviewButton.querySelector('[data-icon="sale"]')).toBeInTheDocument()
     expect(reviewButton).toHaveAttribute('title', 'Realizar venta')
      const clearButton = screen.getByRole('button', { name: 'Vaciar selección de venta' })
       const cart = screen.getByRole('complementary', { name: 'Resumen del carrito' })
       const cartHeader = cart.firstElementChild
       expect(cartHeader).toHaveClass('flex', 'items-center', 'justify-between')
       expect(cartHeader).not.toHaveClass('flex-wrap')
       expect(within(cartHeader as HTMLElement).getByLabelText('1 artículo')).toHaveTextContent('1')
      expect(reviewButton.parentElement).toHaveClass('shrink-0', 'justify-end')
      expect(reviewButton).toHaveClass('min-h-11')
      expect(clearButton).toHaveClass('h-11', 'w-11', 'min-h-11', 'min-w-11')
      expect(reviewButton.parentElement?.firstElementChild).toBe(reviewButton)
      expect(reviewButton.parentElement).toContainElement(clearButton)
  })

  it('explains the required payment details through an info tooltip', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })

    const infoButton = screen.getByRole('button', { name: 'Explicar forma de pago' })
    expect(infoButton).toHaveClass('border-transparent', 'bg-transparent')
    expect(screen.queryByText('Selecciona la forma de pago y captura los importes recibidos cuando corresponda.', { selector: 'p' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.click(infoButton)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Selecciona la forma de pago y captura los importes recibidos cuando corresponda.')
  })

  it('moves catalog guidance into tooltips and keeps view controls icon-only before refresh', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })

    expect(screen.queryByText('Selecciona productos y ajusta las cantidades para esta venta.', { selector: 'p' })).not.toBeInTheDocument()
    expect(screen.queryByText('Toca una tarjeta para armar la venta. Ajusta las cantidades en el carrito.', { selector: 'p' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Vista por producto' })).toHaveClass('ops-icon-button')
    expect(screen.getByRole('tab', { name: 'Vista por categoría' })).toHaveClass('ops-icon-button')
    const refreshButton = screen.getByRole('button', { name: 'Actualizar productos' })
    expect(refreshButton.previousElementSibling).toContainElement(screen.getByRole('tab', { name: 'Vista por categoría' }))
  })

  it.each([
     ['wholesale', 'Datos del pedido mayorista', 'Precio de mayoreo', '$35.00'],
   ] as const)('renders the fixed %s channel as a distinct module', async (channel, detailsTitle, priceLabel, price) => {
     renderProtected(channel)
     expect(await screen.findByRole('button', { name: 'Actualizar productos' })).toBeInTheDocument()
     expect(screen.getByRole('heading', { name: detailsTitle })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(screen.getAllByText(priceLabel, { exact: true }).length).toBeGreaterThan(0)
    expect(screen.getAllByText(price).length).toBeGreaterThan(0)
    expect(screen.queryByRole('tablist', { name: 'Canal de venta' })).not.toBeInTheDocument()
  })

   it('defaults POS payment to cash and removes customer information from the POS details', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     expect(screen.getByRole('button', { name: 'Efectivo' })).toHaveAttribute('aria-pressed', 'true')
     expect(screen.getByRole('button', { name: 'MXN' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('textbox', { name: /Nombre del cliente/ })).not.toBeInTheDocument()
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar' }))
    await screen.findByRole('heading', { name: 'Venta registrada' })
    expect(salesApi.recordSale).toHaveBeenCalledWith(expect.objectContaining({ details: { channel: 'pos', paymentMethod: 'cash' } }))
  })

   it('validates and submits the wholesale business context', async () => {
    renderProtected('wholesale')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
     expect(screen.getAllByRole('alert').some((element) => element.textContent?.includes('método de entrega'))).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre del cliente/ }), { target: { value: 'Tienda La Plaza' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Teléfono/ }), { target: { value: '55 1234 5678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Método de entrega' }))
    expect(screen.getByRole('listbox', { name: 'Método de entrega' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Entrega' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Crédito' }))
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar' }))
    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument()
    expect(salesApi.recordSale).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'wholesale',
      details: { channel: 'wholesale', customerName: 'Tienda La Plaza', phone: '55 1234 5678', deliveryMethod: 'delivery', paymentMethod: 'credit' },
    }))
  })

  it('validates wholesale phone format near the affected field', async () => {
    renderProtected('wholesale')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre del cliente/ }), { target: { value: 'Tienda La Plaza' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Teléfono/ }), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Método de entrega' }))
    fireEvent.click(screen.getByRole('option', { name: 'Entrega' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Crédito' }))
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))

    const phoneInput = screen.getByRole('textbox', { name: /Teléfono/ })
    expect(phoneInput).toHaveAttribute('aria-invalid', 'true')
    expect(phoneInput).toHaveAttribute('aria-describedby', expect.stringContaining('phone'))
    expect(screen.getByText('Ingresa un teléfono válido de 7 a 15 dígitos.', { selector: 'p' })).toBeInTheDocument()
    expect(salesApi.recordSale).not.toHaveBeenCalled()
  })

   it('disables direct event sales and directs operators to reservations', async () => {
     renderProtected('event')
     expect(await screen.findByTestId('event-sales-disabled')).toBeInTheDocument()
     expect(screen.getByRole('heading', { name: 'Las ventas de eventos se gestionan en Eventos' })).toBeInTheDocument()
     expect(productApi.listActiveProductsForPos).not.toHaveBeenCalled()
     expect(salesApi.recordSale).not.toHaveBeenCalled()
   })

   it('uses the configured USD rate only when no active shift rate exists', async () => {
     configurationApi.get.mockResolvedValue([
       { key: 'event_daily_capacity', value: 7 },
       { key: 'pos_usd_mxn_rate', value: 18.5 },
       { key: 'pos_wholesale_threshold', value: 10 },
     ])
     renderProtected('pos')
     await screen.findByRole('heading', { name: 'Mango' })
     fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'USD' }))
     fireEvent.change(screen.getByRole('spinbutton', { name: 'USD recibido' }), { target: { value: '3' } })
     expect(screen.getByRole('status')).toHaveTextContent('Equivalente recibido en MXN: $55.50 MXN')
   })

   it('maps product images into sale cards and keeps the fallback tile', async () => {
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    expect(screen.getByRole('img', { name: 'Mango' })).toHaveAttribute('src', 'https://cdn.example.com/mango.jpg')
     expect(screen.getByRole('img', { name: 'Strawberry' })).toHaveAttribute('aria-label', 'Strawberry')
     expect(screen.getAllByTestId('sales-product-card')[0]).not.toHaveTextContent('M-01')
     expect(screen.getAllByTestId('sales-product-card')[0]).toHaveTextContent('Paletas')
   })

  it('changes cart quantities with touch-sized stepper controls', async () => {
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
     fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     const quantityInput = screen.getByLabelText('Cantidad de Mango')
     expect(quantityInput).toHaveValue('1')
     expect(quantityInput).toHaveAttribute('type', 'text')
     expect(quantityInput).toHaveAttribute('inputmode', 'numeric')
     expect(quantityInput).toHaveAttribute('pattern', '[0-9]*')
     fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Mango' }))
     expect(screen.getByLabelText('Cantidad de Mango')).toHaveValue('2')
     fireEvent.click(screen.getByRole('button', { name: 'Disminuir cantidad de Mango' }))
     expect(screen.getByLabelText('Cantidad de Mango')).toHaveValue('1')
   })

  it('removes only the selected product or category line and keeps payment details', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     fireEvent.click(screen.getByRole('tab', { name: 'Vista por categoría' }))
     fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas a la venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Tarjeta' }))

    expect(screen.getByRole('button', { name: 'Vaciar selección de venta' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Categoría: Paletas de la venta' }))
    expect(screen.queryByLabelText('Cantidad de Categoría: Paletas')).not.toBeInTheDocument()
     expect(screen.getByLabelText('Cantidad de Mango')).toHaveValue('1')
     expect(screen.getByRole('button', { name: 'Tarjeta' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Mango de la venta' }))
    expect(screen.queryByLabelText('Cantidad de Mango')).not.toBeInTheDocument()
     expect(screen.getByRole('button', { name: 'Tarjeta' })).toHaveAttribute('aria-pressed', 'true')
  })

   it('aggregates a product line and a category line at the POS wholesale threshold', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    for (let index = 1; index < 9; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Agregar otra unidad de Mango a la venta' }))
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Vista por categoría' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas a la venta' }))

    expect(screen.getByText('Estimación visible').parentElement).toHaveTextContent('$350.00 MXN')
     expect(screen.getByLabelText('Cantidad de Mango').closest('li')).not.toHaveTextContent('Aplicado:')
     expect(screen.getByLabelText('Cantidad de Categoría: Paletas').closest('li')).not.toHaveTextContent('Aplicado:')
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar' }))
    await screen.findByRole('heading', { name: 'Venta registrada' })
    expect(screen.getByTestId('ticket-preview')).toHaveTextContent('$315.00 MXN')
    expect(screen.getByTestId('ticket-preview')).toHaveTextContent('$35.00 MXN')
    expect(salesApi.recordSale).toHaveBeenCalledWith(expect.objectContaining({ items: [
      { productId: 'product-1', quantity: 9 },
      { lineKind: 'category', categoryId: 'category-1', quantity: 1 },
    ] }))
  })

  it('validates positive integer quantities before review', async () => {
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    fireEvent.change(screen.getByLabelText('Cantidad de Mango'), { target: { value: '0' } })
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
    expect(screen.getAllByRole('alert').some((element) => element.textContent?.includes('número entero positivo'))).toBe(true)
    fireEvent.change(screen.getByLabelText('Cantidad de Mango'), { target: { value: '2.5' } })
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
    expect(screen.getAllByRole('alert').some((element) => element.textContent?.includes('número entero positivo'))).toBe(true)
    expect(salesApi.recordSale).not.toHaveBeenCalled()
  })

   it('confirms a validated sale and shows the server receipt', async () => {
     renderProtected()
     await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Mango' }))
     fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
     expect(await screen.findByRole('dialog', { name: 'Confirmar registro de venta' })).toBeInTheDocument()
    expect(salesApi.recordSale).not.toHaveBeenCalled()
     fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar' }))
     expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument()
     expect(screen.getByText('Total confirmado').parentElement).toHaveTextContent('$85.00 MXN')
     const ticket = screen.getByTestId('ticket-preview')
     expect(ticket).toHaveClass('mx-auto', 'w-full', 'max-w-[80mm]', 'min-w-0', 'border-slate-200', 'bg-white', 'text-black')
     expect(ticket.firstElementChild).toHaveClass('border-b', 'border-slate-200')
     expect(ticket.querySelector('ul')).toHaveClass('divide-y', 'divide-slate-200')
     expect(ticket.querySelector('dl')).toHaveClass('border-t', 'border-slate-200')
     expect(within(ticket).getByRole('heading', { name: 'Ticket de venta' })).toHaveClass('text-black')
     expect(screen.getByTestId('ticket-logo-fallback')).toHaveClass('bg-slate-100', 'text-black')
     expect(ticket.querySelector('.text-white')).toBeNull()
      expect(salesApi.recordSale).toHaveBeenCalledWith({ requestId: 'request-1', channel: 'pos', details: { channel: 'pos', paymentMethod: 'cash' }, items: [{ productId: 'product-1', quantity: 2 }] })
   })

   it('opens the confirmation modal without registering the sale', async () => {
     renderProtected()
     await screen.findByRole('heading', { name: 'Mango' })
     fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))

     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))

     const dialog = await screen.findByRole('dialog', { name: 'Confirmar registro de venta' })
     expect(dialog).toHaveTextContent('Verifica la venta antes de registrarla.')
     expect(dialog).toHaveTextContent('¿Verificaste la venta antes de registrarla?')
     expect(dialog).toHaveTextContent('Al confirmar, la venta se registrará en el sistema.')
     expect(screen.getByRole('button', { name: 'Realizar venta' })).toBeInTheDocument()
     expect(salesApi.recordSale).not.toHaveBeenCalled()
   })

   it('keeps the sale pending and editable when confirmation is canceled or closed', async () => {
     renderProtected()
     await screen.findByRole('heading', { name: 'Mango' })
     fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))

     const dialog = await screen.findByRole('dialog', { name: 'Confirmar registro de venta' })
     fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
     expect(screen.queryByRole('dialog', { name: 'Confirmar registro de venta' })).not.toBeInTheDocument()
     expect(salesApi.recordSale).not.toHaveBeenCalled()

     fireEvent.change(screen.getByLabelText('Cantidad de Mango'), { target: { value: '2' } })
     expect(screen.getByLabelText('Cantidad de Mango')).toHaveValue('2')

     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
     const reopenedDialog = await screen.findByRole('dialog', { name: 'Confirmar registro de venta' })
     fireEvent.click(within(reopenedDialog).getByRole('button', { name: 'Cancelar confirmación' }))
     expect(screen.queryByRole('dialog', { name: 'Confirmar registro de venta' })).not.toBeInTheDocument()
     expect(screen.getByLabelText('Cantidad de Mango')).toHaveValue('2')
     expect(salesApi.recordSale).not.toHaveBeenCalled()
   })

   it('opens the receipt in a modal, prints it, and resets the sale when closed', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar' }))

    const dialog = await screen.findByRole('dialog', { name: 'Venta registrada' })
    expect(within(dialog).getByTestId('ticket-preview')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Imprimir ticket' })).toBeInTheDocument()
    expect(within(dialog).getByTestId('ticket-preview')).toHaveAttribute('data-print-ticket', 'true')
    expect(dialog).not.toHaveTextContent('Ticket no fiscal')
    expect(dialog).not.toHaveTextContent('Comprobante informativo de la venta')
    expect(screen.queryByRole('button', { name: 'Iniciar otra venta' })).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Imprimir ticket' }))
    expect(printSpy).toHaveBeenCalledTimes(1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar ticket' }))

     expect(screen.queryByRole('dialog', { name: 'Venta registrada' })).not.toBeInTheDocument()
     expect(screen.queryByLabelText('Cantidad de Mango')).not.toBeInTheDocument()
     expect(screen.getByRole('button', { name: 'Efectivo' })).toHaveAttribute('aria-pressed', 'true')
  })

   it('renders the USD equivalent and MXN-per-USD rate with explicit currency labels', async () => {
    vi.mocked(salesApi.recordSale).mockResolvedValue(usdReceipt)
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
     fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
     fireEvent.click(screen.getByRole('button', { name: 'USD' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'USD recibido' }), { target: { value: '6' } })
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar' }))

    const conversion = (await screen.findByText('Conversión informativa')).parentElement
    expect(conversion).toHaveTextContent('Equivalente: $5.00 USD · Tipo de cambio: $17.00 MXN por USD')
    expect(conversion).not.toHaveTextContent('$5.00 MXN')
  })

  it('recovers from a sale API error with an idempotent retry', async () => {
    vi.mocked(salesApi.recordSale).mockRejectedValueOnce(new Error('server')).mockResolvedValueOnce(receipt)
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
     fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
     fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
     fireEvent.click(screen.getByRole('button', { name: 'Realizar venta' }))
     fireEvent.click(await screen.findByRole('button', { name: 'Confirmar y registrar' }))
    expect(await screen.findByText('No se pudo registrar la venta. Inténtalo de nuevo.')).toBeInTheDocument()
     fireEvent.click(screen.getByRole('button', { name: 'Reintentar venta' }))
     fireEvent.click(await screen.findByRole('button', { name: 'Confirmar y registrar' }))
    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument()
    expect(salesApi.recordSale).toHaveBeenCalledTimes(2)
    const calls = vi.mocked(salesApi.recordSale).mock.calls
    expect(calls[0][0].requestId).toBe(calls[1][0].requestId)
  })

  it('creates a standards-compliant UUID v4 when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', { getRandomValues: (values: Uint8Array) => { values.fill(0); return values } })
    const requestId = createRequestId()
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
