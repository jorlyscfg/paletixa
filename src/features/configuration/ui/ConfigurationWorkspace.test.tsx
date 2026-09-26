import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminSessionPersistenceProvider, createAdminSessionStorageKey } from '../../../app/sessionPersistence'
import type { EffectiveSetting } from '../api/configuration'

const api = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), getTimezone: vi.fn(), setTimezone: vi.fn(), getReceipt: vi.fn(), setReceipt: vi.fn(), uploadReceipt: vi.fn(), removeReceipt: vi.fn() }))
vi.mock('../api/configuration', () => ({
  DEFAULT_EVENT_CART_CAPACITY: 7,
  DEFAULT_POS_USD_MXN_RATE: 15,
  DEFAULT_POS_WHOLESALE_THRESHOLD: 10,
  REPORT_TIMEZONES: ['America/Cancun', 'America/Mexico_City'],
  OPERATIONAL_CONFIGURATION_BOUNDS: {
    event_daily_capacity: { type: 'integer', min: 1, max: 10000 },
    pos_usd_mxn_rate: { type: 'rate', min: 0.01, max: 10000 },
    pos_wholesale_threshold: { type: 'integer', min: 1, max: 10000 },
  },
  getOperationalConfiguration: api.get,
  getReportTimezoneConfiguration: api.getTimezone,
  isConfigurationUnauthorizedError: (error: unknown) => error instanceof Error && error.message === 'access denied',
  setOperationalConfiguration: api.set,
  setReportTimezoneConfiguration: api.setTimezone,
  validateOperationalConfigurationValue: (key: string, value: number) => {
    if (key === 'pos_usd_mxn_rate' && (value < 0.01 || value > 10000)) throw new Error('between 0.01 and 10000')
    if (key !== 'pos_usd_mxn_rate' && (!Number.isInteger(value) || value < 1 || value > 10000)) throw new Error('between 1 and 10000')
    return value
  },
  validateReportTimezone: (value: string) => {
    if (!['America/Cancun', 'America/Mexico_City'].includes(value)) throw new Error('Reporting timezone is invalid')
    return value
  },
}))
vi.mock('../api/salesReceipt', () => ({
  SALES_RECEIPT_COMPANY_EMAIL_MAX_LENGTH: 320,
  SALES_RECEIPT_COMPANY_PHONE_MAX_LENGTH: 128,
  SALES_RECEIPT_LOGO_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  SALES_RECEIPT_LOGO_MAX_BYTES: 2 * 1024 * 1024,
  getSalesReceiptConfiguration: api.getReceipt,
  setSalesReceiptConfiguration: api.setReceipt,
  uploadSalesReceiptLogo: api.uploadReceipt,
  removeSalesReceiptLogo: api.removeReceipt,
}))

import { ConfigurationWorkspace } from './ConfigurationWorkspace'

const configuration: EffectiveSetting[] = [
  { key: 'event_daily_capacity', type: 'integer', value: 7, scope: 'global', ownerId: 'admin-1', state: 'compatibility-default', effectiveAt: null },
  { key: 'pos_usd_mxn_rate', type: 'rate', value: 17.25, scope: 'global', ownerId: 'admin-1', state: 'configured', effectiveAt: '2026-08-29T12:00:00.000Z' },
  { key: 'pos_wholesale_threshold', type: 'integer', value: 10, scope: 'global', ownerId: 'admin-1', state: 'compatibility-default', effectiveAt: null },
]
const timezoneConfiguration = { timezone: 'America/Cancun' as const, scope: 'global' as const, ownerId: 'admin-1', state: 'compatibility-default' as const, effectiveAt: null }

