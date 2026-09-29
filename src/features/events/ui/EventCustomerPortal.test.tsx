import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventReservation } from '../api/types'

const api = vi.hoisted(() => ({
  listCatalog: vi.fn(),
  getAvailability: vi.fn(),
  getReservation: vi.fn(),
  createReservation: vi.fn(),
  uploadTicket: vi.fn(),
  removeTicket: vi.fn(),
  cleanupTickets: vi.fn(),
}))

vi.mock('../../wholesale/api/catalog', () => ({ listPublicWholesaleCatalog: api.listCatalog }))
vi.mock('../api/reservations', () => ({
  getEventAvailability: api.getAvailability,
  getPublicEventReservation: api.getReservation,
  createPublicEventReservation: api.createReservation,
}))
vi.mock('../../wholesale/api/transferTickets', () => ({
  uploadEventTransferTicket: api.uploadTicket,
  removeEventTransferTicket: api.removeTicket,
  cleanupEventTransferTickets: api.cleanupTickets,
}))

import { EventCustomerPortal } from './EventCustomerPortal'

const catalog = [{ id: 'product-1', name: 'Mango', sku: 'M-01', categoryId: 'category-1', category: 'Paletas', retailPriceMxn: 125, wholesalePriceMxn: 100, imageUrl: null }]
const fourLineCatalog = Array.from({ length: 4 }, (_, index) => ({ id: `product-${index + 1}`, name: `Mango ${index + 1}`, sku: `M-${index + 1}`, categoryId: `category-${index + 1}`, category: `Paletas ${index + 1}`, retailPriceMxn: 125, wholesalePriceMxn: 100, imageUrl: null }))
const reservation: EventReservation = {
  id: 'reservation-1', requestId: 'request-1', customerName: 'Mariana Torres', customerPhone: '+525512345678', customerEmail: null,
  eventDate: '2099-09-12', cartAllocated: false, status: 'pending', origin: 'public', paymentPlan: 'advance', totalMxn: 125,
  declaredPaymentAmount: 50, declaredPaymentMethod: 'cash', declaredPaymentReference: null, transferTicket: null, confirmedPaymentAmount: null,
  confirmedPaymentMethod: null, confirmedPaymentReference: null, confirmedPaymentNote: null, paymentConfirmedAt: null,
  paymentConfirmedBy: null, remainingPaymentAmount: 0, remainingPaymentMethod: null,
  remainingPaymentNote: null, reservedAt: null, reservedBy: null, completedAt: null, cancelledAt: null, cancelledBy: null,
  cancellationReason: null, saleId: null, createdBy: null, createdAt: '2099-09-12T00:00:00Z', updatedAt: '2099-09-12T00:00:00Z',
  adminSeenAt: null, adminSeenBy: null, items: [],
}

function futureDate() {
  const date = new Date()
  date.setDate(date.getDate() + 2)
  return date
}

