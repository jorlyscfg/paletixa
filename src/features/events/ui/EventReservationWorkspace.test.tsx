import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventReservation } from '../api/types'

const api = vi.hoisted(() => ({
  listReservations: vi.fn(),
  listCatalog: vi.fn(),
  getConfiguration: vi.fn(),
  createAdmin: vi.fn(),
  reserve: vi.fn(),
  complete: vi.fn(),
  getAvailability: vi.fn(),
  cancel: vi.fn(),
  markSeen: vi.fn(),
  uploadTicket: vi.fn(),
  removeTicket: vi.fn(),
  cleanupTickets: vi.fn(),
  refreshTicket: vi.fn(),
  subscribe: vi.fn(),
}))

vi.mock('../../wholesale/api/catalog', () => ({ listPublicWholesaleCatalog: api.listCatalog }))
vi.mock('../../configuration/api/configuration', () => ({
  DEFAULT_EVENT_CART_CAPACITY: 7,
  getEventConfiguration: api.getConfiguration,
}))
vi.mock('../api/reservations', () => ({
  listEventReservations: api.listReservations,
  createAdminEventReservation: api.createAdmin,
  reserveEventReservation: api.reserve,
  completeEventReservation: api.complete,
  getEventAvailability: api.getAvailability,
  cancelEventReservation: api.cancel,
  markEventReservationSeen: api.markSeen,
}))
vi.mock('../../wholesale/api/transferTickets', () => ({
  uploadAdminEventTransferTicket: api.uploadTicket,
  removeAdminEventTransferTicket: api.removeTicket,
  cleanupEventTransferTickets: api.cleanupTickets,
  refreshAdminEventTransferTicketUrl: api.refreshTicket,
}))
vi.mock('../api/realtime', () => ({ subscribeToEventReservationEvents: api.subscribe }))

import { EventReservationWorkspace } from './EventReservationWorkspace'

const catalog = [{ id: 'product-1', name: 'Mango', sku: 'M-01', categoryId: 'category-1', category: 'Paletas', retailPriceMxn: 125, wholesalePriceMxn: 100, imageUrl: null }]
const fourLineCatalog = Array.from({ length: 4 }, (_, index) => ({ id: `product-${index + 1}`, name: `Mango ${index + 1}`, sku: `M-${index + 1}`, categoryId: `category-${index + 1}`, category: `Paletas ${index + 1}`, retailPriceMxn: 125, wholesalePriceMxn: 100, imageUrl: null }))

type TestRealtimeMessage = { reservation_id?: string; status?: string; updated_at?: string }
let realtimeListener: ((message: TestRealtimeMessage) => void) | undefined

function todayValue() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function reservation(overrides: Partial<EventReservation> = {}): EventReservation {
  return {
    id: 'reservation-1', requestId: 'request-1', customerName: 'Mariana Torres', customerPhone: '+525512345678', customerEmail: null,
    eventDate: '2099-09-12', cartAllocated: false, status: 'pending', origin: 'whatsapp', paymentPlan: 'advance', totalMxn: 125,
    declaredPaymentAmount: 50, declaredPaymentMethod: 'cash', declaredPaymentReference: null, transferTicket: null, confirmedPaymentAmount: null,
    confirmedPaymentMethod: null, confirmedPaymentReference: null, confirmedPaymentNote: null, paymentConfirmedAt: null,
    paymentConfirmedBy: null, remainingPaymentAmount: 0, remainingPaymentMethod: null,
    remainingPaymentNote: null, reservedAt: null, reservedBy: null, completedAt: null, cancelledAt: null, cancelledBy: null,
    cancellationReason: null, saleId: null, createdBy: 'admin-1', createdAt: '2099-09-10T12:00:00Z', updatedAt: '2099-09-10T12:00:00Z',
    adminSeenAt: '2099-09-12T00:00:00Z', adminSeenBy: 'admin-1', items: [{ id: 'item-1', lineKind: 'product', productId: 'product-1', categoryId: null, categoryName: null, productName: 'Mango', unitPriceMxn: 125, quantity: 1, lineTotalMxn: 125 }],
    ...overrides,
  }
}