describe('ConfigurationWorkspace', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue(configuration)
    api.getTimezone.mockResolvedValue(timezoneConfiguration)
    api.set.mockResolvedValue({ ...configuration[1], resultStatus: 'created', value: 18 })
    api.setTimezone.mockResolvedValue({ ...timezoneConfiguration, timezone: 'America/Mexico_City', state: 'configured', effectiveAt: '2026-08-29T12:00:00.000Z', resultStatus: 'created' })
    api.getReceipt.mockResolvedValue({ logoUrl: null, logoKey: null, companyPhone: null, companyEmail: null, showLogo: true, showBranch: true, showCashier: true, showCustomer: true, showPaymentMethod: true, showCompanyPhone: true, showCompanyEmail: true, showCustomerUrl: true, ownerId: 'admin-1', updatedAt: '2026-08-29T12:00:00.000Z' })
    api.setReceipt.mockResolvedValue({ logoUrl: null, logoKey: null, companyPhone: null, companyEmail: null, showLogo: true, showBranch: true, showCashier: true, showCustomer: true, showPaymentMethod: true, showCompanyPhone: true, showCompanyEmail: true, showCustomerUrl: true, ownerId: 'admin-1', updatedAt: '2026-08-29T12:00:00.000Z' })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('keeps loading inside one scrollable workspace frame with compact skeleton cards', () => {
    const pending = new Promise<never>(() => undefined)
    api.get.mockReturnValue(pending)
    api.getTimezone.mockReturnValue(pending)
    api.getReceipt.mockReturnValue(pending)

    render(<ConfigurationWorkspace />)

    const frame = screen.getByRole('region', { name: 'Módulo Configuración' })
    expect(frame).toHaveClass('ops-workspace-frame', 'overflow-hidden')
    expect(frame.querySelector('.ops-scroll-region')).toBeInTheDocument()
    expect(document.querySelectorAll('.ops-workspace-frame')).toHaveLength(1)
    expect(screen.getByRole('status', { name: 'Cargando Configuración' })).toHaveClass('ops-state', 'ops-state-loading')
    expect(screen.getAllByTestId('configuration-loading-card')).toHaveLength(5)
  })

  it('keeps a recoverable load error inside the canonical error state', async () => {
    api.get.mockRejectedValueOnce(new Error('temporary failure'))
    render(<ConfigurationWorkspace />)

    const error = await screen.findByRole('alert')
    expect(error).toHaveClass('ops-state', 'ops-state-error')
    expect(screen.getByRole('region', { name: 'Módulo Configuración' }).querySelector('.ops-scroll-region')).toContainElement(error)
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('renders only the typed global settings with effective metadata', async () => {
    render(<ConfigurationWorkspace />)
    expect(await screen.findByRole('heading', { name: 'Capacidad diaria de Eventos' })).toBeInTheDocument()
    expect(screen.getAllByRole('form')).toHaveLength(5)
    expect(screen.getAllByText('Valor de compatibilidad; aún no se ha configurado.')).toHaveLength(3)
    expect(screen.getByText('Configurado')).toBeInTheDocument()
    expect(screen.getByDisplayValue('17.25')).toBeInTheDocument()
    expect(screen.queryByText(/inventario|impuesto|compras/i)).not.toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Configuración del comprobante de venta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zona horaria aplicada' })).toHaveTextContent('Cancún (America/Cancun)')
    expect(screen.getByTestId('configuration-settings-grid')).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'xl:grid-cols-3')
  })

  it('moves card descriptions into accessible title tooltips and omits owner metadata', async () => {
    render(<ConfigurationWorkspace />)
    await screen.findByRole('heading', { name: 'Capacidad diaria de Eventos' })

    expect(screen.queryByText('Límite comercial de carritos reservados por fecha. No representa existencias físicas.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Información sobre Capacidad diaria de Eventos' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Límite comercial de carritos reservados por fecha. No representa existencias físicas.')
    expect(screen.queryByText('Propietario')).not.toBeInTheDocument()
  })

  it('keeps rule and timezone save actions inline with their flexible fields', async () => {
    render(<ConfigurationWorkspace />)
    await screen.findByRole('heading', { name: 'Capacidad diaria de Eventos' })

    const ruleField = screen.getByTestId('configuration-input-event_daily_capacity').parentElement?.parentElement as HTMLElement
    const timezoneField = screen.getByRole('button', { name: 'Zona horaria aplicada' }).parentElement?.parentElement?.parentElement as HTMLElement
    expect(ruleField).toHaveClass('flex', 'min-w-0')
    expect(within(ruleField).getByRole('button', { name: 'Guardar configuración' })).toHaveClass('shrink-0')
    expect(timezoneField).toHaveClass('flex', 'min-w-0')
    expect(within(timezoneField).getByRole('button', { name: 'Guardar zona horaria' })).toHaveClass('shrink-0')
  })

  it('formats effective timestamps while retaining their exact ISO dateTime', async () => {
    render(<ConfigurationWorkspace />)
    await screen.findByRole('heading', { name: 'Capacidad diaria de Eventos' })

    const timestamp = '2026-08-29T12:00:00.000Z'
    const formatted = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
    const effectiveTime = document.querySelector(`time[dateTime="${timestamp}"]`)

    expect(effectiveTime).toHaveTextContent(formatted)
    expect(effectiveTime).toHaveAttribute('dateTime', timestamp)
  })

  it('validates locally and preserves the effective value when saving fails', async () => {
    render(<ConfigurationWorkspace />)
    await screen.findByRole('heading', { name: 'Capacidad diaria de Eventos' })
    const rateInput = screen.getByTestId('configuration-input-pos_usd_mxn_rate')
    fireEvent.change(rateInput, { target: { value: '0' } })
    fireEvent.click(screen.getByTestId('configuration-setting-pos_usd_mxn_rate').querySelector('button[type="submit"]')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('entre 0.01 y 10,000')
    expect(api.set).not.toHaveBeenCalled()

    fireEvent.change(rateInput, { target: { value: '18' } })
    api.set.mockRejectedValueOnce(new Error('temporary failure'))
    fireEvent.click(screen.getByTestId('configuration-setting-pos_usd_mxn_rate').querySelector('button[type="submit"]')!)
    await waitFor(() => expect(api.set).toHaveBeenCalledOnce())
    expect(screen.getByText('17.25 MXN por USD')).toBeInTheDocument()
  })

  it('renders an unauthorized state without exposing configuration values', async () => {
    api.get.mockRejectedValueOnce(new Error('access denied'))
    render(<ConfigurationWorkspace />)
    const error = await screen.findByRole('alert')
    expect(error).toHaveClass('ops-state', 'ops-state-error')
    expect(error).toHaveTextContent('No tienes permisos')
    expect(screen.queryByText('17.25 MXN por USD')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('associates receipt logo errors with the file input', async () => {
    api.uploadReceipt.mockRejectedValueOnce(new Error('El logo no puede superar 2 MB.'))
    render(<ConfigurationWorkspace />)
    await screen.findByRole('heading', { name: 'Comprobante de venta' })

    const input = screen.getByTestId('sales-receipt-logo-input')
    fireEvent.change(input, { target: { files: [new File(['logo'], 'logo.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar comprobante' }))

    const error = await screen.findByRole('alert')
    expect(error).toHaveClass('ops-field-error')
    expect(error).toHaveAttribute('id', 'configuration-error-sales-receipt-logo')
    expect(input).toHaveAttribute('aria-describedby', expect.stringContaining(error.id))
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('validates receipt logo files immediately before saving', async () => {
    render(<ConfigurationWorkspace />)
    await screen.findByRole('heading', { name: 'Comprobante de venta' })

    const input = screen.getByTestId('sales-receipt-logo-input')
    expect(input).toHaveClass('sr-only')
    fireEvent.change(input, { target: { files: [new File(['svg'], 'logo.svg', { type: 'image/svg+xml' })] } })
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona una imagen JPEG, PNG o WebP.')
    expect(api.uploadReceipt).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })] } })
    expect(screen.getByRole('alert')).toHaveTextContent('El logo no puede superar 2 MB.')
  })

  it('previews, replaces, removes, and restores a receipt logo locally', async () => {
    api.getReceipt.mockResolvedValue({ logoUrl: 'https://storage.example.com/current.png', logoKey: 'receipts/current.png', companyPhone: null, companyEmail: null, showLogo: true, showBranch: true, showCashier: true, showCustomer: true, showPaymentMethod: true, showCompanyPhone: true, showCompanyEmail: true, showCustomerUrl: true, ownerId: 'admin-1', updatedAt: '2026-08-29T12:00:00.000Z' })
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => `blob:${(file as File).name}`)
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    render(<ConfigurationWorkspace />)
    await screen.findByRole('heading', { name: 'Comprobante de venta' })

    const input = screen.getByTestId('sales-receipt-logo-input')
    const firstFile = new File(['first'], 'first.png', { type: 'image/png' })
    const secondFile = new File(['second'], 'second.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [firstFile] } })
    expect(createObjectURL).toHaveBeenCalledWith(firstFile)
    expect(screen.getByAltText('Vista previa del logo del comprobante')).toHaveAttribute('src', 'blob:first.png')
    expect(screen.getByText('Lista para guardar: first.png')).toBeInTheDocument()

    fireEvent.change(input, { target: { files: [secondFile] } })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first.png')
    expect(screen.getByAltText('Vista previa del logo del comprobante')).toHaveAttribute('src', 'blob:second.png')
    fireEvent.click(screen.getByRole('button', { name: 'Quitar logo' }))
    expect(screen.queryByAltText('Vista previa del logo del comprobante')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restaurar logo actual' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar logo actual' }))
    expect(screen.getByAltText('Vista previa del logo del comprobante')).toHaveAttribute('src', 'https://storage.example.com/current.png')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second.png')
  })

  it('revokes a pending receipt logo preview when the workspace unmounts', async () => {
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pending.png')
    const { unmount } = render(<ConfigurationWorkspace />)
    await screen.findByRole('heading', { name: 'Comprobante de venta' })
    fireEvent.change(screen.getByTestId('sales-receipt-logo-input'), { target: { files: [new File(['pending'], 'pending.png', { type: 'image/png' })] } })
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pending.png')
  })

  it('updates the live receipt preview when visibility toggles change', async () => {
    render(<ConfigurationWorkspace />)
    await screen.findByRole('heading', { name: 'Comprobante de venta' })
    const preview = screen.getByTestId('sales-receipt-live-preview')
    expect(within(preview).getByTestId('ticket-logo-fallback')).toBeInTheDocument()
    expect(preview).toHaveTextContent('Sucursal Centro')
    expect(preview).toHaveTextContent('Ana López')
    expect(preview).toHaveTextContent('Cliente mostrador')
    expect(preview).toHaveTextContent('Forma de pago')

    fireEvent.click(screen.getByLabelText('Mostrar logo'))
    fireEvent.click(screen.getByLabelText('Mostrar sucursal'))
    fireEvent.click(screen.getByLabelText('Mostrar cajero'))
    fireEvent.click(screen.getByLabelText('Mostrar cliente'))
    fireEvent.click(screen.getByLabelText('Mostrar forma de pago'))

    expect(within(preview).queryByTestId('ticket-logo-fallback')).not.toBeInTheDocument()
    expect(within(preview).queryByText('Sucursal Centro')).not.toBeInTheDocument()
    expect(within(preview).queryByText('Ana López')).not.toBeInTheDocument()
    expect(within(preview).queryByText('Cliente mostrador')).not.toBeInTheDocument()
    expect(within(preview).queryByText('Forma de pago')).not.toBeInTheDocument()
  })

  it('shows the automatic customer origin, keeps its toggle visible, and excludes it from the saved draft', async () => {
    render(<ConfigurationWorkspace />)
    await screen.findByRole('heading', { name: 'Comprobante de venta' })

    fireEvent.change(screen.getByLabelText('Móvil de la empresa'), { target: { value: '+52 999 000 0000' } })
    fireEvent.change(screen.getByLabelText('Correo de la empresa'), { target: { value: 'hola@paletixa.example' } })

    expect(screen.getByLabelText('Móvil de la empresa')).toHaveAttribute('maxLength', '128')
    expect(screen.getByLabelText('Correo de la empresa')).toHaveAttribute('maxLength', '320')
    expect(screen.queryByTestId('sales-receipt-customer-url')).not.toBeInTheDocument()
    expect(screen.getByText('La URL para clientes se toma automáticamente del host actual de la aplicación; no es editable.')).toBeInTheDocument()

    const preview = screen.getByTestId('sales-receipt-live-preview')
    expect(preview).toHaveTextContent('+52 999 000 0000')
    expect(preview).toHaveTextContent('hola@paletixa.example')
    expect(preview).toHaveTextContent(window.location.origin)
    expect(within(preview).queryByRole('link')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Mostrar móvil de la empresa'))
    fireEvent.click(screen.getByLabelText('Mostrar correo de la empresa'))
    fireEvent.click(screen.getByLabelText('Mostrar URL para clientes'))
    expect(preview).not.toHaveTextContent('+52 999 000 0000')
    expect(preview).not.toHaveTextContent('hola@paletixa.example')
    expect(preview).not.toHaveTextContent(window.location.origin)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar comprobante' }))
    await waitFor(() => expect(api.setReceipt).toHaveBeenCalledOnce())
    const savedConfiguration = api.setReceipt.mock.calls[0][0].configuration
    expect(savedConfiguration).toMatchObject({ companyPhone: '+52 999 000 0000', companyEmail: 'hola@paletixa.example', showCompanyPhone: false, showCompanyEmail: false, showCustomerUrl: false })
    expect(savedConfiguration).not.toHaveProperty('customerUrl')
  })

  it('strips a legacy customer URL before writing configuration state to session persistence', async () => {
    const storageKey = createAdminSessionStorageKey({ userId: 'admin-1', branchId: null }, 'configuration')!
    sessionStorage.setItem(storageKey, JSON.stringify({
      namespace: 'paletixa:admin-session',
      version: 1,
      module: 'configuration',
      owner: { userId: 'admin-1', branchId: null },
      savedAt: Date.now(),
      state: {
        drafts: { event_daily_capacity: '7', pos_usd_mxn_rate: '17.25', pos_wholesale_threshold: '10' },
        reportTimezoneDraft: 'America/Cancun',
        receiptDraft: { companyPhone: '', companyEmail: '', customerUrl: 'https://legacy.example/clientes', showLogo: true, showBranch: true, showCashier: true, showCustomer: true, showPaymentMethod: true, showCompanyPhone: true, showCompanyEmail: true, showCustomerUrl: true },
        infoOpen: false,
      },
    }))

    render(<AdminSessionPersistenceProvider scope={{ userId: 'admin-1', branchId: null }}><ConfigurationWorkspace /></AdminSessionPersistenceProvider>)
    await screen.findByRole('heading', { name: 'Comprobante de venta' })

    await waitFor(() => {
      const persisted = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
      expect(persisted.state.receiptDraft).not.toHaveProperty('customerUrl')
    })
  })

  it('saves the selected whitelisted report timezone with loading feedback', async () => {
    render(<ConfigurationWorkspace />)
    await screen.findByRole('heading', { name: 'Zona horaria de reportes' })

    fireEvent.click(screen.getByRole('button', { name: 'Zona horaria aplicada' }))
    fireEvent.click(screen.getByRole('option', { name: 'Ciudad de México (America/Mexico_City)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar zona horaria' }))

    await waitFor(() => expect(api.setTimezone).toHaveBeenCalledOnce())
    expect(api.setTimezone).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'America/Mexico_City' }))
    expect(screen.getByText('Zona horaria actualizada correctamente.')).toBeInTheDocument()
  })

  it('shows a recoverable timezone save authorization error', async () => {
    api.setTimezone.mockRejectedValueOnce(new Error('access denied'))
    render(<ConfigurationWorkspace />)
    await screen.findByRole('heading', { name: 'Zona horaria de reportes' })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar zona horaria' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permisos para actualizar la zona horaria')
  })
})