function selectEventDate() {
  const date = futureDate()
  fireEvent.click(screen.getByRole('button', { name: /^Fecha del evento:/ }))
  fireEvent.click(screen.getByRole('button', { name: date.toLocaleDateString('es-MX', { dateStyle: 'long' }) }))
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

describe('EventCustomerPortal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.localStorage.clear()
    api.listCatalog.mockResolvedValue(catalog)
    api.getAvailability.mockResolvedValue({ eventDate: '2099-09-12', capacityLimit: 7, allocatedCount: 0, availableCount: 7 })
    api.getReservation.mockResolvedValue(null)
    api.createReservation.mockResolvedValue(reservation)
    api.uploadTicket.mockResolvedValue({ url: 'https://example.invalid/event-ticket', key: 'events/11111111-1111-4111-8111-111111111111/receipt.webp' })
    api.removeTicket.mockResolvedValue({ key: 'events/11111111-1111-4111-8111-111111111111/receipt.webp', removed: true, referenced: false })
    api.cleanupTickets.mockResolvedValue({ removedKeys: [], retainedKeys: [] })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('validates before opening the confirmation modal, then calls the RPC only after confirmation', async () => {
    const view = render(<EventCustomerPortal />)
    await screen.findByRole('heading', { name: 'Arma tu pedido' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas al pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar solicitud' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(screen.queryByRole('dialog', { name: 'Confirmar solicitud de evento' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('El nombre del cliente es obligatorio.'))).toBe(true)
    expect(api.createReservation).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del cliente' }), { target: { value: 'Mariana Torres' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Teléfono del cliente' }), { target: { value: '55 1234 5678' } })
    const selectedDate = selectEventDate()
    await waitFor(() => {
      expect(api.getAvailability).toHaveBeenCalledWith(selectedDate)
      expect(screen.getByRole('status')).toHaveTextContent('7 de 7 carritos disponibles para esta fecha.')
    })
    const advanceInput = screen.getByRole('spinbutton', { name: 'Anticipo en MXN' })
    expect(advanceInput).toHaveAttribute('step', '1')
    expect(advanceInput).toHaveAttribute('inputmode', 'numeric')
    fireEvent.change(advanceInput, { target: { value: '50.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(screen.queryByRole('dialog', { name: 'Confirmar solicitud de evento' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('importe entero positivo'))).toBe(true)
    fireEvent.change(advanceInput, { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    const dialog = screen.getByRole('dialog', { name: 'Confirmar solicitud de evento' })
    expect(dialog).toHaveTextContent('Mariana Torres')
    expect(dialog).toHaveTextContent(selectedDate)
    expect(api.createReservation).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar y enviar' }))
    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1))
    const payload = api.createReservation.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toMatchObject({ customerName: 'Mariana Torres', customerPhone: '55 1234 5678', eventDate: selectedDate, declaredPaymentAmount: 50 })
    expect(payload).not.toHaveProperty('eventName')
    expect(payload).not.toHaveProperty('responsibleName')
    expect(view.container.querySelectorAll('input[type="date"], input[type="radio"]')).toHaveLength(0)
    expect(await screen.findByText('La administración verificará el pago inicial y se pondrá en contacto con usted, a través de WhatsApp, para completar la reserva.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear otra solicitud' })).not.toBeInTheDocument()
    const closeResultButton = screen.getByRole('button', { name: 'Cerrar resultado de solicitud' })
    expect(closeResultButton).toHaveAttribute('title', 'Cerrar resultado de solicitud')
    fireEvent.click(closeResultButton)
    await screen.findByRole('heading', { name: 'Arma tu pedido' })
  })

  it('aligns required and optional status text to the right of event field titles', async () => {
    render(<EventCustomerPortal />)
    await screen.findByRole('heading', { name: 'Arma tu pedido' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas al pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar solicitud' }))

    const requiredTitle = screen.getByText('Nombre del cliente').parentElement
    const optionalTitle = screen.getByText('Correo').parentElement
    expect(requiredTitle).toHaveClass('flex', 'justify-between')
    expect(requiredTitle).toHaveTextContent('Obligatorio')
    expect(optionalTitle).toHaveClass('flex', 'justify-between')
    expect(optionalTitle).toHaveTextContent('Opcional')
    expect(screen.queryByLabelText('Nombre del evento')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Persona responsable')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Fecha del evento:/ })).toHaveAttribute('aria-required', 'true')
    expect(screen.getByRole('group', { name: 'Forma de pago inicial' }).querySelectorAll('input[type="radio"]')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Anticipo' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the theme toggle in the public event header', async () => {
    render(<EventCustomerPortal />)
    await screen.findByRole('heading', { name: 'Arma tu pedido' })

    const banner = screen.getByRole('banner')
    expect(banner).toContainElement(screen.getByRole('button', { name: 'Cambiar al tema claro' }))
    expect(banner).toHaveClass('ops-navbar-header')
    expect(screen.getByRole('button', { name: 'Cambiar al tema claro' })).toHaveClass('ops-navbar-action')
    expect(within(banner).getByRole('button', { name: 'Información de reservas para eventos' })).toHaveClass('ops-navbar-action')
  })

  it('shows the proof picker only for transfer and includes its key in the public reservation', async () => {
    render(<EventCustomerPortal />)
    await screen.findByRole('heading', { name: 'Arma tu pedido' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas al pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar solicitud' }))
    expect(screen.queryByLabelText('Comprobante de transferencia (opcional)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Referencia del pago inicial')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    expect(screen.getByLabelText('Referencia del pago inicial')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Referencia del pago inicial'), { target: { value: 'stale-cash-reference' } })
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
    expect(screen.queryByLabelText('Referencia del pago inicial')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    expect(screen.getByLabelText('Referencia del pago inicial')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Adjuntar comprobante' })).toHaveAttribute('title', 'Adjuntar comprobante')
    expect(screen.queryByText('Adjuntar comprobante')).not.toBeInTheDocument()
    const input = screen.getByLabelText('Comprobante de transferencia (opcional)')
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    fireEvent.change(input, { target: { files: [new File(['ticket'], 'receipt.png', { type: 'image/png' })] } })
    await waitFor(() => expect(api.uploadTicket).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del cliente' }), { target: { value: 'Mariana Torres' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Teléfono del cliente' }), { target: { value: '55 1234 5678' } })
    selectEventDate()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Anticipo en MXN' }), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirmar solicitud de evento' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar y enviar' }))

    await waitFor(() => expect(api.createReservation).toHaveBeenCalledWith(expect.objectContaining({
      declaredPaymentMethod: 'transfer',
      transferTicket: { url: 'https://example.invalid/event-ticket', key: 'events/11111111-1111-4111-8111-111111111111/receipt.webp' },
    })))
  })

  it('makes the event summary the only scroll owner around selected lines and reservation details', async () => {
    render(<EventCustomerPortal />)
    await screen.findByRole('heading', { name: 'Arma tu pedido' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas al pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar solicitud' }))

    const selectedLines = screen.getByTestId('event-selected-lines')
    const summary = selectedLines.closest('aside')
    const form = screen.getByRole('button', { name: 'Enviar solicitud' }).closest('form')
    const details = screen.getByRole('region', { name: 'Datos de la reserva' })

    expect(summary?.parentElement).toBe(form)
    expect(summary).toHaveClass('min-h-0', 'overflow-y-auto', 'lg:h-full', 'lg:min-h-0', 'lg:overflow-y-auto')
    expect(summary).not.toHaveClass('overflow-hidden', 'lg:overflow-hidden')
    expect(selectedLines).toHaveClass('flex-none', 'max-h-none', 'overflow-visible')
    expect(selectedLines).not.toHaveClass('flex-1', 'lg:flex-1', 'overflow-y-auto', 'lg:overflow-y-auto')
    expect(details.parentElement).toHaveClass('shrink-0')
    expect(details.parentElement?.nextElementSibling).toBe(summary?.lastElementChild)
  })

  it('only gives the event selected-line list its own scroll at more than three lines', async () => {
    api.listCatalog.mockResolvedValue(fourLineCatalog)
    render(<EventCustomerPortal />)
    await screen.findByRole('heading', { name: 'Arma tu pedido' })
    for (const category of fourLineCatalog) fireEvent.click(screen.getByRole('button', { name: `Agregar categoría ${category.category} al pedido` }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar solicitud' }))
    const selectedLines = screen.getByTestId('event-selected-lines')
    expect(selectedLines).toHaveClass('max-h-[min(28rem,42dvh)]', 'overflow-y-auto')

    fireEvent.click(screen.getByRole('button', { name: 'Vaciar carrito' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas 1 al pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas 2 al pedido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría Paletas 3 al pedido' }))
    expect(screen.getByTestId('event-selected-lines')).toHaveClass('max-h-none', 'overflow-visible')
    expect(screen.getByTestId('event-selected-lines')).not.toHaveClass('overflow-y-auto')
  })
})