function chooseFutureDate() {
  const date = new Date()
  date.setDate(date.getDate() + 2)
  fireEvent.click(screen.getByRole('button', { name: /^Fecha del evento:/ }))
  fireEvent.click(screen.getByRole('button', { name: date.toLocaleDateString('es-MX', { dateStyle: 'long' }) }))
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

describe('EventReservationWorkspace', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.listReservations.mockResolvedValue([])
    api.listCatalog.mockResolvedValue(catalog)
    api.getConfiguration.mockResolvedValue({ eventCartsPerDay: 7 })
    api.createAdmin.mockResolvedValue(reservation())
    api.reserve.mockResolvedValue(reservation({ status: 'reserved', confirmedPaymentAmount: 50, confirmedPaymentMethod: 'cash', remainingPaymentAmount: 75 }))
    api.complete.mockResolvedValue(reservation({ status: 'completed', eventDate: todayValue(), remainingPaymentAmount: 0, saleId: 'sale-1' }))
    api.getAvailability.mockResolvedValue({ eventDate: todayValue(), capacityLimit: 7, allocatedCount: 0, availableCount: 7 })
    api.cancel.mockResolvedValue(reservation({ status: 'cancelled' }))
    api.uploadTicket.mockResolvedValue({ url: 'https://example.invalid/event-ticket', key: 'events/request-1/receipt.webp' })
    api.removeTicket.mockResolvedValue({ key: 'events/request-1/receipt.webp', removed: true, referenced: false })
    api.cleanupTickets.mockResolvedValue({ removedKeys: [], retainedKeys: [] })
    api.refreshTicket.mockImplementation(async (eventReservation: EventReservation) => eventReservation.transferTicket)
    realtimeListener = undefined
    api.subscribe.mockImplementation(async (listener: (message: TestRealtimeMessage) => void) => {
      realtimeListener = listener
      return () => {
        if (realtimeListener === listener) realtimeListener = undefined
      }
    })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('uses the POS-style catalog and summary row without hiding event controls', async () => {
    render(<EventReservationWorkspace />)
    await screen.findByRole('region', { name: 'Módulo Eventos' })

    expect(screen.getByText('Capacidad: 7 carritos/día')).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Secciones de Eventos' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Crear reserva' }))

    const catalogPanel = screen.getByTestId('event-admin-catalog-panel')
    expect(catalogPanel).toHaveClass('overflow-hidden')
    const catalog = within(catalogPanel).getByRole('region', { name: 'Arma tu pedido' })
    const composer = screen.getByRole('region', { name: 'Crear reserva de evento' })
    expect(composer).toHaveClass('overflow-visible', 'lg:overflow-hidden')
    expect(composer).not.toHaveClass('overflow-hidden')
    expect(composer).not.toHaveClass('ops-workspace-frame', 'border', 'rounded-3xl', 'bg-slate-900', 'p-3', 'shadow-xl')
    expect(within(catalog).getByTestId('catalog-controls-header')).toBeInTheDocument()
    expect(catalogPanel).not.toHaveClass('ops-panel-frame', 'border', 'rounded-2xl', 'p-3', 'sm:p-4', 'shadow-xl')
    expect(catalog).toHaveClass('gap-3')
    expect(within(catalog).getByTestId('wholesale-catalog-scroll')).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto', 'overscroll-contain')
    expect(within(catalog).getByTestId('wholesale-catalog-scroll')).not.toHaveClass('max-h-[32rem]')

    fireEvent.click(within(catalog).getByRole('button', { name: 'Agregar categoría Paletas al pedido' }))
    const categoryCard = within(catalog).getByTestId('wholesale-category-card')
    expect(categoryCard).toHaveAttribute('data-catalog-selection-card', '')
    const pricePair = within(categoryCard).getByTestId('wholesale-price-pair')
    expect(pricePair.querySelectorAll('[data-price-slot]')).toHaveLength(2)
    const summary = screen.getByTestId('event-admin-mobile-summary-details')
    expect(summary).toHaveClass('flex', 'flex-wrap', 'items-baseline', 'justify-between', 'gap-x-3', 'gap-y-1')
    expect(summary.children).toHaveLength(2)
    expect(within(summary).getByText('1 artículo')).toBeInTheDocument()
    expect(summary.children[1]).toHaveTextContent('$125 MXN')
    expect(screen.getByTestId('event-admin-mobile-summary')).toHaveClass('shrink-0', 'mt-2', 'border-t', 'lg:hidden')
    expect(screen.getByTestId('event-admin-mobile-summary')).not.toHaveClass('fixed', 'ops-mobile-action-bar', 'pb-32')
    const reviewAction = within(summary.parentElement as HTMLElement).getByRole('button', { name: 'Revisar reserva' })
    expect(reviewAction).toBeEnabled()
    fireEvent.click(reviewAction)
    expect(screen.queryByTestId('event-admin-mobile-summary')).not.toBeInTheDocument()
    expect(composer).toHaveClass('overflow-hidden', 'lg:overflow-hidden')
    expect(composer).not.toHaveClass('overflow-visible')
    expect(screen.getByText('Capacidad: 7 carritos/día')).toBeInTheDocument()
  })

  it('creates an admin reservation with the customer as the only identity and keeps details immediately before submit', async () => {
    render(<EventReservationWorkspace />)
    await screen.findByRole('region', { name: 'Módulo Eventos' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crear reserva' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas al pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar reserva' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del cliente' }), { target: { value: 'Mariana Torres' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Teléfono del cliente' }), { target: { value: '55 1234 5678' } })
    const eventDate = chooseFutureDate()
    const advanceInput = screen.getByRole('spinbutton', { name: 'Anticipo en MXN' })
    expect(advanceInput).toHaveAttribute('step', '1')
    expect(advanceInput).toHaveAttribute('inputmode', 'numeric')
    fireEvent.change(advanceInput, { target: { value: '50' } })

    const form = screen.getByRole('button', { name: 'Crear reserva pendiente' }).closest('form')
    const selectedLines = screen.getByTestId('event-selected-lines')
    const summary = selectedLines.closest('aside')
    expect(summary?.parentElement).toBe(form)
    expect(summary).toHaveClass('min-h-0', 'overflow-y-auto', 'lg:h-full', 'lg:min-h-0', 'lg:overflow-y-auto')
    expect(summary).not.toHaveClass('overflow-hidden', 'lg:overflow-hidden')
    expect(selectedLines).toHaveClass('flex-none', 'max-h-none', 'overflow-visible')
    expect(selectedLines).not.toHaveClass('flex-1', 'lg:flex-1', 'overflow-y-auto', 'lg:overflow-y-auto')
    expect(screen.getByRole('region', { name: 'Datos de la reserva' }).parentElement).toHaveClass('shrink-0')
    expect(form?.lastElementChild).toHaveTextContent('Crear reserva pendiente')
    fireEvent.click(screen.getByRole('button', { name: 'Crear reserva pendiente' }))
    await waitFor(() => expect(api.createAdmin).toHaveBeenCalledTimes(1))
    const payload = api.createAdmin.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toMatchObject({ customerName: 'Mariana Torres', customerPhone: '55 1234 5678', eventDate, origin: 'whatsapp' })
    expect(payload).not.toHaveProperty('eventName')
    expect(payload).not.toHaveProperty('responsibleName')
  })

  it('uses button controls for reserve payment verification without radio inputs', async () => {
    api.listReservations.mockResolvedValue([reservation()])
    render(<EventReservationWorkspace />)
    await screen.findByTestId('event-reservation-card')
    fireEvent.click(screen.getByRole('button', { name: 'Verificar y reservar' }))
    const dialog = screen.getByRole('dialog', { name: 'Verificar pago y reservar' })
    expect(dialog.querySelectorAll('input[type="radio"]')).toHaveLength(0)
    expect(within(dialog).queryByLabelText('Referencia verificada')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transferencia' }))
    expect(within(dialog).getByRole('button', { name: 'Transferencia' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(within(dialog).getByLabelText('Referencia verificada'), { target: { value: 'stale-cash-reference' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Efectivo' }))
    expect(within(dialog).queryByLabelText('Referencia verificada')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transferencia' }))
    expect(within(dialog).getByLabelText('Referencia verificada')).toHaveValue('')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verificar y reservar' }))
    await waitFor(() => expect(api.reserve).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'transfer' })))
  })

  it('renders the customer mobile as an accessible WhatsApp link with a normalized Mexico number', async () => {
    api.listReservations.mockResolvedValue([reservation({ customerPhone: '55 1234 5678' })])
    render(<EventReservationWorkspace />)

    const card = await screen.findByTestId('event-reservation-card')
    const whatsapp = within(card).getByRole('link', { name: 'Abrir WhatsApp de Mariana Torres' })
    expect(whatsapp).toHaveAttribute('href', 'https://wa.me/525512345678')
    expect(whatsapp).toHaveAttribute('target', '_blank')
    expect(whatsapp).toHaveAttribute('rel', 'noreferrer')
    expect(whatsapp).toHaveTextContent('55 1234 5678')
    expect(whatsapp).not.toHaveTextContent('WhatsApp')
    expect(within(card).getByText('WhatsApp')).toBeInTheDocument()
  })

  it('renders the reservation card in the requested date, contact, payment, and action order', async () => {
    const transferTicket = { url: 'https://example.invalid/event-ticket', key: 'events/request-1/receipt.webp' }
    api.listReservations.mockResolvedValue([reservation({ customerEmail: 'mariana@example.com', origin: 'public', totalMxn: 1250, declaredPaymentAmount: 500, declaredPaymentMethod: 'transfer', transferTicket })])
    api.refreshTicket.mockResolvedValue(transferTicket)
    render(<EventReservationWorkspace />)

    const card = await screen.findByTestId('event-reservation-card')
    expect(card).toHaveClass('w-[24rem]', 'max-w-[24rem]')
    const header = card.querySelector<HTMLElement>('[data-card-row="header"]')
    const heading = within(card).getByRole('heading', { name: 'Mariana Torres' })
    const whatsapp = within(card).getByRole('link', { name: 'Abrir WhatsApp de Mariana Torres' })
    const email = within(card).getByRole('link', { name: 'mariana@example.com' })
    const createdDate = within(card).getByText('10/09/2099', { exact: true })
    const eventDate = within(card).getByText('12/09/2099', { exact: true })
    const publicOrigin = within(card).getByRole('img', { name: 'Sitio público' })
    const verifyButton = within(card).getByRole('button', { name: 'Verificar y reservar' })
    const cancelButton = within(card).getByRole('button', { name: 'Cancelar' })
    const receipt = within(card).getByRole('button', { name: 'Ver comprobante de transferencia' })

    const customerRow = heading.parentElement
    const headerFields = header ? Array.from(header.querySelectorAll<HTMLElement>('[data-header-field]')) : []
    const headerActions = card.querySelector<HTMLElement>('[data-card-header-actions]')
    const cardRows = Array.from(card.querySelectorAll<HTMLElement>('[data-card-row]'))
    const createdParameter = card.querySelector<HTMLElement>('[data-parameter="created-date"]')
    const eventParameter = card.querySelector<HTMLElement>('[data-parameter="event-date"]')
    const paymentRow = card.querySelector('[data-card-row="payments"]') as HTMLElement | null
    const paymentColumns = paymentRow ? Array.from(paymentRow.querySelectorAll<HTMLElement>('[data-parameter]')) : []
    expect(headerFields.map((field) => field.dataset.headerField)).toEqual(['created-date', 'event-date', 'status'])
    expect(headerFields.map((field) => field.querySelector('time')?.textContent ?? field.textContent)).toEqual(['10/09/2099', '12/09/2099', 'Pendiente'])
    expect(cardRows.map((row) => row.dataset.cardRow)).toEqual(['header', 'customer', 'contact', 'payments'])
    expect(createdDate).toHaveAttribute('dateTime', '2099-09-10T12:00:00Z')
    expect(eventDate).toHaveAttribute('dateTime', '2099-09-12')
    expect(createdParameter).toHaveAttribute('title', 'Fecha de creación')
    expect(eventParameter).toHaveAttribute('title', 'Fecha del evento')
    expect(createdParameter?.className).toBe(eventParameter?.className)
    expect(createdParameter?.querySelector('[data-icon="calendar"]')).toBeInTheDocument()
    expect(eventParameter?.querySelector('[data-icon="calendar"]')).toBeInTheDocument()
    expect(createdParameter?.querySelector('.sr-only')).toHaveTextContent('Fecha de creación')
    expect(eventParameter?.querySelector('.sr-only')).toHaveTextContent('Fecha del evento')
    expect(paymentRow?.tagName).toBe('DL')
    expect(paymentColumns.map((column) => column.dataset.parameter)).toEqual(['initial-payment', 'balance', 'total'])
    expect(paymentColumns).toHaveLength(3)
    expect(paymentColumns.map((column) => column.querySelector('dt')?.textContent)).toEqual(['Pago inicial:', 'Saldo pendiente:', 'Saldo total:'])
    expect(paymentColumns[0].querySelector('[data-payment-amount="initial"]')).toHaveTextContent('$500 MXN')
    expect(paymentColumns[0].querySelector('[data-payment-method="initial"]')).toHaveTextContent('Transferencia')
    expect(paymentColumns[1].querySelector('[data-payment-amount="balance"]')).toHaveTextContent('Pendiente de verificación')
    expect(paymentColumns[1].querySelector('[data-payment-method="balance"]')).not.toBeInTheDocument()
    expect(paymentColumns[2].querySelector('[data-payment-amount="total"]')).toHaveTextContent('$1,250 MXN')
    expect(paymentRow).toHaveTextContent('MXN')
    const contactRow = email.parentElement
    if (!header || !headerActions || !paymentRow || !customerRow || !contactRow) throw new Error('Expected header, contact, and payment rows in the reservation card.')
    for (const column of paymentColumns) {
      expect(column.querySelector('dt')?.nextElementSibling).toBe(column.querySelector('dd'))
      expect(column).toHaveClass('min-w-0')
    }
    expect(publicOrigin).toHaveAttribute('aria-label', 'Sitio público')
    expect(publicOrigin).toHaveAttribute('title', 'Sitio público')
    expect(publicOrigin).toHaveTextContent('Sitio público')
    expect(publicOrigin.querySelector('[data-icon="globe"]')).toBeInTheDocument()
    expect(publicOrigin).toHaveAttribute('data-customer-origin', 'public')
    expect(header).not.toContainElement(publicOrigin)
    expect(customerRow).toContainElement(publicOrigin)
    expect(heading.nextElementSibling).toBe(publicOrigin)
    expect(card).toHaveClass('p-3', 'sm:p-4')
    expect(card.firstElementChild).toHaveClass('gap-2')
    expect(header).toHaveClass('pb-2')
    expect(card.querySelector('details')).toHaveClass('pt-2')
    expect(headerActions.firstElementChild).toHaveAttribute('data-header-field', 'status')
    expect(headerActions).toContainElement(verifyButton)
    expect(headerActions).toContainElement(cancelButton)
    expect(verifyButton).toHaveClass('ops-icon-button', 'shrink-0')
    expect(cancelButton).toHaveClass('ops-icon-button', 'shrink-0')
    expect(verifyButton).toHaveAttribute('title', 'Verificar y reservar')
    expect(cancelButton).toHaveAttribute('title', 'Cancelar')
    expect(header).toContainElement(headerActions)
    expect(card).toContainElement(verifyButton)
    expect(card).toContainElement(cancelButton)
    expect(paymentColumns[0].querySelector('[data-payment-method="initial"]')).toContainElement(receipt)
    expect(paymentColumns[0].querySelector('[data-payment-method="initial"]')?.firstElementChild).toBe(receipt)
    expect(card.querySelector('[data-card-row="actions"]')).not.toBeInTheDocument()

    expect(whatsapp.parentElement).toBe(email.parentElement)
    expect(whatsapp.nextElementSibling).toBe(email)
    expect(customerRow).toHaveAttribute('data-card-row', 'customer')
    expect(contactRow).toHaveAttribute('data-card-row', 'contact')
    expect(header).toContainElement(eventDate)
    expect(customerRow.compareDocumentPosition(contactRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(contactRow.compareDocumentPosition(paymentRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(headerActions.compareDocumentPosition(verifyButton) & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy()
  })

  it('keeps non-public origin text in the header', async () => {
    api.listReservations.mockResolvedValue([reservation({ origin: 'phone' })])
    render(<EventReservationWorkspace />)

    const card = await screen.findByTestId('event-reservation-card')
    const header = card.querySelector<HTMLElement>('[data-card-row="header"]')
    const customerRow = card.querySelector<HTMLElement>('[data-card-row="customer"]')

    expect(header?.querySelector('[data-header-field="origin"]')).toHaveTextContent('Teléfono')
    expect(customerRow?.querySelector('[data-customer-origin="public"]')).not.toBeInTheDocument()
  })

  it('stacks existing payment methods and keeps the initial receipt exclusive to the initial transfer', async () => {
    const transferTicket = { url: 'https://example.invalid/event-ticket', key: 'events/request-1/receipt.webp' }
    api.listReservations.mockResolvedValue([reservation({ status: 'reserved', totalMxn: 1250, declaredPaymentAmount: 500, declaredPaymentMethod: 'transfer', confirmedPaymentAmount: 500, confirmedPaymentMethod: 'transfer', transferTicket, remainingPaymentAmount: 750, remainingPaymentMethod: 'transfer' })])
    api.refreshTicket.mockResolvedValue(transferTicket)
    render(<EventReservationWorkspace />)

    fireEvent.click(await screen.findByRole('button', { name: 'Todas: 1 reservas' }))
    const card = await screen.findByTestId('event-reservation-card')
    const initialPayment = card.querySelector('[data-parameter="initial-payment"]')
    const balance = card.querySelector('[data-parameter="balance"]')
    const receipt = within(card).getByRole('button', { name: 'Ver comprobante de transferencia' })

    expect(initialPayment?.querySelector('[data-payment-amount="initial"]')).toHaveTextContent('$500 MXN')
    expect(initialPayment?.querySelector('[data-payment-method="initial"]')).toHaveTextContent('Transferencia')
    expect(initialPayment?.querySelector('[data-payment-method="initial"]')).toContainElement(receipt)
    expect(balance?.querySelector('[data-payment-amount="balance"]')).toHaveTextContent('$750 MXN')
    expect(balance?.querySelector('[data-payment-method="balance"]')).toHaveTextContent('Transferencia')
    expect(balance?.querySelector('[data-payment-method="balance"]')).not.toContainElement(receipt)
  })

  it('refreshes reservations for realtime changes and cleans up its listener on unmount', async () => {
    api.listReservations.mockResolvedValueOnce([]).mockResolvedValueOnce([reservation()]).mockResolvedValue([reservation()])
    const view = render(<EventReservationWorkspace />)
    await screen.findByRole('region', { name: 'Módulo Eventos' })
    await waitFor(() => expect(api.subscribe).toHaveBeenCalledTimes(1))
    const staleListener = realtimeListener

    expect(staleListener).toBeDefined()
    staleListener?.({ reservation_id: 'reservation-1', status: 'pending' })
    await screen.findByTestId('event-reservation-card')
    expect(api.listReservations).toHaveBeenCalledTimes(2)

    view.rerender(<EventReservationWorkspace />)
    expect(api.subscribe).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(realtimeListener).toBeUndefined()
    staleListener?.({ reservation_id: 'reservation-1', status: 'reserved' })
    expect(api.listReservations).toHaveBeenCalledTimes(2)
  })

  it('supports an admin receipt during reservation creation and sends the durable key', async () => {
    render(<EventReservationWorkspace />)
    await screen.findByRole('region', { name: 'Módulo Eventos' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crear reserva' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas al pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar reserva' }))
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    fireEvent.change(screen.getByLabelText('Comprobante de transferencia (opcional)'), { target: { files: [new File(['ticket'], 'receipt.png', { type: 'image/png' })] } })
    await waitFor(() => expect(api.uploadTicket).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del cliente' }), { target: { value: 'Mariana Torres' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Teléfono del cliente' }), { target: { value: '55 1234 5678' } })
    const eventDate = chooseFutureDate()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Anticipo en MXN' }), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear reserva pendiente' }))

    await waitFor(() => expect(api.createAdmin).toHaveBeenCalledWith(expect.objectContaining({
      eventDate,
      declaredPaymentMethod: 'transfer',
      transferTicket: { url: 'https://example.invalid/event-ticket', key: 'events/request-1/receipt.webp' },
    })))
  })

  it('refreshes the receipt URL before showing an admin-created reservation', async () => {
    const staleTicket = { url: 'https://example.invalid/stale-event-ticket', key: 'events/request-1/receipt.webp' }
    const freshTicket = { url: 'https://example.invalid/fresh-event-ticket', key: staleTicket.key }
    api.createAdmin.mockResolvedValue(reservation({ declaredPaymentMethod: 'transfer', transferTicket: staleTicket }))
    api.refreshTicket.mockResolvedValue(freshTicket)
    render(<EventReservationWorkspace />)
    await screen.findByRole('region', { name: 'Módulo Eventos' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crear reserva' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas al pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar reserva' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del cliente' }), { target: { value: 'Mariana Torres' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Teléfono del cliente' }), { target: { value: '55 1234 5678' } })
    chooseFutureDate()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Anticipo en MXN' }), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear reserva pendiente' }))

    await waitFor(() => expect(api.refreshTicket).toHaveBeenCalledWith('reservation-1', 'request-1', staleTicket.key))
    const card = await screen.findByTestId('event-reservation-card')
    expect(within(card).getByRole('img', { name: 'Comprobante de transferencia' })).toHaveAttribute('src', freshTicket.url)
  })

  it('refreshes the receipt URL after an admin reservation change and before opening its viewer', async () => {
    const staleTicket = { url: 'https://example.invalid/stale-event-ticket', key: 'events/request-1/receipt.webp' }
    const freshTicket = { url: 'https://example.invalid/fresh-event-ticket', key: staleTicket.key }
    api.listReservations.mockResolvedValue([reservation({ declaredPaymentMethod: 'transfer', transferTicket: staleTicket })])
    api.refreshTicket.mockResolvedValue(freshTicket)
    api.reserve.mockResolvedValue(reservation({ status: 'reserved', declaredPaymentMethod: 'transfer', transferTicket: staleTicket, confirmedPaymentAmount: 50, confirmedPaymentMethod: 'transfer', remainingPaymentAmount: 75 }))
    render(<EventReservationWorkspace />)
    fireEvent.click(await screen.findByRole('button', { name: 'Todas: 1 reservas' }))
    const card = await screen.findByTestId('event-reservation-card')
    await waitFor(() => expect(api.refreshTicket).toHaveBeenCalledTimes(1))

    fireEvent.click(within(card).getByRole('button', { name: 'Verificar y reservar' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Verificar pago y reservar' })).getByRole('button', { name: 'Verificar y reservar' }))
    await waitFor(() => expect(api.reserve).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(api.refreshTicket).toHaveBeenCalledTimes(2))
    expect(within(card).getByRole('img', { name: 'Comprobante de transferencia' })).toHaveAttribute('src', freshTicket.url)

    fireEvent.click(within(card).getByRole('button', { name: 'Ver comprobante de transferencia' }))
    await waitFor(() => expect(api.refreshTicket).toHaveBeenCalledTimes(3))
    const viewer = await screen.findByRole('dialog', { name: 'Comprobante de transferencia' })
    expect(within(viewer).getByRole('img', { name: 'Comprobante de transferencia' })).toHaveAttribute('src', freshTicket.url)
  })

  it('uses the same fixed-width track on mobile and desktop with two-axis scrolling', async () => {
    api.listReservations.mockResolvedValue([reservation()])
    render(<EventReservationWorkspace />)

    const card = await screen.findByTestId('event-reservation-card')
    const grid = card.parentElement
    const scrollRegion = grid?.parentElement

    expect(grid).toHaveClass('grid', 'grid-cols-[24rem]', 'items-stretch', 'gap-3', 'md:grid-cols-[repeat(auto-fit,24rem)]')
    expect(grid).not.toHaveClass('md:grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))]')
    expect(grid).not.toHaveClass('ops-scroll-region')
    expect(scrollRegion).toHaveClass('ops-scroll-region', 'min-w-0', 'overflow-x-auto', 'overflow-y-auto')
  })

  it('allows an admin to upload a receipt while verifying a transfer payment', async () => {
    api.listReservations.mockResolvedValue([reservation()])
    render(<EventReservationWorkspace />)
    await screen.findByTestId('event-reservation-card')
    fireEvent.click(screen.getByRole('button', { name: 'Verificar y reservar' }))
    const dialog = screen.getByRole('dialog', { name: 'Verificar pago y reservar' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transferencia' }))
    expect(within(dialog).getByRole('button', { name: 'Cambiar comprobante' })).toHaveAttribute('title', 'Cambiar comprobante')
    expect(within(dialog).queryByText('Cambiar comprobante')).not.toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Comprobante de transferencia de la reserva (opcional)'), { target: { files: [new File(['ticket'], 'receipt.png', { type: 'image/png' })] } })
    await waitFor(() => expect(api.uploadTicket).toHaveBeenCalledWith('request-1', expect.any(File)))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verificar y reservar' }))
    await waitFor(() => expect(api.reserve).toHaveBeenCalledWith(expect.objectContaining({
      paymentMethod: 'transfer',
      transferTicket: { url: 'https://example.invalid/event-ticket', key: 'events/request-1/receipt.webp' },
    })))
  })

  it('completes a same-day reservation with false date-change and no-cart flags', async () => {
    api.listReservations.mockResolvedValue([reservation({ status: 'reserved', eventDate: todayValue(), confirmedPaymentAmount: 50, confirmedPaymentMethod: 'cash', remainingPaymentAmount: 75 })])
    render(<EventReservationWorkspace />)
    fireEvent.click(await screen.findByRole('button', { name: 'Todas: 1 reservas' }))
    await screen.findByTestId('event-reservation-card')
    fireEvent.click(screen.getByRole('button', { name: 'Completar entrega' }))
    const dialog = screen.getByRole('dialog', { name: 'Completar reserva y generar venta' })
    expect(within(dialog).queryByLabelText('Referencia del saldo')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transferencia' }))
    const receipt = new File(['remaining-ticket'], 'remaining.png', { type: 'image/png' })
    fireEvent.change(within(dialog).getByLabelText('Comprobante de transferencia del saldo (opcional)'), { target: { files: [receipt] } })
    await waitFor(() => expect(api.uploadTicket).toHaveBeenCalledWith('request-1', receipt))
    expect(dialog.querySelectorAll('input[type="radio"]')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar entrega y generar venta' }))
    await waitFor(() => expect(api.complete).toHaveBeenCalledWith(expect.objectContaining({ completion: expect.objectContaining({ remainingPaymentMethod: 'transfer', remainingPaymentAmount: 75, remainingTransferTicket: { url: 'https://example.invalid/event-ticket', key: 'events/request-1/receipt.webp' }, confirmDateChange: false, allowWithoutCart: false }) })))
    expect(api.getAvailability).not.toHaveBeenCalled()
  })

  it('checks actual-date availability before confirming an early completion', async () => {
    const reservedDate = '2099-09-12'
    api.listReservations.mockResolvedValue([reservation({ status: 'reserved', eventDate: reservedDate, confirmedPaymentAmount: 50, confirmedPaymentMethod: 'cash', remainingPaymentAmount: 75 })])
    api.getAvailability.mockResolvedValue({ eventDate: todayValue(), capacityLimit: 7, allocatedCount: 4, availableCount: 3 })
    render(<EventReservationWorkspace />)
    fireEvent.click(await screen.findByRole('button', { name: 'Todas: 1 reservas' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Completar entrega' }))
    const completionDialog = screen.getByRole('dialog', { name: 'Completar reserva y generar venta' })
    fireEvent.click(within(completionDialog).getByRole('button', { name: 'Verificar disponibilidad' }))

    await waitFor(() => expect(api.getAvailability).toHaveBeenCalledWith(todayValue()))
    expect(api.complete).not.toHaveBeenCalled()
    const confirmation = await screen.findByRole('dialog', { name: 'Confirmar cambio de fecha' })
    expect(confirmation).toHaveTextContent(reservedDate)
    expect(confirmation).toHaveTextContent(todayValue())
    expect(confirmation).toHaveTextContent('3')
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Confirmar cambio y completar' }))

    await waitFor(() => expect(api.complete).toHaveBeenCalledWith(expect.objectContaining({ completion: expect.objectContaining({ confirmDateChange: true, allowWithoutCart: false }) })))
  })

  it('requires a second explicit confirmation to complete early without a cart', async () => {
    api.listReservations.mockResolvedValue([reservation({ status: 'reserved', eventDate: '2099-09-12', confirmedPaymentAmount: 50, confirmedPaymentMethod: 'cash', remainingPaymentAmount: 75 })])
    api.getAvailability.mockResolvedValue({ eventDate: todayValue(), capacityLimit: 7, allocatedCount: 7, availableCount: 0 })
    render(<EventReservationWorkspace />)
    fireEvent.click(await screen.findByRole('button', { name: 'Todas: 1 reservas' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Completar entrega' }))
    const completionDialog = screen.getByRole('dialog', { name: 'Completar reserva y generar venta' })
    fireEvent.click(within(completionDialog).getByRole('button', { name: 'Verificar disponibilidad' }))

    const warning = await screen.findByRole('dialog', { name: 'No hay carritos disponibles' })
    expect(warning).toHaveTextContent('no consumirá capacidad')
    fireEvent.click(within(warning).getByRole('button', { name: 'Cancelar' }))
    expect(api.complete).not.toHaveBeenCalled()
    fireEvent.click(within(completionDialog).getByRole('button', { name: 'Verificar disponibilidad' }))
    const secondWarning = await screen.findByRole('dialog', { name: 'No hay carritos disponibles' })
    fireEvent.click(within(secondWarning).getByRole('button', { name: 'Completar sin carrito' }))

    await waitFor(() => expect(api.complete).toHaveBeenCalledWith(expect.objectContaining({ completion: expect.objectContaining({ confirmDateChange: true, allowWithoutCart: true }) })))
  })

  it('replaces and removes the separate remaining transfer receipt without touching the initial receipt', async () => {
    api.listReservations.mockResolvedValue([reservation({ status: 'reserved', eventDate: todayValue(), declaredPaymentMethod: 'transfer', transferTicket: { url: 'https://example.invalid/initial', key: 'events/request-1/initial.webp' }, confirmedPaymentAmount: 50, confirmedPaymentMethod: 'transfer', remainingPaymentAmount: 75 })])
    const firstTicket = { url: 'https://example.invalid/remaining-1', key: 'events/request-1/remaining-1.webp' }
    const secondTicket = { url: 'https://example.invalid/remaining-2', key: 'events/request-1/remaining-2.webp' }
    api.uploadTicket.mockResolvedValueOnce(firstTicket).mockResolvedValueOnce(secondTicket)
    render(<EventReservationWorkspace />)
    fireEvent.click(await screen.findByRole('button', { name: 'Todas: 1 reservas' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Completar entrega' }))
    const dialog = screen.getByRole('dialog', { name: 'Completar reserva y generar venta' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transferencia' }))
    const receiptInput = within(dialog).getByLabelText('Comprobante de transferencia del saldo (opcional)')
    fireEvent.change(receiptInput, { target: { files: [new File(['one'], 'one.png', { type: 'image/png' })] } })
    await waitFor(() => expect(api.uploadTicket).toHaveBeenCalledTimes(1))
    fireEvent.change(receiptInput, { target: { files: [new File(['two'], 'two.png', { type: 'image/png' })] } })
    await waitFor(() => expect(api.uploadTicket).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(api.removeTicket).toHaveBeenCalledWith('request-1', firstTicket.key, secondTicket.key))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar comprobante del saldo' }))
    await waitFor(() => expect(api.removeTicket).toHaveBeenCalledWith('request-1', secondTicket.key))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar entrega y generar venta' }))
    await waitFor(() => expect(api.complete).toHaveBeenCalledWith(expect.objectContaining({ completion: expect.objectContaining({ remainingTransferTicket: null }) })))
    expect(api.removeTicket).not.toHaveBeenCalledWith('request-1', 'events/request-1/initial.webp')
  })

  it('only gives the admin event selected-line list its own scroll at more than three lines', async () => {
    api.listCatalog.mockResolvedValue(fourLineCatalog)
    render(<EventReservationWorkspace />)
    await screen.findByRole('region', { name: 'Módulo Eventos' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crear reserva' }))
    for (const category of fourLineCatalog) fireEvent.click(screen.getByRole('button', { name: `Agregar categoría ${category.category} al pedido` }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar reserva' }))
    expect(screen.getByTestId('event-selected-lines')).toHaveClass('max-h-[min(28rem,42dvh)]', 'overflow-y-auto')
  })
})
