import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveWholesaleCustomerSession } from '../api/customerSession'
import type { WholesaleOrder } from '../api/types'

const api = vi.hoisted(() => ({
  login: vi.fn(), logout: vi.fn(), listCatalog: vi.fn(), listOrders: vi.fn(), create: vi.fn(), update: vi.fn(), reorder: vi.fn(), cancel: vi.fn(), delete: vi.fn(), upload: vi.fn(), refreshTicket: vi.fn(), remove: vi.fn(), cleanupTickets: vi.fn(), subscribe: vi.fn(),
}))
vi.mock('../api/customerAuth', () => ({ loginWholesaleCustomer: api.login, logoutWholesaleCustomer: api.logout }))
vi.mock('../api/catalog', () => ({ listPublicWholesaleCatalog: api.listCatalog }))
vi.mock('../api/orders', () => ({ createWholesaleCustomerOrder: api.create, updateWholesaleCustomerOrder: api.update, listWholesaleCustomerOrders: api.listOrders, reorderWholesaleCustomerOrder: api.reorder, cancelWholesaleCustomerOrder: api.cancel, deleteWholesaleCustomerOrder: api.delete }))
vi.mock('../api/transferTickets', () => ({ uploadWholesaleTransferTicket: api.upload, refreshWholesaleTransferTicketUrl: api.refreshTicket, removeWholesaleTransferTicket: api.remove, cleanupWholesaleTransferTickets: api.cleanupTickets }))
vi.mock('../api/realtime', () => ({ subscribeToWholesaleOrderEvents: api.subscribe }))
import { DraftCatalog, WholesaleCustomerPortal } from './WholesaleCustomerPortal'

const session = { sessionToken: 'session-token', customer: { id: 'customer-1', name: 'Tienda La Plaza', email: null }, expiresAt: '2099-09-22T00:00:00Z' } as const
const catalog = [{ id: 'product-1', name: 'Mango', sku: 'M-01', categoryId: 'category-1', category: 'Paletas', retailPriceMxn: 12.5, wholesalePriceMxn: 10, imageUrl: 'https://cdn.example.com/mango.jpg' }]
const catalogWithCategories = [...catalog, { id: 'product-2', name: 'Agua limón', sku: 'A-02', categoryId: 'category-2', category: 'Bebidas', retailPriceMxn: 18, wholesalePriceMxn: 14, imageUrl: null }]
const catalogWithMixedCategoryLines = [
  ...catalog,
  { id: 'product-2', name: 'Fresa', sku: 'F-02', categoryId: 'category-1', category: 'Paletas', retailPriceMxn: 12.5, wholesalePriceMxn: 10, imageUrl: null },
]
const order: WholesaleOrder = {
  id: 'order-1', customerId: 'customer-1', customerName: 'Tienda La Plaza', customerMobile: '+525512345678', customerEmail: null,
  status: 'pending', paymentMethod: 'cash', transferTicket: null, totalMxn: 25, saleId: null, source: 'customer',
  createdAt: '2026-08-23T00:00:00Z', updatedAt: '2026-08-23T00:00:00Z', completedAt: null, cancelledAt: null, deletedAt: null,
  paymentAmount: null, paymentCurrency: null, paymentConfirmedAt: null, paymentConfirmedBy: null, paymentReference: null,
  paymentNote: null, deliveryAgreement: null, adminSeenAt: null, adminSeenBy: null, reorderedFromOrderId: null, saleGeneration: null,
  items: [{ id: 'item-1', lineKind: 'product', productId: 'product-1', categoryId: null, categoryName: null, productName: 'Mango', unitPriceMxn: 12.5, quantity: 2, lineTotalMxn: 25 }],
}
const processingOrder: WholesaleOrder = { ...order, status: 'processing', updatedAt: '2026-08-23T01:00:00Z' }
const transferOrder: WholesaleOrder = { ...order, id: 'order-2', paymentMethod: 'transfer', transferTicket: { url: 'https://cdn.example.com/ticket.webp', key: 'customers/customer-1/ticket.webp' } }

type TestRealtimeMessage = { customer_id?: string; order_id?: string; status?: string; deleted?: boolean; updated_at?: string }
let realtimeListener: ((message: TestRealtimeMessage) => void) | undefined

function openProductView() {
  fireEvent.click(screen.getByRole('tab', { name: 'Vista por producto' }))
}

function openReview() {
  fireEvent.click(screen.getByRole('button', { name: 'Revisar pedido' }))
  expect(screen.getByText('Paso 2 de 2')).toBeInTheDocument()
}

function openOrderConfirmation(label = 'Enviar pedido', dialogName = 'Confirmar envío') {
  fireEvent.click(screen.getByRole('button', { name: label }))
  return screen.getByRole('dialog', { name: dialogName })
}

function confirmOrderSubmission(label = 'Enviar pedido', dialogName = 'Confirmar envío', confirmationLabel = 'Confirmar y enviar') {
  const dialog = openOrderConfirmation(label, dialogName)
  fireEvent.click(within(dialog).getByRole('button', { name: confirmationLabel }))
}

