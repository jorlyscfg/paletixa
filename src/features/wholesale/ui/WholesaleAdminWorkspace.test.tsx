import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WholesaleCustomer, WholesaleOrder } from '../api/types'

const api = vi.hoisted(() => ({
  catalog: vi.fn(), customers: vi.fn(), orders: vi.fn(), seen: vi.fn(), status: vi.fn(), complete: vi.fn(), deleteOrder: vi.fn(), create: vi.fn(), refreshTicket: vi.fn(), realtime: vi.fn(), deleteCustomer: vi.fn(), createCustomer: vi.fn(), updateCustomer: vi.fn(), customerStatus: vi.fn(), regeneratePin: vi.fn(),
}))
vi.mock('../api/catalog', () => ({ listPublicWholesaleCatalog: api.catalog }))
vi.mock('../api/customers', () => ({ listWholesaleCustomers: api.customers, createWholesaleCustomer: api.createCustomer, updateWholesaleCustomer: api.updateCustomer, setWholesaleCustomerStatus: api.customerStatus, regenerateWholesaleCustomerPin: api.regeneratePin, deleteWholesaleCustomer: api.deleteCustomer }))
vi.mock('../api/orders', () => ({ listWholesaleOrders: api.orders, markWholesaleOrderSeen: api.seen, setWholesaleOrderStatus: api.status, completeWholesaleOrder: api.complete, deleteWholesaleOrder: api.deleteOrder, createWholesaleAdminOrder: api.create }))
vi.mock('../api/realtime', () => ({ subscribeToWholesaleOrderEvents: api.realtime }))
vi.mock('../api/transferTickets', () => ({ refreshWholesaleAdminTransferTicketUrl: api.refreshTicket }))
import { WholesaleAdminWorkspace } from './WholesaleAdminWorkspace'
import { WholesaleCustomersWorkspace } from './WholesaleCustomersWorkspace'

const customer: WholesaleCustomer = { id: 'customer-1', name: 'Tienda La Plaza', mobile: '+525512345678', email: null, status: 'active', currentPin: '0042', createdAt: '2026-08-23T00:00:00Z', updatedAt: '2026-08-23T00:00:00Z' }
const catalog = [{ id: 'product-1', name: 'Mango', sku: 'M-01', categoryId: 'category-1', category: 'Paletas', retailPriceMxn: 12.5, wholesalePriceMxn: 10, imageUrl: 'https://cdn.example.com/mango.jpg' }]
const order: WholesaleOrder = {
  id: 'order-1', customerId: 'customer-1', customerName: customer.name, customerMobile: '+525512345678', customerEmail: null, status: 'pending', paymentMethod: 'cash', transferTicket: null, totalMxn: 25, saleId: null, source: 'customer', createdAt: '2026-08-23T00:00:00Z', updatedAt: '2026-08-23T00:00:00Z', completedAt: null, cancelledAt: null, deletedAt: null, paymentAmount: null, paymentCurrency: null, paymentConfirmedAt: null, paymentConfirmedBy: null, paymentReference: null, paymentNote: null, deliveryAgreement: null, adminSeenAt: '2026-08-23T00:01:00Z', adminSeenBy: 'admin-1', reorderedFromOrderId: null, saleGeneration: null, items: [{ id: 'item-1', lineKind: 'product', productId: 'product-1', categoryId: null, categoryName: null, productName: 'Mango', unitPriceMxn: 12.5, quantity: 2, lineTotalMxn: 25 }],
}

