import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminBoundary } from '../../auth/ui/AdminBoundary'
import * as authApi from '../../auth/api/adminAccess'
import * as productApi from '../../products/api/products'
import * as salesApi from '../api/sales'
import { SalesWorkspace } from './SalesWorkspace'

vi.mock('../../auth/api/adminAccess', () => ({ getAdminAccess: vi.fn(), signIn: vi.fn() }))
vi.mock('../../products/api/products', () => ({ listProducts: vi.fn(), MAX_PRODUCT_TAG_LENGTH: 48, MAX_PRODUCT_TAGS: 20, PRODUCT_IMAGE_MAX_BYTES: 5 * 1024 * 1024, PRODUCT_IMAGE_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'], normalizeProductTags: (value: unknown) => Array.isArray(value) ? value.map((tag) => String(tag).trim()).filter(Boolean) : [] }))
vi.mock('../api/sales', () => ({
  EVENT_ADVANCE_PAYMENT_METHODS: ['cash', 'card'],
  POS_PAYMENT_METHODS: ['cash', 'card', 'transfer', 'other'],
  WHOLESALE_DELIVERY_METHODS: ['delivery', 'pickup'],
  WHOLESALE_PAYMENT_METHODS: ['credit', 'cash', 'transfer'],
  recordSale: vi.fn(),
}))

const products: productApi.Product[] = [
  { id: 'product-1', name: 'Mango', sku: 'M-01', category: 'Paletas', retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true, tags: ['fruta'], imageUrl: 'https://cdn.example.com/mango.jpg', imageKey: null, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' },
  { id: 'product-2', name: 'Strawberry', sku: 'S-02', category: 'Creams', retailPriceMxn: 28, wholesalePriceMxn: 22, active: true, tags: [], imageUrl: null, imageKey: null, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' },
]
const receipt: salesApi.SaleReceipt = { id: 'sale-1', channel: 'pos', totalMxn: 85, createdAt: '2026-08-20T00:00:00Z', replayed: false }
const renderProtected = (channel: salesApi.SalesChannel = 'pos') => render(<AdminBoundary><SalesWorkspace channel={channel} /></AdminBoundary>)

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

  it.each([
    ['pos', 'Registrar venta en punto de venta', 'Datos de la venta de mostrador', 'Precio de menudeo', '$42.50 MXN'],
    ['wholesale', 'Registrar venta mayorista', 'Datos del pedido mayorista', 'Precio de mayoreo', '$35.00 MXN'],
    ['event', 'Registrar venta para evento', 'Datos del evento', 'Precio para evento', '$42.50 MXN'],
  ] as const)('renders the fixed %s channel as a distinct module', async (channel, title, detailsTitle, priceLabel, price) => {
    renderProtected(channel)
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: detailsTitle })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(screen.getAllByText(priceLabel, { exact: true }).length).toBeGreaterThan(0)
    expect(screen.getAllByText(price).length).toBeGreaterThan(0)
    expect(screen.queryByRole('tablist', { name: 'Canal de venta' })).not.toBeInTheDocument()
  })

  it('requires the POS payment method while keeping the customer name optional', async () => {
    renderProtected('pos')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar venta' }))
    expect(screen.getByRole('alert')).toHaveTextContent('forma de pago')
    expect(salesApi.recordSale).not.toHaveBeenCalled()
  })

  it('validates and submits the wholesale business context', async () => {
    renderProtected('wholesale')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar venta' }))
    expect(screen.getByRole('alert')).toHaveTextContent('método de entrega')
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre del cliente/ }), { target: { value: 'Tienda La Plaza' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Teléfono/ }), { target: { value: '55 1234 5678' } })
    fireEvent.change(screen.getByRole('combobox', { name: /Método de entrega/ }), { target: { value: 'delivery' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Crédito' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar venta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }))
    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument()
    expect(salesApi.recordSale).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'wholesale',
      details: { channel: 'wholesale', customerName: 'Tienda La Plaza', phone: '55 1234 5678', deliveryMethod: 'delivery', paymentMethod: 'credit' },
    }))
  })

  it('submits an event sale with no advance without a payment method', async () => {
    renderProtected('event')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre del evento/ }), { target: { value: 'Festival de verano' } })
    fireEvent.change(screen.getByLabelText(/Fecha del evento/), { target: { value: '2026-09-12' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Responsable o cliente/ }), { target: { value: 'Mariana Torres' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar venta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }))
    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument()
    expect(salesApi.recordSale).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'event',
      details: { channel: 'event', eventName: 'Festival de verano', eventDate: '2026-09-12', responsibleName: 'Mariana Torres' },
    }))
  })

  it('rejects a positive event advance without a payment method before submission', async () => {
    renderProtected('event')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre del evento/ }), { target: { value: 'Festival de verano' } })
    fireEvent.change(screen.getByLabelText(/Fecha del evento/), { target: { value: '2026-09-12' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Responsable o cliente/ }), { target: { value: 'Mariana Torres' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /Anticipo en MXN/ }), { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar venta' }))
    expect(screen.getByRole('alert')).toHaveTextContent('forma de pago para el anticipo')
    expect(salesApi.recordSale).not.toHaveBeenCalled()
  })

  it('submits a positive event advance with its payment method', async () => {
    renderProtected('event')
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    fireEvent.change(screen.getByRole('textbox', { name: /Nombre del evento/ }), { target: { value: 'Festival de verano' } })
    fireEvent.change(screen.getByLabelText(/Fecha del evento/), { target: { value: '2026-09-12' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Responsable o cliente/ }), { target: { value: 'Mariana Torres' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /Anticipo en MXN/ }), { target: { value: '250' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Tarjeta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar venta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }))
    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument()
    expect(salesApi.recordSale).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'event',
      details: { channel: 'event', eventName: 'Festival de verano', eventDate: '2026-09-12', responsibleName: 'Mariana Torres', advanceAmountMxn: 250, advancePaymentMethod: 'card' },
    }))
  })

  it('maps product images into sale cards and keeps the fallback tile', async () => {
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    expect(screen.getByRole('img', { name: 'Mango' })).toHaveAttribute('src', 'https://cdn.example.com/mango.jpg')
    expect(screen.getByRole('img', { name: 'Strawberry' })).toHaveAttribute('aria-label', 'Strawberry')
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
    fireEvent.click(screen.getByRole('radio', { name: 'Efectivo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar venta' }))
    expect(await screen.findByRole('heading', { name: 'Revisar venta' })).toBeInTheDocument()
    expect(salesApi.recordSale).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }))
    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument()
    expect(screen.getByText('Total confirmado').parentElement).toHaveTextContent('$85.00 MXN')
    expect(salesApi.recordSale).toHaveBeenCalledWith({ requestId: 'request-1', channel: 'pos', details: { channel: 'pos', paymentMethod: 'cash' }, items: [{ productId: 'product-1', quantity: 2 }] })
  })

  it('recovers from a sale API error with an idempotent retry', async () => {
    vi.mocked(salesApi.recordSale).mockRejectedValueOnce(new Error('server')).mockResolvedValueOnce(receipt)
    renderProtected()
    await screen.findByRole('heading', { name: 'Mango' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Mango a la venta' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Efectivo' }))
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