describe('WholesaleCustomerPortal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    realtimeListener = undefined
    window.sessionStorage.clear()
    window.localStorage.clear()
    api.listCatalog.mockResolvedValue(catalog)
    api.listOrders.mockResolvedValue([])
    api.create.mockResolvedValue(order)
    api.update.mockResolvedValue(order)
    api.reorder.mockResolvedValue(order)
    api.cancel.mockResolvedValue({ ...order, status: 'cancelled' })
    api.delete.mockResolvedValue({ ...order, deletedAt: '2026-08-23T01:00:00Z' })
    api.remove.mockResolvedValue({ key: 'customers/customer-1/ticket.webp', removed: true, referenced: false })
    api.refreshTicket.mockImplementation(async (_sessionToken: string, key: string) => ({ url: 'https://cdn.example.com/refreshed-ticket.webp', key }))
    api.cleanupTickets.mockResolvedValue({ removedKeys: [], retainedKeys: [] })
    api.subscribe.mockImplementation(async (listener) => {
      realtimeListener = listener
      return () => {
        if (realtimeListener === listener) realtimeListener = undefined
      }
    })
  })
  afterEach(() => vi.restoreAllMocks())
  afterEach(cleanup)

  function emitRealtime(message: TestRealtimeMessage) {
    if (!realtimeListener) throw new Error('Realtime listener was not registered')
    realtimeListener(message)
  }

  it('keeps catalog parity opt-in so the customer catalog retains its existing presentation', () => {
    const draft = { reorderFromOrderId: null, items: {}, paymentMethod: 'cash' as const, transferTicket: null }
    const onChange = vi.fn()
    const view = render(<DraftCatalog draft={draft} catalog={catalog} showPortalTabs={false} onChange={onChange} />)

    expect(screen.queryByTestId('catalog-controls-header')).not.toBeInTheDocument()
    expect(screen.getByTestId('wholesale-category-card')).not.toHaveAttribute('data-catalog-selection-card')

    view.rerender(<DraftCatalog draft={draft} catalog={catalog} showPortalTabs={false} presentationVariant="admin" onChange={onChange} />)

    expect(screen.getByTestId('catalog-controls-header')).toBeInTheDocument()
    expect(screen.getByTestId('wholesale-category-card')).toHaveAttribute('data-catalog-selection-card', '')
    expect(screen.getByTestId('wholesale-price-pair')).toHaveTextContent('Menudeo')
    expect(screen.getByTestId('wholesale-price-pair')).toHaveTextContent('Mayorista')
  })

  it('keeps customer login separate from the admin boundary and stores a dedicated session', async () => {
    api.login.mockResolvedValue({ authenticated: true, ...session })
    render(<WholesaleCustomerPortal />)
    fireEvent.change(screen.getByLabelText('Celular'), { target: { value: '55 1234 5678' } })
    fireEvent.change(screen.getByLabelText('PIN de 4 dígitos'), { target: { value: '0042' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByRole('heading', { name: 'Tienda La Plaza' })).toBeInTheDocument()
    expect(api.login).toHaveBeenCalledWith(expect.objectContaining({ mobile: '55 1234 5678', pin: '0042' }))
    expect(window.sessionStorage.getItem('paletixa-wholesale-customer-session-v1')).toContain('session-token')
  })

  it('shows the theme toggle in the authenticated customer header', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)

    await screen.findByRole('heading', { name: 'Tienda La Plaza' })

    const banner = screen.getByRole('banner')
    expect(banner).toContainElement(screen.getByRole('button', { name: 'Cambiar al tema claro' }))
    expect(banner).toHaveClass('ops-navbar-header')
    expect(screen.getByRole('button', { name: 'Cambiar al tema claro' })).toHaveClass('ops-navbar-action')
    expect(within(banner).getByRole('button', { name: 'Información del portal mayorista' })).toHaveClass('ops-navbar-action')
    expect(within(banner).getByRole('button', { name: /^Notificaciones:/ })).toHaveClass('ops-navbar-action')
  })

  it('opens order confirmation without calling the customer order API', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    await openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()
    fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' }), { target: { value: 2 } })

    const dialog = openOrderConfirmation()

    expect(dialog).toHaveTextContent('2')
    expect(dialog).toHaveTextContent('$25.00 MXN')
    expect(dialog).toHaveTextContent('Efectivo')
    expect(within(dialog).getByRole('button', { name: 'Cerrar confirmación' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('cancels order confirmation without calling the customer order API', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    await openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()

    const dialog = openOrderConfirmation()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar confirmación' }))

    expect(screen.queryByRole('dialog', { name: 'Confirmar envío' })).not.toBeInTheDocument()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('submits a new editable draft through the customer order API after confirmation', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    await openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()
    fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' }), { target: { value: '2' } })
    confirmOrderSubmission()

    await waitFor(() => expect(api.create).toHaveBeenCalledWith('session-token', expect.objectContaining({ items: [{ productId: 'product-1', quantity: 2 }], paymentMethod: 'cash' })))
    expect(await screen.findByRole('status')).toHaveTextContent('Pedido enviado correctamente.')
    expect(screen.queryByRole('dialog', { name: 'Confirmar envío' })).not.toBeInTheDocument()
    await waitFor(() => expect(window.localStorage.getItem('paletixa:wholesale-draft:customer-1')).toBeNull())
  })

  it('uses two mobile checkout steps and keeps the catalog outside the submit form', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })

    const reviewButton = screen.getByRole('button', { name: 'Revisar pedido' })
    expect(reviewButton).toBeDisabled()
    const catalogSection = screen.getByRole('region', { name: 'Arma tu pedido' })
    expect(catalogSection.closest('form')).toBeNull()
    expect(catalogSection.parentElement?.parentElement).toHaveClass('lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]')

    openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    expect(reviewButton).not.toBeDisabled()
    openReview()
    expect(screen.getByRole('button', { name: 'Volver al catálogo' })).toBeInTheDocument()
    const reviewHeader = screen.getByText('Paso 2 de 2').parentElement?.parentElement
    expect(reviewHeader).toHaveClass('mb-0', 'gap-2')

    fireEvent.click(screen.getByRole('button', { name: 'Volver al catálogo' }))
    expect(screen.getByRole('button', { name: 'Revisar pedido' })).toBeInTheDocument()
  })

  it('bounds selected-line scrolling on mobile and desktop while keeping payment and submit outside', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()

    const summary = screen.getByRole('complementary', { name: 'Resumen del pedido' })
    const selectedLines = screen.getByTestId('wholesale-selected-lines')
    const reviewForm = screen.getByRole('button', { name: 'Enviar pedido' }).closest('form')
    expect(selectedLines).toHaveClass('max-h-[min(28rem,42dvh)]', 'overflow-y-auto', 'lg:min-h-0', 'lg:flex-1', 'lg:max-h-none', 'lg:overflow-y-auto', 'lg:overscroll-contain', 'flex-1')
    expect(reviewForm).toHaveClass('flex', 'flex-1', 'min-h-0', 'flex-col', 'gap-2', 'overflow-hidden', 'lg:flex-1', 'lg:min-h-0', 'lg:overflow-hidden')
    expect(summary).toHaveClass('flex-1', 'min-h-0', 'flex-col', 'overflow-hidden', 'lg:h-full', 'lg:min-h-0', 'lg:flex-1', 'lg:flex-col', 'lg:overflow-hidden')
    const paymentGroup = screen.getByRole('group', { name: 'Método de pago' })
    const submitButton = screen.getByRole('button', { name: 'Enviar pedido' })
    const paymentPanel = screen.getByTestId('wholesale-payment-panel')
    expect(paymentPanel).toHaveClass('mt-3', 'pt-3')
    expect(paymentGroup).toHaveClass('mt-2', 'gap-1.5')
    expect(screen.getByRole('button', { name: 'Efectivo' })).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: 'Transferencia' })).toHaveClass('min-h-11')
    expect(selectedLines).not.toContainElement(paymentGroup)
    expect(selectedLines).not.toContainElement(submitButton)
    expect(summary).toContainElement(paymentGroup)
    expect(summary).toContainElement(submitButton)
    expect(summary).not.toHaveTextContent('El total usa el precio mayorista desde el umbral aplicable por producto o categoría.')

    fireEvent.click(screen.getByRole('button', { name: 'Explicar cálculo del total' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('El total usa el precio mayorista desde el umbral aplicable por producto o categoría.')
  })

  it('contains the page only during mobile review, not catalog or Mis pedidos', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })

    const page = screen.getByRole('main')
    expect(page).toHaveClass('flex', 'h-dvh', 'min-h-0', 'flex-col', 'overflow-hidden')
    expect(page).toHaveClass('min-w-0')
    expect(page.firstElementChild).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col')
    const catalogPanel = screen.getByRole('region', { name: 'Arma tu pedido' }).parentElement
    expect(catalogPanel).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col', 'overflow-hidden', 'lg:flex', 'lg:min-h-0', 'lg:overflow-hidden')
    expect(catalogPanel?.parentElement).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col', 'overflow-hidden', 'lg:min-h-0', 'lg:flex-1')
    expect(screen.getByTestId('wholesale-catalog-scroll')).toHaveClass('lg:min-h-0', 'lg:flex-1', 'lg:max-h-none', 'lg:overflow-y-auto', 'lg:overscroll-contain')
    expect(screen.getByTestId('wholesale-catalog-scroll')).toHaveClass('ops-scroll-region')
    expect(screen.getByRole('button', { name: 'Revisar pedido' }).parentElement?.parentElement).toHaveClass('ops-mobile-action-bar', 'lg:hidden')

    await openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()

    expect(page).toHaveClass('h-dvh', 'overflow-hidden', 'pt-[calc(0.75rem+env(safe-area-inset-top))]', 'pb-[calc(0.75rem+env(safe-area-inset-bottom))]')
    expect(page.firstElementChild).toHaveClass('h-full', 'min-h-0')
    expect(screen.getByRole('button', { name: 'Volver al catálogo' }).closest('form')).toHaveClass('min-h-0', 'flex', 'flex-1', 'flex-col', 'gap-2', 'overflow-hidden', 'lg:flex-1', 'lg:overflow-hidden')
    expect(screen.getByRole('complementary', { name: 'Resumen del pedido' })).toHaveClass('min-h-0', 'flex-1', 'flex-col', 'overflow-hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Volver al catálogo' }))
    expect(page).toHaveClass('flex', 'h-dvh', 'min-h-0', 'flex-col', 'overflow-hidden')

    fireEvent.click(screen.getByRole('tab', { name: 'Mis pedidos' }))
    expect(page).toHaveClass('flex', 'h-dvh', 'min-h-0', 'flex-col', 'overflow-hidden')
  })

  it('toggles between category and product catalog views with POS icon semantics', async () => {
    saveWholesaleCustomerSession(session)
    api.listCatalog.mockResolvedValue(catalogWithCategories)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })

    expect(screen.getByRole('tab', { name: 'Vista por categoría' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByTestId('wholesale-category-card')).toHaveLength(2)
    expect(screen.queryByTestId('wholesale-product-card')).not.toBeInTheDocument()

    openProductView()
    expect(screen.getByRole('tab', { name: 'Vista por producto' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByTestId('wholesale-product-card')).toHaveLength(2)
    expect(within(screen.getByRole('button', { name: 'Agregar Mango al pedido' })).queryByRole('textbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Vista por categoría' }))
    expect(screen.getAllByTestId('wholesale-category-card')).toHaveLength(2)
  })

  it('adds a category line from the category tile and stays in category view', async () => {
    saveWholesaleCustomerSession(session)
    api.listCatalog.mockResolvedValue(catalogWithCategories)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })

    expect(screen.getAllByText('1 producto')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Bebidas al pedido' }))
    openReview()

    expect(screen.getByRole('textbox', { name: 'Cantidad en carrito de Bebidas' })).toHaveValue('1')
    expect(screen.getByRole('button', { name: 'Agregar otra unidad de categoría Bebidas al pedido' })).toBeInTheDocument()
    expect(screen.getAllByTestId('wholesale-category-card')).toHaveLength(2)
    expect(screen.queryByTestId('wholesale-product-card')).not.toBeInTheDocument()
    confirmOrderSubmission()
    await waitFor(() => expect(api.create).toHaveBeenCalledWith('session-token', expect.objectContaining({ items: [{ lineKind: 'category', categoryId: 'category-2', quantity: 1 }] })))
  })

  it('opens and closes Mis pedidos as a dedicated portal tab', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })

    fireEvent.click(screen.getByRole('tab', { name: 'Mis pedidos' }))
    expect(screen.getByRole('heading', { name: 'Mis pedidos' })).toBeInTheDocument()
    expect(screen.queryByText('Arma tu pedido')).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Resumen del pedido' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo' }))
    expect(screen.getByText('Arma tu pedido')).toBeInTheDocument()
  })

  it('uses the customer order-card hierarchy without visible IDs or Nuevo badges', async () => {
    saveWholesaleCustomerSession(session)
    api.listOrders.mockResolvedValue([order, transferOrder])
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    fireEvent.click(screen.getByRole('tab', { name: 'Mis pedidos' }))

    const cards = screen.getAllByTestId('wholesale-customer-order-card')
    expect(cards).toHaveLength(2)
    expect(screen.queryByText('Nuevo')).not.toBeInTheDocument()
    expect(within(cards[0]).getByText('Efectivo')).toHaveClass('text-emerald-300')
    expect(within(cards[1]).getByText('Transferencia')).toHaveClass('text-sky-300')
    for (const card of cards) {
      expect(card).not.toHaveTextContent(/order-/)
      expect(within(card).getByText('Artículos del pedido')).toBeInTheDocument()
      expect(card.querySelector('details')).not.toHaveAttribute('open')
      expect(within(card).getByRole('button', { name: 'Repetir pedido' })).toBeInTheDocument()
    }

    const ticketPreview = within(cards[1]).getByRole('button', { name: 'Ver comprobante de transferencia' })
    expect(ticketPreview).toHaveClass('h-7', 'w-7')
    expect(within(ticketPreview).getByRole('img', { name: 'Comprobante de transferencia' })).toHaveClass('object-contain')
    fireEvent.keyDown(ticketPreview, { key: 'Enter' })
    expect(screen.getByRole('dialog', { name: 'Comprobante de transferencia' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar comprobante' }))
  })

  it('refreshes existing customer transfer-ticket URLs while loading orders', async () => {
    saveWholesaleCustomerSession(session)
    api.listOrders.mockResolvedValue([transferOrder])
    api.refreshTicket.mockResolvedValue({ url: 'https://cdn.example.com/fresh-ticket.webp', key: transferOrder.transferTicket?.key })
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    fireEvent.click(screen.getByRole('tab', { name: 'Mis pedidos' }))

    await waitFor(() => expect(api.refreshTicket).toHaveBeenCalledWith('session-token', 'customers/customer-1/ticket.webp'))
    expect(within(screen.getByTestId('wholesale-customer-order-card')).getByRole('img', { name: 'Comprobante de transferencia' })).toHaveAttribute('src', 'https://cdn.example.com/fresh-ticket.webp')
  })

  it('keeps the customer order and its existing ticket URL when refresh fails', async () => {
    saveWholesaleCustomerSession(session)
    api.listOrders.mockResolvedValue([transferOrder])
    api.refreshTicket.mockRejectedValue(new Error('Expired ticket cannot be refreshed'))
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    fireEvent.click(screen.getByRole('tab', { name: 'Mis pedidos' }))

    expect(await screen.findByTestId('wholesale-customer-order-card')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Comprobante de transferencia' })).toHaveAttribute('src', transferOrder.transferTicket?.url)
  })

  it('loads a pending order into the catalog and updates the same order in edit mode', async () => {
    saveWholesaleCustomerSession(session)
    api.listOrders.mockResolvedValue([order])
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    fireEvent.click(screen.getByRole('tab', { name: 'Mis pedidos' }))

    fireEvent.click(screen.getByRole('button', { name: 'Editar pedido' }))

    expect(screen.getByText('Arma tu pedido')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Los cambios se guardarán en el mismo pedido.')
    expect(screen.getByRole('button', { name: 'Revisar pedido' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Revisar pedido' }).parentElement?.parentElement).toHaveClass('ops-mobile-action-bar', 'lg:hidden')

    openReview()
    expect(screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' })).toHaveValue('2')
    fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' }), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    confirmOrderSubmission('Guardar cambios del pedido', 'Confirmar cambios del pedido', 'Confirmar cambios')

    await waitFor(() => expect(api.update).toHaveBeenCalledWith('session-token', expect.objectContaining({ orderId: 'order-1', items: [{ productId: 'product-1', quantity: 3 }], paymentMethod: 'transfer' })))
    expect(api.reorder).not.toHaveBeenCalled()
  })

  it('shows pending actions after the admin has seen the order and hides them for non-pending or deleted orders', async () => {
    saveWholesaleCustomerSession(session)
    const seenPendingOrder: WholesaleOrder = { ...order, adminSeenAt: '2026-08-23T01:00:00Z', adminSeenBy: 'admin-1' }
    const completedOrder: WholesaleOrder = { ...order, id: 'order-completed', status: 'completed', completedAt: '2026-08-23T02:00:00Z' }
    const cancelledOrder: WholesaleOrder = { ...order, id: 'order-cancelled', status: 'cancelled', cancelledAt: '2026-08-23T03:00:00Z' }
    const deletedPendingOrder: WholesaleOrder = { ...order, id: 'order-deleted', deletedAt: '2026-08-23T04:00:00Z' }
    api.listOrders.mockResolvedValue([seenPendingOrder, processingOrder, completedOrder, cancelledOrder, deletedPendingOrder])
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    fireEvent.click(screen.getByRole('tab', { name: 'Mis pedidos' }))

    const cards = screen.getAllByTestId('wholesale-customer-order-card')
    expect(within(cards[0]).getByRole('button', { name: 'Editar pedido' })).toBeInTheDocument()
    expect(within(cards[0]).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(within(cards[0]).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
    for (const card of cards.slice(1)) {
      expect(within(card).queryByRole('button', { name: 'Editar pedido' })).not.toBeInTheDocument()
      expect(within(card).queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
      expect(within(card).queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument()
    }
  })

  it('shows a matching admin status change once and focuses the changed customer order', async () => {
    saveWholesaleCustomerSession(session)
    api.listOrders.mockResolvedValueOnce([order]).mockResolvedValue([processingOrder])
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    await waitFor(() => expect(api.subscribe).toHaveBeenCalled())

    emitRealtime({ customer_id: 'customer-1', order_id: 'order-1', status: 'processing', updated_at: processingOrder.updatedAt })

    const bell = await screen.findByRole('button', { name: 'Notificaciones: 1 actualizaciones de pedidos' })
    expect(bell.parentElement).toHaveTextContent('1')
    fireEvent.click(bell)
    const dialog = screen.getByRole('dialog', { name: 'Notificaciones de pedidos' })
    fireEvent.click(within(dialog).getByRole('button', { name: /La administración actualizó el estado del pedido/ }))

    expect(await screen.findByRole('heading', { name: 'Mis pedidos' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('wholesale-customer-order-card')).toHaveFocus())
    expect(screen.getByTestId('wholesale-customer-order-card')).toHaveAttribute('data-order-id', 'order-1')
    expect(screen.getByTestId('wholesale-customer-order-card')).toHaveTextContent('En proceso')
    expect(screen.getByRole('button', { name: 'Notificaciones: no hay actualizaciones de pedidos' })).toBeInTheDocument()
  })

  it('does not notify from initial-load or unrelated customer events', async () => {
    saveWholesaleCustomerSession(session)
    api.listOrders.mockResolvedValue([order])
    render(<WholesaleCustomerPortal />)
    await waitFor(() => expect(api.subscribe).toHaveBeenCalled())
    emitRealtime({ customer_id: 'customer-1', order_id: 'order-1', status: 'processing' })
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    emitRealtime({ customer_id: 'customer-2', order_id: 'order-1', status: 'processing' })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Notificaciones: no hay actualizaciones de pedidos' })).toBeInTheDocument())
  })

  it('notifies when a customer order reaches completed and focuses the completed order', async () => {
    saveWholesaleCustomerSession(session)
    const completedOrder: WholesaleOrder = { ...order, status: 'completed', completedAt: '2026-08-23T02:00:00Z' }
    api.listOrders.mockResolvedValueOnce([processingOrder]).mockResolvedValue([completedOrder])
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    await waitFor(() => expect(api.subscribe).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('tab', { name: 'Mis pedidos' }))
    emitRealtime({ customer_id: 'customer-1', order_id: 'order-1', status: 'completed' })

    const bell = await screen.findByRole('button', { name: 'Notificaciones: 1 actualizaciones de pedidos' })
    expect(bell.parentElement).toHaveTextContent('1')
    fireEvent.click(bell)
    const dialog = screen.getByRole('dialog', { name: 'Notificaciones de pedidos' })
    fireEvent.click(within(dialog).getByRole('button', { name: /La administración actualizó el estado del pedido/ }))

    expect(await screen.findByRole('heading', { name: 'Mis pedidos' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('wholesale-customer-order-card')).toHaveFocus())
    expect(screen.getByTestId('wholesale-customer-order-card')).toHaveAttribute('data-order-id', 'order-1')
    expect(screen.getByTestId('wholesale-customer-order-card')).toHaveTextContent('Completado')
    expect(screen.getByRole('button', { name: 'Notificaciones: no hay actualizaciones de pedidos' })).toBeInTheDocument()
  })

  it('does not notify when a customer order is deleted', async () => {
    saveWholesaleCustomerSession(session)
    const deletedOrder: WholesaleOrder = { ...processingOrder, deletedAt: '2026-08-23T02:00:00Z' }
    api.listOrders.mockResolvedValueOnce([order]).mockResolvedValue([deletedOrder])
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    await waitFor(() => expect(api.subscribe).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('tab', { name: 'Mis pedidos' }))
    emitRealtime({ customer_id: 'customer-1', order_id: 'order-1', status: 'processing', deleted: true })

    await waitFor(() => expect(screen.getByText('En proceso')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Notificaciones: no hay actualizaciones de pedidos' })).toBeInTheDocument()
  })

  it('opens separate cancel and delete confirmations before calling their APIs', async () => {
    saveWholesaleCustomerSession(session)
    api.listOrders.mockResolvedValue([order])
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    fireEvent.click(screen.getByRole('tab', { name: 'Mis pedidos' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    let dialog = screen.getByRole('dialog', { name: '¿Cancelar este pedido?' })
    expect(api.cancel).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'No, volver' }))
    expect(screen.queryByRole('dialog', { name: '¿Cancelar este pedido?' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    dialog = screen.getByRole('dialog', { name: '¿Cancelar este pedido?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cancelación' }))
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('session-token', expect.objectContaining({ orderId: 'order-1' })))

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    dialog = screen.getByRole('dialog', { name: '¿Eliminar este pedido?' })
    expect(api.delete).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar eliminación' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('session-token', expect.objectContaining({ orderId: 'order-1' })))
  })

  it('confirms wholesale logout and preserves the local boundary when remote logout fails', async () => {
    saveWholesaleCustomerSession(session)
    api.logout.mockRejectedValue(new Error('Remote logout unavailable'))
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })

    const logout = screen.getByRole('button', { name: 'Cerrar sesión' })
    expect(logout).toHaveClass('ops-navbar-action')
    expect(logout).toHaveAttribute('aria-label', 'Cerrar sesión')
    expect(logout).toHaveAttribute('title', 'Cerrar sesión')
    fireEvent.click(logout)
    const dialog = screen.getByRole('dialog', { name: '¿Cerrar la sesión del portal mayorista?' })
    expect(dialog).toHaveTextContent('Se cerrará tu sesión del portal mayorista.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(api.logout).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Tienda La Plaza' })).toBeInTheDocument()

    fireEvent.click(logout)
    fireEvent.click(within(screen.getByRole('dialog', { name: '¿Cerrar la sesión del portal mayorista?' })).getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByRole('heading', { name: 'Portal de clientes' })).toBeInTheDocument()
    expect(api.logout).toHaveBeenCalledWith('session-token', expect.any(String))
    expect(window.sessionStorage.getItem('paletixa-wholesale-customer-session-v1')).toBeNull()
  })

  it('filters by category and selects products through POS-like catalog cards', async () => {
    saveWholesaleCustomerSession(session)
    api.listCatalog.mockResolvedValue(catalogWithCategories)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    await openProductView()

    fireEvent.click(screen.getByRole('tab', { name: 'Bebidas' }))

    expect(screen.queryByRole('button', { name: 'Agregar Mango al pedido' })).not.toBeInTheDocument()
    const productCard = screen.getByRole('button', { name: 'Agregar Agua limón al pedido' })
    fireEvent.click(productCard)
    expect(within(productCard).queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Cantidad en carrito de Agua limón' })).toHaveValue('1')
    openReview()
  })

  it('supports cart increment, direct quantity editing, decrement, and removal', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    await openProductView()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()
    const quantity = screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Mango' }))
    expect(quantity).toHaveValue('2')
    fireEvent.change(quantity, { target: { value: '5' } })
    expect(quantity).toHaveValue('5')
    fireEvent.click(screen.getByRole('button', { name: 'Disminuir cantidad de Mango' }))
    expect(quantity).toHaveValue('4')
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Mango del carrito' }))
    expect(screen.getByText('El carrito está vacío.')).toBeInTheDocument()
  })

  it('applies wholesale threshold pricing from the shared wholesale helper', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    openProductView()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()
    fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' }), { target: { value: '10' } })

    expect(screen.getByText('$10.00 MXN')).toBeInTheDocument()
    expect(screen.getAllByText('$100.00 MXN')).toHaveLength(3)
  })

  it('uses the category total for product cards, cart lines, and totals when line kinds coexist', async () => {
    saveWholesaleCustomerSession(session)
    api.listCatalog.mockResolvedValue(catalogWithMixedCategoryLines)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })

    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas al pedido' }))
    openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' }), { target: { value: '9' } })
    openReview()

    expect(within(screen.getByRole('button', { name: 'Agregar otra unidad de Mango al pedido' })).getByText('$10.00 MXN')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: 'Agregar Fresa al pedido' })).getByText('$10.00 MXN')).toBeInTheDocument()

    const summary = screen.getByRole('complementary', { name: 'Resumen del pedido' })
    expect(within(summary).getByText('$10.00 MXN')).toBeInTheDocument()
    expect(within(summary).getByText('$90.00 MXN')).toBeInTheDocument()
    expect(within(summary).getAllByText('$100.00 MXN')).toHaveLength(2)
  })

  it('limits transfer tickets to one image input', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    await openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))

    const ticketInput = screen.getByLabelText('Comprobante (opcional)')
    expect(ticketInput).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    expect(ticketInput).toHaveClass('sr-only')
    expect(screen.getByRole('img', { name: 'Comprobante de transferencia' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar comprobante' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar comprobante' })).not.toBeInTheDocument()
    const inputClick = vi.spyOn(ticketInput, 'click')
    fireEvent.click(screen.getByRole('img', { name: 'Comprobante de transferencia' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar comprobante' }))
    expect(inputClick).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Importe recibido')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Efectivo' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Transferencia' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('persists and restores only draft items per customer', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))

    await waitFor(() => expect(window.localStorage.getItem('paletixa:wholesale-draft:customer-1')).toBe(JSON.stringify({ 'product-1': 1 })))
    cleanup()

    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    expect(screen.getByRole('button', { name: 'Revisar pedido' })).not.toBeDisabled()
    openReview()
    expect(screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' })).toHaveValue('1')
    cleanup()

    const otherSession = { ...session, sessionToken: 'other-session-token', customer: { ...session.customer, id: 'customer-2' } }
    saveWholesaleCustomerSession(otherSession)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    expect(screen.getByRole('button', { name: 'Revisar pedido' })).toBeDisabled()
    expect(window.localStorage.getItem('paletixa:wholesale-draft:customer-2')).toBeNull()
  })

  it('ignores malformed, non-object, and invalid stored draft values', async () => {
    for (const storedValue of ['{invalid-json', '[]', JSON.stringify({ 'product-1': 0 })]) {
      window.sessionStorage.clear()
      window.localStorage.clear()
      window.localStorage.setItem('paletixa:wholesale-draft:customer-1', storedValue)
      saveWholesaleCustomerSession(session)
      render(<WholesaleCustomerPortal />)
      await screen.findByRole('heading', { name: 'Tienda La Plaza' })
      expect(screen.getByRole('button', { name: 'Revisar pedido' })).toBeDisabled()
      cleanup()
    }
  })

  it('removes the stored draft when the cart is cleared', async () => {
    saveWholesaleCustomerSession(session)
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    await waitFor(() => expect(window.localStorage.getItem('paletixa:wholesale-draft:customer-1')).not.toBeNull())
    openReview()
    fireEvent.click(screen.getByRole('button', { name: 'Vaciar carrito' }))

    await waitFor(() => expect(window.localStorage.getItem('paletixa:wholesale-draft:customer-1')).toBeNull())
    expect(screen.getByText('El carrito está vacío.')).toBeInTheDocument()
  })

  it('shows a retryable catalog load error instead of leaving the portal stuck loading', async () => {
    saveWholesaleCustomerSession(session)
    api.listCatalog.mockRejectedValueOnce(new Error('Catálogo temporalmente no disponible'))
    render(<WholesaleCustomerPortal />)

    expect(await screen.findByText('No se pudieron cargar todos los datos del portal.')).toBeInTheDocument()
    api.listCatalog.mockResolvedValue(catalog)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga' }))

    expect(await screen.findByText('Arma tu pedido')).toBeInTheDocument()
  })

  it('uploads one transfer image and submits the wholesale transfer payload', async () => {
    saveWholesaleCustomerSession(session)
    let resolveUpload: (value: { url: string; key: string }) => void = () => undefined
    api.upload.mockImplementation(() => new Promise((resolve) => { resolveUpload = resolve }))
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' }), { target: { value: '2' } })
    openReview()
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    fireEvent.change(screen.getByLabelText('Comprobante (opcional)'), { target: { files: [new File(['ticket'], 'ticket.webp', { type: 'image/webp' })] } })

    await waitFor(() => expect(api.upload).toHaveBeenCalledWith('session-token', expect.any(File)))
    expect(await screen.findByText('Subiendo comprobante…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar pedido' })).toBeDisabled()
    resolveUpload({ url: 'https://cdn.example.com/ticket.webp', key: 'customer-1/ticket.webp' })
      await waitFor(() => expect(screen.getByRole('img', { name: 'Comprobante de transferencia' })).toBeInTheDocument())
      const ticketPreview = screen.getByRole('img', { name: 'Comprobante de transferencia' })
      expect(ticketPreview).toHaveClass('object-contain')
      expect(ticketPreview.parentElement).toHaveClass('h-16', 'w-16', 'shrink-0')
      expect(screen.getByRole('button', { name: 'Cambiar comprobante' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Eliminar comprobante' })).toBeInTheDocument()
      confirmOrderSubmission()

    await waitFor(() => expect(api.create).toHaveBeenCalledWith('session-token', expect.objectContaining({ items: [{ productId: 'product-1', quantity: 2 }], paymentMethod: 'transfer', transferTicket: { url: 'https://cdn.example.com/ticket.webp', key: 'customer-1/ticket.webp' } })))
  })

  it('replaces an attached ticket only after the previous ticket removal is confirmed', async () => {
    saveWholesaleCustomerSession(session)
    api.upload
      .mockResolvedValueOnce({ url: 'https://cdn.example.com/old.webp', key: 'customers/customer-1/old.webp' })
      .mockResolvedValueOnce({ url: 'https://cdn.example.com/new.webp', key: 'customers/customer-1/new.webp' })
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    const input = screen.getByLabelText('Comprobante (opcional)')
    fireEvent.change(input, { target: { files: [new File(['old'], 'old.webp', { type: 'image/webp' })] } })
    await screen.findByRole('button', { name: 'Eliminar comprobante' })

    fireEvent.change(input, { target: { files: [new File(['new'], 'new.webp', { type: 'image/webp' })] } })

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('session-token', 'customers/customer-1/old.webp'))
    expect(await screen.findByRole('button', { name: 'Eliminar comprobante' })).toBeInTheDocument()
    expect(api.upload).toHaveBeenNthCalledWith(2, 'session-token', expect.any(File))
  })

  it('removes an attached ticket before changing transfer payment to cash', async () => {
    saveWholesaleCustomerSession(session)
    api.upload.mockResolvedValue({ url: 'https://cdn.example.com/ticket.webp', key: 'customers/customer-1/ticket.webp' })
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    fireEvent.change(screen.getByLabelText('Comprobante (opcional)'), { target: { files: [new File(['ticket'], 'ticket.webp', { type: 'image/webp' })] } })
    await screen.findByRole('button', { name: 'Eliminar comprobante' })

    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('session-token', 'customers/customer-1/ticket.webp'))
    expect(screen.queryByRole('button', { name: 'Eliminar comprobante' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Efectivo' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('removes an attached ticket through the compact accessible control', async () => {
    saveWholesaleCustomerSession(session)
    api.upload.mockResolvedValue({ url: 'https://cdn.example.com/ticket.webp', key: 'customers/customer-1/ticket.webp' })
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    fireEvent.change(screen.getByLabelText('Comprobante (opcional)'), { target: { files: [new File(['ticket'], 'ticket.webp', { type: 'image/webp' })] } })
    await screen.findByRole('button', { name: 'Eliminar comprobante' })

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar comprobante' }))

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('session-token', 'customers/customer-1/ticket.webp'))
    expect(screen.queryByRole('button', { name: 'Eliminar comprobante' })).not.toBeInTheDocument()
  })

  it('keeps the draft when clearing it cannot remove the attached ticket', async () => {
    saveWholesaleCustomerSession(session)
    api.upload.mockResolvedValue({ url: 'https://cdn.example.com/ticket.webp', key: 'customers/customer-1/ticket.webp' })
    api.remove.mockRejectedValueOnce(new Error('No se pudo retirar el comprobante'))
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    fireEvent.change(screen.getByLabelText('Comprobante (opcional)'), { target: { files: [new File(['ticket'], 'ticket.webp', { type: 'image/webp' })] } })
    await screen.findByRole('button', { name: 'Eliminar comprobante' })
    fireEvent.click(screen.getByRole('button', { name: 'Vaciar carrito' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudo retirar el comprobante'))
    expect(screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' })).toHaveValue('1')
    expect(screen.getByRole('button', { name: 'Eliminar comprobante' })).toBeInTheDocument()
  })

  it('preserves the draft while safely cleaning an unreferenced ticket after an ambiguous submit failure', async () => {
    saveWholesaleCustomerSession(session)
    api.upload.mockResolvedValue({ url: 'https://cdn.example.com/ticket.webp', key: 'customers/customer-1/ticket.webp' })
    api.create.mockRejectedValueOnce(new Error('No se pudo enviar el pedido'))
    api.cleanupTickets.mockResolvedValue({ removedKeys: ['customers/customer-1/ticket.webp'], retainedKeys: [] })
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    fireEvent.change(screen.getByLabelText('Comprobante (opcional)'), { target: { files: [new File(['ticket'], 'ticket.webp', { type: 'image/webp' })] } })
    await screen.findByRole('button', { name: 'Eliminar comprobante' })
    confirmOrderSubmission()

    await waitFor(() => expect(api.cleanupTickets).toHaveBeenCalledWith('session-token'))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo enviar el pedido')
    expect(screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' })).toHaveValue('1')
    expect(screen.queryByRole('button', { name: 'Eliminar comprobante' })).not.toBeInTheDocument()
  })

  it('shows a separate submit loading state and preserves the draft after an error', async () => {
    saveWholesaleCustomerSession(session)
    let rejectCreate: (error: Error) => void = () => undefined
    api.create.mockImplementationOnce(() => new Promise((_, reject) => { rejectCreate = reject }))
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    openProductView()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango al pedido' }))
    openReview()
    const dialog = openOrderConfirmation()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar y enviar' }))

    expect(within(dialog).getByRole('button', { name: 'Enviando…' })).toBeDisabled()
    rejectCreate(new Error('No se pudo enviar el pedido'))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudo enviar el pedido'))
    expect(screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' })).toHaveValue('1')
    expect(screen.getByText('Paso 2 de 2')).toBeInTheDocument()
    expect(api.cleanupTickets).toHaveBeenCalledWith('session-token')
  })

  it('reorders into a new editable draft while keeping the pending order action flow', async () => {
    saveWholesaleCustomerSession(session)
    api.listOrders.mockResolvedValue([order])
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    fireEvent.click(screen.getByRole('tab', { name: 'Mis pedidos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '¿Cancelar este pedido?' })).getByRole('button', { name: 'Confirmar cancelación' }))
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('session-token', expect.objectContaining({ orderId: 'order-1' })))
    fireEvent.click(screen.getByRole('button', { name: 'Repetir pedido' }))
    expect(screen.getByText('Paso 2 de 2')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Cantidad en carrito de Mango' })).toHaveValue('2')
  })

  it('submits a reordered draft through the wholesale reorder API', async () => {
    saveWholesaleCustomerSession(session)
    api.listOrders.mockResolvedValue([order])
    render(<WholesaleCustomerPortal />)
    await screen.findByRole('heading', { name: 'Tienda La Plaza' })
    fireEvent.click(screen.getByRole('tab', { name: 'Mis pedidos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Repetir pedido' }))
    expect(screen.getByText('Se enviará un pedido nuevo basado en el pedido anterior.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar nuevo pedido' })).toBeInTheDocument()
    confirmOrderSubmission('Enviar nuevo pedido', 'Confirmar nuevo pedido')

    await waitFor(() => expect(api.reorder).toHaveBeenCalledWith('session-token', expect.objectContaining({ orderId: 'order-1', items: [{ productId: 'product-1', quantity: 2 }], paymentMethod: 'cash' })))
  })
})