function configureAdmin() {
  api.catalog.mockResolvedValue(catalog)
  api.customers.mockResolvedValue([customer])
  api.orders.mockResolvedValue([order])
  api.seen.mockResolvedValue(order)
  api.status.mockResolvedValue({ ...order, status: 'processing' })
  api.complete.mockResolvedValue({ ...order, status: 'completed', saleId: 'sale-1', paymentAmount: 25, paymentCurrency: 'mxn', deliveryAgreement: 'delivery' })
  api.deleteOrder.mockResolvedValue({ id: order.id, customerId: order.customerId, status: order.status, deleted: true })
  api.create.mockResolvedValue({ ...order, id: 'order-2', source: 'admin' })
  api.refreshTicket.mockImplementation(async (_orderId: string, key: string) => ({ url: 'https://cdn.example.com/refreshed-ticket.jpg', key }))
  api.realtime.mockResolvedValue(() => undefined)
}

describe('WholesaleAdminWorkspace', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    configureAdmin()
  })
  afterEach(cleanup)

  it('creates a pending order from the customer-style catalog and cart tab', async () => {
    render(<WholesaleAdminWorkspace />)
    await screen.findByRole('tab', { name: 'Gestionar pedidos' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crear pedido' }))
    const customerSearch = screen.getByRole('combobox', { name: 'Buscar clientes activos' })
    fireEvent.change(customerSearch, { target: { value: 'La Pla' } })
    expect(screen.getByRole('option', { name: /Tienda La Plaza/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /Tienda La Plaza/ }))
    expect(screen.getByText('Cliente seleccionado')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas al pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar pedido' }))
    fireEvent.click((await screen.findAllByRole('button', { name: 'Crear pedido' })).at(-1)!)

    await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'customer-1', initialStatus: 'pending', items: [{ lineKind: 'category', categoryId: 'category-1', quantity: 1 }] })))
  })

  it('supports keyboard customer selection without a native customer selector', async () => {
    render(<WholesaleAdminWorkspace />)
    await screen.findByRole('tab', { name: 'Gestionar pedidos' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crear pedido' }))
    const customerSearch = screen.getByRole('combobox', { name: 'Buscar clientes activos' })
    fireEvent.change(customerSearch, { target: { value: 'Plaza' } })
    fireEvent.keyDown(customerSearch, { key: 'ArrowDown' })
    fireEvent.keyDown(customerSearch, { key: 'Enter' })

    expect(screen.getByText('Tienda La Plaza')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Cliente para el nuevo pedido' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
    expect(screen.getByRole('combobox', { name: 'Buscar clientes activos' })).toBeInTheDocument()
  })

  it('moves the Mayoristas description into the adjacent info tooltip', async () => {
    const description = 'Pedidos, clientes y confirmaciones sin inventario ni logística.'
    render(<WholesaleAdminWorkspace />)
    await screen.findByRole('button', { name: 'Información de Mayoristas' })

    expect(screen.queryByText(description)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Información de Mayoristas' }).parentElement?.parentElement).toHaveClass('flex', 'items-center', 'gap-2')

    fireEvent.click(screen.getByRole('button', { name: 'Información de Mayoristas' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent(description)
  })

  it('shows each order-state count on its filter tab without the redundant header counter', async () => {
    api.orders.mockResolvedValue([
      order,
      { ...order, id: 'order-2', status: 'processing' },
      { ...order, id: 'order-3', status: 'processing' },
      { ...order, id: 'order-4', status: 'completed' },
    ])
    render(<WholesaleAdminWorkspace />)
    await screen.findByRole('tab', { name: 'Gestionar pedidos' })

    expect(screen.queryByText(/pendientes sin revisar/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pendiente: 1 pedido' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'En proceso: 2 pedidos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Completado: 1 pedido' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelado: 0 pedidos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todos: 4 pedidos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pendiente: 1 pedido' })).toHaveAttribute('aria-pressed', 'true')
    const statusFilterButtons = screen.getAllByRole('button', { name: /^(Pendiente|En proceso|Completado|Cancelado|Todos):/ })
    expect(statusFilterButtons.at(-1)).toHaveAccessibleName('Todos: 4 pedidos')
  })

  it('uses the customer order-card hierarchy while retaining admin controls', async () => {
    api.orders.mockResolvedValue([{ ...order, adminSeenAt: null, adminSeenBy: null, customerEmail: 'compras@laplaza.example' }])
    render(<WholesaleAdminWorkspace />)

    const card = await screen.findByTestId('wholesale-admin-order-card')
    expect(card).toHaveClass('ops-panel-frame', 'rounded-2xl', 'p-4')
    expect(within(card).queryByText('Pedido order-1')).not.toBeInTheDocument()
    expect(within(card).getByText('Efectivo')).toHaveClass('text-emerald-300')
    expect(within(card).queryByText('Nuevo')).not.toBeInTheDocument()
    expect(within(card).getByRole('heading', { name: 'Tienda La Plaza' }).parentElement).toHaveTextContent('$25.00 MXN')
    expect(within(card).getByRole('heading', { name: 'Tienda La Plaza' })).toBeInTheDocument()
    expect(within(card).queryByText('Cliente', { selector: 'p' })).not.toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Abrir WhatsApp de Tienda La Plaza' })).toHaveTextContent('+525512345678')
    expect(within(card).getByText('compras@laplaza.example')).toBeInTheDocument()
    expect(within(card).getByText('Artículos del pedido')).toBeInTheDocument()
    expect(within(card).getByText('2 artículos')).toBeInTheDocument()
    expect(within(card).getByText('2 × Mango')).not.toBeVisible()
    expect(within(card).getByRole('button', { name: 'Estado del pedido order-1' })).toHaveClass('min-w-[8rem]')
    expect(within(card).queryByRole('tab')).not.toBeInTheDocument()
    expect(within(card).queryByRole('combobox', { name: /Estado del pedido/ })).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Inspeccionar' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Guardar edición' })).not.toBeInTheDocument()

    fireEvent.click(within(card).getByText('Artículos del pedido'))
    expect(within(card).getByText('2 × Mango')).toBeInTheDocument()
    expect(within(card).getAllByText('$25.00 MXN')).toHaveLength(2)
  })

  it('closes customer results from outside pointer input without closing on a result selection', async () => {
    render(<WholesaleAdminWorkspace />)
    await screen.findByRole('tab', { name: 'Gestionar pedidos' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crear pedido' }))

    const customerSearch = screen.getByRole('combobox', { name: 'Buscar clientes activos' })
    fireEvent.focus(customerSearch)
    const result = screen.getByRole('option', { name: /Tienda La Plaza/ })
    fireEvent.pointerDown(result)
    expect(screen.getByRole('listbox', { name: 'Clientes activos filtrados' })).toBeInTheDocument()
    fireEvent.click(result)
    expect(screen.getByText('Cliente seleccionado')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
    expect(screen.getByRole('listbox', { name: 'Clientes activos filtrados' })).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox', { name: 'Clientes activos filtrados' })).not.toBeInTheDocument()
  })

  it('keeps the admin creator bounded with independent catalog and cart scrolling', async () => {
    render(<WholesaleAdminWorkspace />)
    await screen.findByRole('tab', { name: 'Gestionar pedidos' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crear pedido' }))

    expect(screen.getByRole('region', { name: 'Módulo Mayoristas' })).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col', 'overflow-hidden')
    expect(screen.getByRole('region', { name: 'Módulo Mayoristas' })).toHaveClass('ops-workspace-frame', 'min-w-0')
    expect(screen.getByRole('region', { name: 'Crear pedido mayorista' })).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col', 'overflow-hidden', 'lg:h-full', 'lg:overflow-hidden')
    expect(screen.queryByTestId('wholesale-admin-composer-header')).not.toBeInTheDocument()
    expect(screen.getByTestId('wholesale-admin-composer-layout')).toHaveClass('flex', 'flex-col', 'flex-1', 'overflow-hidden', 'lg:grid', 'lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]')
    expect(screen.getByTestId('wholesale-admin-catalog-panel')).toHaveClass('ops-panel-frame', 'flex', 'flex-1', 'flex-col', 'overflow-hidden', 'lg:flex', 'lg:overflow-hidden')
    expect(screen.getByTestId('wholesale-catalog-scroll')).toHaveClass('lg:min-h-0', 'lg:flex-1', 'lg:max-h-none', 'lg:overflow-y-auto', 'lg:overscroll-contain')
    expect(screen.getByRole('button', { name: 'Revisar pedido' }).parentElement?.parentElement).toHaveClass('ops-mobile-action-bar', 'lg:hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas al pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar pedido' }))

    const selectedLines = screen.getByTestId('wholesale-selected-lines')
    const summary = screen.getByRole('complementary', { name: 'Resumen del pedido' })
    const reviewForm = screen.getByRole('button', { name: 'Crear pedido' }).closest('form')
    expect(selectedLines).toHaveClass('max-h-[min(28rem,42dvh)]', 'overflow-y-auto', 'lg:min-h-0', 'lg:flex-1', 'lg:max-h-none', 'lg:overflow-y-auto', 'lg:overscroll-contain', 'flex-1')
    expect(summary).toHaveClass('flex-1', 'min-h-0', 'flex-col', 'overflow-hidden', 'lg:h-full', 'lg:min-h-0', 'lg:flex-1', 'lg:flex-col', 'lg:overflow-hidden')
    expect(reviewForm).toHaveClass('flex', 'flex-1', 'min-h-0', 'flex-col', 'gap-2', 'overflow-hidden', 'lg:flex-1', 'lg:min-h-0', 'lg:overflow-hidden')
    expect(selectedLines).not.toContainElement(screen.getByRole('group', { name: 'Método de pago' }))
  })

  it('focuses and marks the requested order after the order list loads', async () => {
    const unseenOrder = { ...order, adminSeenAt: null, adminSeenBy: null }
    api.orders.mockResolvedValue([unseenOrder])
    api.seen.mockResolvedValue(order)
    render(<WholesaleAdminWorkspace focusOrderId="order-1" />)

    const card = await screen.findByTestId('wholesale-admin-order-card')
    expect(card).toHaveAttribute('data-focused', 'true')
    expect(screen.queryByRole('button', { name: 'Inspeccionar' })).not.toBeInTheDocument()
    await waitFor(() => expect(api.seen).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-1' })))
  })

  it('updates a status from the expandable status control only after the RPC succeeds', async () => {
    api.orders.mockResolvedValue([{ ...order, adminSeenAt: null, adminSeenBy: null }])
    api.status.mockResolvedValue({ ...order, status: 'processing', adminSeenAt: null, adminSeenBy: null })
    api.seen.mockResolvedValue({ ...order, status: 'processing', adminSeenAt: '2026-08-25T00:01:00Z', adminSeenBy: 'admin-1' })
    render(<WholesaleAdminWorkspace />)
    await screen.findByRole('tab', { name: 'Gestionar pedidos' })
    fireEvent.click(screen.getByRole('button', { name: 'Todos: 1 pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Estado del pedido order-1' }))
    expect(screen.getByRole('listbox', { name: 'Estado del pedido order-1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'En proceso' }))

    await waitFor(() => expect(api.status).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-1', status: 'processing', reason: 'Cambio de estado desde la lista de pedidos' })))
    await waitFor(() => expect(api.seen).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-1', requestId: expect.any(String) })))
    expect(screen.getByRole('button', { name: 'Estado del pedido order-1' })).toHaveTextContent('En proceso')
  })

  it('opens the dedicated completion flow when completed is selected from the status control', async () => {
    render(<WholesaleAdminWorkspace />)
    await screen.findByRole('tab', { name: 'Gestionar pedidos' })
    fireEvent.click(screen.getByRole('button', { name: 'Estado del pedido order-1' }))
    fireEvent.click(screen.getByRole('option', { name: 'Completado' }))

    const completionModal = screen.getByRole('dialog')
    expect(within(completionModal).getByRole('heading', { name: 'Confirmar finalización del pedido' })).toBeInTheDocument()
    expect(completionModal).toHaveTextContent('Se asumirá que se cobró el importe total del pedido: $25.00 MXN.')
    expect(completionModal).toHaveTextContent('Se asumirá que el pedido ya fue entregado al cliente.')
    expect(completionModal).toHaveTextContent('El pedido se convertirá en una venta confirmada.')
    expect(within(completionModal).queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(within(completionModal).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(completionModal).queryByRole('combobox')).not.toBeInTheDocument()
    expect(api.status).not.toHaveBeenCalled()
  })

  it('renders the customer mobile as a WhatsApp link with a country code', async () => {
    render(<WholesaleAdminWorkspace />)
    await screen.findByRole('tab', { name: 'Gestionar pedidos' })

    const whatsapp = screen.getByRole('link', { name: 'Abrir WhatsApp de Tienda La Plaza' })
    expect(whatsapp).toHaveAttribute('href', 'https://wa.me/525512345678')
    expect(whatsapp).toHaveAttribute('target', '_blank')
    expect(whatsapp).toHaveTextContent('+525512345678')
    expect(whatsapp).not.toHaveTextContent('WhatsApp')
  })

  it('changes a non-completed status from the card status control', async () => {
    render(<WholesaleAdminWorkspace />)
    await screen.findByRole('tab', { name: 'Gestionar pedidos' })
    fireEvent.click(screen.getByRole('button', { name: 'Estado del pedido order-1' }))
    fireEvent.click(screen.getByRole('option', { name: 'En proceso' }))

    await waitFor(() => expect(api.status).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-1', status: 'processing' })))
  })

  it('confirms full payment, delivery, and sale creation without a completion form', async () => {
    render(<WholesaleAdminWorkspace />)
    await screen.findByRole('tab', { name: 'Gestionar pedidos' })
    fireEvent.click(screen.getByRole('button', { name: 'Todos: 1 pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Estado del pedido order-1' }))
    fireEvent.click(screen.getByRole('option', { name: 'Completado' }))
    expect(await screen.findByRole('heading', { name: 'Confirmar finalización del pedido' })).toBeInTheDocument()
    const confirmation = screen.getByRole('dialog', { name: 'Confirmar finalización del pedido' })
    expect(confirmation).toHaveTextContent('Se asumirá que se cobró el importe total del pedido: $25.00')
    expect(confirmation).toHaveTextContent('Se asumirá que el pedido ya fue entregado al cliente.')
    expect(confirmation).toHaveTextContent('El pedido se convertirá en una venta confirmada.')
    expect(within(confirmation).queryByRole('spinbutton', { name: 'Importe recibido' })).not.toBeInTheDocument()
    expect(within(confirmation).queryByRole('textbox', { name: 'Motivo de finalización' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar finalización y generar venta' }))
    await waitFor(() => expect(api.complete).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-1',
      reason: 'Pedido cobrado en su totalidad y entregado al cliente',
      completion: {
        paymentAmount: 25,
        paymentCurrency: 'mxn',
        paymentReference: null,
        paymentNote: null,
        deliveryAgreement: 'delivery',
      },
    })))

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar lógicamente' }))
    expect(await screen.findByRole('heading', { name: 'Eliminar pedido' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }))
    expect(screen.getByRole('alert')).toHaveTextContent('motivo')
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo obligatorio' }), { target: { value: 'Pedido duplicado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }))
    await waitFor(() => expect(api.deleteOrder).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-1', reason: 'Pedido duplicado' })))
  })

  it('opens a transfer ticket thumbnail in the shared image modal', async () => {
    api.orders.mockResolvedValue([{ ...order, paymentMethod: 'transfer', transferTicket: { url: 'https://cdn.example.com/stale-ticket.jpg', key: 'ticket-1' } }])
    render(<WholesaleAdminWorkspace />)

    const card = await screen.findByTestId('wholesale-admin-order-card')
    await waitFor(() => expect(api.refreshTicket).toHaveBeenCalledWith('order-1', 'ticket-1'))
    expect(within(card).getByRole('img', { name: 'Comprobante de transferencia' })).toHaveAttribute('src', 'https://cdn.example.com/refreshed-ticket.jpg')
    expect(within(card).getByText('Transferencia')).toHaveClass('text-sky-300')
    const ticketThumbnail = within(card).getByRole('button', { name: 'Ver comprobante de transferencia' })
    expect(ticketThumbnail).toHaveClass('h-7', 'w-7')
    fireEvent.click(ticketThumbnail)

    expect(await screen.findByRole('heading', { name: 'Comprobante de transferencia' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Comprobante de transferencia' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Cerrar comprobante' })).toBeInTheDocument()
  })
})

describe('WholesaleCustomersWorkspace', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    configureAdmin()
    api.orders.mockResolvedValue([])
     api.createCustomer.mockResolvedValue({ ...customer, currentPin: '0042' })
    api.customerStatus.mockResolvedValue({ ...customer, status: 'inactive' })
     api.regeneratePin.mockResolvedValue({ ...customer, currentPin: '9001' })
  })
  afterEach(cleanup)

  it('lists/searches customers and reveals the generated PIN only after creation', async () => {
    render(<WholesaleCustomersWorkspace />)
    await screen.findByRole('searchbox', { name: 'Buscar clientes' })
    fireEvent.click(screen.getByRole('button', { name: 'Información de Clientes' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Administra clientes, estados y PIN sin exponer credenciales fuera del área administrativa.')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar clientes' }), { target: { value: 'Plaza' } })
    expect(screen.getByText('Tienda La Plaza')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nueva tienda' } })
    fireEvent.change(screen.getByLabelText('Celular'), { target: { value: '55 2345 6789' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente y generar PIN' }))

    await waitFor(() => expect(api.createCustomer).toHaveBeenCalled())
     expect((await screen.findAllByText('0042')).length).toBeGreaterThanOrEqual(1)
  })

  it('requires a reason for customer activation changes', async () => {
    render(<WholesaleCustomersWorkspace />)
    await screen.findByRole('searchbox', { name: 'Buscar clientes' })
    const deactivateButton = screen.getByRole('button', { name: 'Desactivar' })
    expect(deactivateButton.querySelector('[data-icon="power"]')).toBeInTheDocument()
    fireEvent.click(deactivateButton)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar estado' }))
    expect(screen.getByRole('alert')).toHaveTextContent('obligatorio')
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo obligatorio' }), { target: { value: 'Cuenta cerrada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar estado' }))
    await waitFor(() => expect(api.customerStatus).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'customer-1', status: 'inactive', reason: 'Cuenta cerrada' })))
  })

  it('keeps the current PIN visible and updates it after regeneration', async () => {
    render(<WholesaleCustomersWorkspace />)
    await screen.findByRole('searchbox', { name: 'Buscar clientes' })
    expect(screen.getByText('PIN actual:')).toBeInTheDocument()
    expect(screen.getByText('0042')).toBeInTheDocument()
    const regenerateButton = screen.getAllByRole('button', { name: 'Regenerar PIN' }).at(-1)!
    expect(regenerateButton.querySelector('[data-icon="key"]')).toBeInTheDocument()
    fireEvent.click(regenerateButton)
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo obligatorio' }), { target: { value: 'Cliente solicitó un nuevo PIN' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Regenerar PIN' }).at(-1)!)

    await waitFor(() => expect(api.regeneratePin).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'customer-1', reason: 'Cliente solicitó un nuevo PIN' })))
    expect(await screen.findAllByText('9001')).not.toHaveLength(0)
  })
})
