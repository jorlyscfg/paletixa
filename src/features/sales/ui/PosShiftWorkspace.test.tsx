import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import type { PosShift } from '../api/posShifts'
import { PosShiftWorkspace, type PosShiftHeaderState } from './PosShiftWorkspace'

const shiftApi = vi.hoisted(() => ({ getActivePosShift: vi.fn(), getPosDailySales: vi.fn(), openPosShift: vi.fn(), closePosShift: vi.fn() }))
const defaultLogout = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../api/posShifts', () => ({
  DEFAULT_POS_USD_MXN_RATE: 15,
  getActivePosShift: shiftApi.getActivePosShift,
  getPosDailySales: shiftApi.getPosDailySales,
  openPosShift: shiftApi.openPosShift,
  closePosShift: shiftApi.closePosShift,
}))
vi.mock('./SalesWorkspace', () => ({ SalesWorkspace: () => <div data-testid="sales-workspace" /> }))

function ShiftHeaderProbe({ onShiftClosed, onLogout = defaultLogout }: { onShiftClosed?: () => Promise<void>; onLogout?: () => Promise<void> }) {
  const [state, setState] = useState<PosShiftHeaderState | null>(null)
  return <>
    <PosShiftWorkspace branchId="branch-1" branchName="Central" onHeaderStateChange={setState} onShiftClosed={onShiftClosed} onLogout={onLogout} />
    {state && <div data-testid="shift-header-probe">
      {state.onOpenRequest && <button aria-label="Abrir turno" title="Abrir turno" onClick={state.onOpenRequest}><span data-icon="sale" /></button>}
      {state.onInfoRequest && <button aria-label="Ver control de caja" title="Ver control de caja" onClick={state.onInfoRequest}><span data-icon="info" /></button>}
      {state.onCloseRequest && <button aria-label="Cerrar y reconciliar turno" title="Cerrar y reconciliar turno" onClick={state.onCloseRequest}><span data-icon="close" /></button>}
      <span>{state.status === 'open' ? 'Abierto' : state.status === 'reconciled' ? 'Reconciliado' : 'Apertura requerida'}</span>
    </div>}
  </>
}

const shift: PosShift = {
  id: 'shift-1', cashierId: 'cashier-1', branchId: 'branch-1', branchName: 'Central', status: 'open', openingCashMxn: 500,
  usdMxnRate: 17.25, openedAt: '2026-08-21T10:00:00Z', closedAt: null, cashSalesMxn: 0, cashSalesUsd: 0, cardSalesMxn: 0,
  closingCashMxn: null, closingCashUsd: null, closingCardMxn: null, cashMxnDifference: null, cashUsdDifference: null, cardDifference: null,
}
const dailySales = [
  {
    id: 'sale-1', createdAt: '2026-08-22T10:15:00Z', totalMxn: 85, paymentMethod: 'cash' as const, paymentCurrency: 'mxn' as const,
    items: [{ name: 'Mango', category: 'Paletas', quantity: 2, unitTotalMxn: 42.5 }],
  },
  {
    id: 'sale-2', createdAt: '2026-08-22T11:20:00Z', totalMxn: 40, paymentMethod: 'card' as const, paymentCurrency: 'mxn' as const,
    items: [{ name: 'Strawberry', category: 'Creams', quantity: 1, unitTotalMxn: 40 }],
  },
]

describe('POS shift workspace', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    defaultLogout.mockReset()
    defaultLogout.mockResolvedValue(undefined)
    shiftApi.getActivePosShift.mockResolvedValue(null)
    shiftApi.getPosDailySales.mockResolvedValue([])
    shiftApi.openPosShift.mockResolvedValue(shift)
  })

  it('automatically blocks the cashier with the opening modal until the shift opens', async () => {
    render(<ShiftHeaderProbe />)
    const openingDialog = await screen.findByRole('dialog', { name: 'Apertura de turno' })
    expect(openingDialog.parentElement).toHaveClass('z-[60]')
    const openingForm = openingDialog.querySelector('form')
    const headerActions = openingDialog.querySelector<HTMLElement>('[data-modal-header-actions]')
    const openingButton = within(headerActions!).getByRole('button', { name: 'Abrir turno' })
    const openingCloseButton = within(headerActions!).getByRole('button', { name: 'Cerrar sesión' })
    const openingHelper = within(openingDialog).getByTestId('opening-shift-helper')
    const openingInputGrid = within(openingDialog).getByTestId('opening-shift-input-grid')
    expect(openingForm).not.toBeNull()
    expect(openingButton).toHaveAttribute('form', openingForm!.getAttribute('id'))
    expect(within(headerActions!).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Abrir turno', 'Cerrar sesión'])
    expect(openingDialog).toHaveFocus()
    expect(openingCloseButton).not.toHaveFocus()
    expect(openingDialog).not.toHaveAttribute('aria-describedby')
    expect(openingHelper).toHaveTextContent('El saldo inicial aplica únicamente al efectivo MXN. La tarjeta no tiene saldo de apertura y el tipo de cambio USD se conserva en este turno.')
    expect(openingHelper).toHaveClass('text-slate-300')
    expect(Boolean(openingInputGrid.compareDocumentPosition(openingHelper) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(screen.getByRole('heading', { name: 'Abre la caja para comenzar' })).toBeInTheDocument()
    expect((screen.getByRole('spinbutton', { name: 'Saldo inicial en efectivo MXN' }) as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('spinbutton', { name: 'Tipo de cambio USD/MXN' })).toHaveValue(15)
    expect(screen.queryByRole('spinbutton', { name: /tarjeta/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('sales-workspace')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Saldo inicial en efectivo MXN' }), { target: { value: '600' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Tipo de cambio USD/MXN' }), { target: { value: '17.25' } })
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Apertura de turno' })).getByRole('button', { name: 'Abrir turno' }))
    const salesWorkspace = await screen.findByTestId('sales-workspace')
    expect(salesWorkspace).toBeInTheDocument()
    expect(salesWorkspace.parentElement).toHaveClass('flex', 'h-full', 'min-h-0', 'flex-1', 'flex-col', 'overflow-hidden')
    expect(shiftApi.openPosShift).toHaveBeenCalledWith({ initialCashMxn: 600, usdMxnRate: 17.25 })
  })

  it('keeps the opening modal open for validation errors and API failures', async () => {
    render(<ShiftHeaderProbe />)
    const dialog = await screen.findByRole('dialog', { name: 'Apertura de turno' })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Saldo inicial en efectivo MXN' }), { target: { value: '-1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abrir turno' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no negativo')
    expect(screen.getByRole('dialog', { name: 'Apertura de turno' })).toBe(dialog)
    expect(shiftApi.openPosShift).not.toHaveBeenCalled()

    shiftApi.openPosShift.mockRejectedValueOnce(new Error('No se pudo abrir el turno por un conflicto.'))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Saldo inicial en efectivo MXN' }), { target: { value: '500' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abrir turno' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir el turno por un conflicto.')
    expect(screen.getByRole('dialog', { name: 'Apertura de turno' })).toBeInTheDocument()
    expect(screen.queryByTestId('sales-workspace')).not.toBeInTheDocument()
  })

  it('keeps logout enabled in the opening modal while blocking accidental overlay dismissal', async () => {
    const onLogout = vi.fn().mockResolvedValue(undefined)
    render(<ShiftHeaderProbe onLogout={onLogout} />)
    const dialog = await screen.findByRole('dialog', { name: 'Apertura de turno' })
    const closeButton = screen.getByRole('button', { name: 'Cerrar sesión' })
    expect(closeButton).toBeEnabled()
    fireEvent.click(dialog.parentElement!)
    expect(onLogout).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Apertura de turno' })).toBeInTheDocument()
    fireEvent.click(closeButton)
    expect(onLogout).toHaveBeenCalledOnce()

    cleanup()
    onLogout.mockClear()
    render(<ShiftHeaderProbe onLogout={onLogout} />)
    await screen.findByRole('dialog', { name: 'Apertura de turno' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('exposes the required opening action through the header state', async () => {
    render(<ShiftHeaderProbe />)
    const headerProbe = await screen.findByTestId('shift-header-probe')
    const openButton = within(headerProbe).getByRole('button', { name: 'Abrir turno' })
    expect(within(headerProbe).getByText('Apertura requerida')).toBeInTheDocument()
    fireEvent.click(openButton)
    expect(screen.getByRole('dialog', { name: 'Apertura de turno' })).toBeInTheDocument()
  })

  it('opens the reconciliation form in a modal, wires its header action, and shows the closed result', async () => {
    const activeShift = { ...shift, cashSalesMxn: 100, cashSalesUsd: 2, cardSalesMxn: 50 }
    const closedShift: PosShift = {
      ...activeShift,
      status: 'closed',
      closedAt: '2026-08-21T18:00:00Z',
      closingCashMxn: 620,
      closingCashUsd: 2,
      closingCardMxn: 50,
      cashMxnDifference: 20,
      cashUsdDifference: 0,
      cardDifference: 0,
    }
    shiftApi.getActivePosShift.mockResolvedValue(activeShift)
    shiftApi.closePosShift.mockResolvedValue(closedShift)
    const onShiftClosed = vi.fn().mockResolvedValue(undefined)
    render(<ShiftHeaderProbe onShiftClosed={onShiftClosed} />)

    const infoButton = await screen.findByRole('button', { name: 'Ver control de caja' })
    expect(infoButton).not.toHaveTextContent('Ver control de caja')
    expect(infoButton).toHaveAttribute('aria-label', 'Ver control de caja')
    expect(infoButton).toHaveAttribute('title', 'Ver control de caja')
    expect(infoButton.querySelector('[data-icon="info"]')).toBeInTheDocument()
    const openButton = screen.getByRole('button', { name: 'Cerrar y reconciliar turno' })
    expect(openButton).not.toHaveTextContent('Cerrar')
    expect(openButton).toHaveAttribute('title', 'Cerrar y reconciliar turno')
    fireEvent.click(screen.getByRole('button', { name: 'Ver control de caja' }))
    expect(screen.getByRole('dialog', { name: 'Control de caja' })).toHaveTextContent('Efectivo MXN')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar control de caja' }))
    fireEvent.click(openButton)
    const reconciliationDialog = screen.getByRole('dialog', { name: 'Cerrar Turno' })
    const closingForm = reconciliationDialog.querySelector('form')
    const closingHeaderActions = reconciliationDialog.querySelector<HTMLElement>('[data-modal-header-actions]')
    const closingButton = within(closingHeaderActions!).getByRole('button', { name: 'Cerrar turno' })
    const closingInputGrid = within(reconciliationDialog).getByTestId('closing-shift-input-grid')
    expect(reconciliationDialog).toBeInTheDocument()
    expect(closingForm).not.toBeNull()
    expect(closingButton).toHaveAttribute('form', closingForm!.getAttribute('id'))
    expect(within(closingForm!).queryByRole('button', { name: 'Cerrar turno' })).not.toBeInTheDocument()
    expect(reconciliationDialog).not.toHaveTextContent('Captura cada saldo por separado. Las ventas permanecen contabilizadas en MXN.')
    expect(reconciliationDialog).not.toHaveAttribute('aria-describedby')
    expect(closingInputGrid).toHaveClass('grid', 'gap-4')
    expect(closingInputGrid).not.toHaveClass('sm:grid-cols-3')
    expect(screen.getByRole('spinbutton', { name: 'Efectivo MXN al cierre' })).toHaveValue(600)
    expect(screen.getByRole('spinbutton', { name: 'Efectivo USD al cierre' })).toHaveValue(2)
    expect(screen.getByRole('spinbutton', { name: 'Tarjeta MXN al cierre' })).toHaveValue(50)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Efectivo MXN al cierre' }), { target: { value: '620' } })
    fireEvent.click(closingButton)
    expect(await screen.findByText('Reconciliado')).toBeInTheDocument()
    expect(screen.getByText('Reconciliado')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Cerrar Turno' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver control de caja' }))
    expect(screen.getByRole('dialog', { name: 'Control de caja' })).toHaveTextContent('Diferencia efectivo MXN')
    expect(shiftApi.closePosShift).toHaveBeenCalledWith({ shiftId: 'shift-1', closingCashMxn: 620, closingCashUsd: 2, closingCardMxn: 50 })
    expect(onShiftClosed).toHaveBeenCalledOnce()
  })

  it('exposes active and reconciled controls through the header callback without an inline shift summary', async () => {
    shiftApi.getActivePosShift.mockResolvedValue(shift)
    const headerState = vi.fn()
    render(<PosShiftWorkspace branchId="branch-1" branchName="Central" onHeaderStateChange={headerState} onLogout={defaultLogout} />)

    expect(await screen.findByTestId('sales-workspace')).toBeInTheDocument()
    const openHeaderState = headerState.mock.calls
      .map(([state]) => state as PosShiftHeaderState | null)
      .find((state) => state?.status === 'open')
    expect(openHeaderState).toEqual(expect.objectContaining({ status: 'open', onInfoRequest: expect.any(Function), onCloseRequest: expect.any(Function) }))
    expect(screen.queryByText('Turno activo')).not.toBeInTheDocument()
    expect(screen.queryByText('Control de caja')).not.toBeInTheDocument()

    openHeaderState?.onInfoRequest?.()
    const controlDialog = await screen.findByRole('dialog', { name: 'Control de caja' })
    expect(controlDialog.parentElement).toHaveClass('z-50')
  })

  it('fetches fresh daily sales each time the cash-control modal opens and shows read-only details', async () => {
    shiftApi.getActivePosShift.mockResolvedValue(shift)
    shiftApi.getPosDailySales.mockResolvedValue(dailySales)
    render(<ShiftHeaderProbe />)

    const infoButton = await screen.findByRole('button', { name: 'Ver control de caja' })
    fireEvent.click(infoButton)
     const dialog = await screen.findByRole('dialog', { name: 'Control de caja' })
     expect(await within(dialog).findByText('Total de ventas del día')).toBeInTheDocument()
     const metrics = dialog.querySelector('dl')
     expect(metrics).toHaveClass('grid-cols-3', 'gap-2')
     expect(metrics?.children).toHaveLength(3)
     const dailySalesList = within(dialog).getByRole('list', { name: 'Lista de ventas del día' })
     expect(dailySalesList).toHaveClass('max-h-[min(40vh,24rem)]', 'overflow-y-auto', 'overscroll-contain', 'pr-2')
     const modalBody = dialog.querySelector('.min-h-0.flex-1')
     expect(modalBody).toHaveClass('overflow-hidden')
     expect(modalBody).not.toHaveClass('overflow-y-auto')
     expect(dialog).toHaveTextContent('$125.00 MXN')
    expect(dialog).toHaveTextContent('Cantidad de ventas')
    expect(dialog).toHaveTextContent('Pago: Efectivo · MXN')
    expect(dialog).toHaveTextContent('Mango')
    expect(dialog).toHaveTextContent('Paletas · 2 unidades')
    expect(dialog.querySelectorAll('input, select, textarea')).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar control de caja' }))
    fireEvent.click(infoButton)
    await screen.findByText('Total de ventas del día')
    expect(shiftApi.getPosDailySales).toHaveBeenCalledTimes(2)
  })

  it('reports loading, error, and empty daily-sales states accessibly', async () => {
    const resolvers: Array<(sales: typeof dailySales) => void> = []
    shiftApi.getActivePosShift.mockResolvedValue(shift)
    shiftApi.getPosDailySales.mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve) }))
    render(<ShiftHeaderProbe />)
    const infoButton = await screen.findByRole('button', { name: 'Ver control de caja' })
    fireEvent.click(infoButton)
    expect(await screen.findByRole('status')).toHaveTextContent('Cargando ventas del día')
    resolvers.forEach((resolve) => resolve([]))
    expect(await screen.findByText('No hay ventas registradas hoy en esta sucursal.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar control de caja' }))
    shiftApi.getPosDailySales.mockRejectedValueOnce(new Error('network'))
    fireEvent.click(infoButton)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las ventas del día.')
  })

  it('prevents overlay dismissal while idle, but keeps Escape and cancel available', async () => {
    shiftApi.getActivePosShift.mockResolvedValue(shift)
    render(<ShiftHeaderProbe />)
    const openButton = await screen.findByRole('button', { name: 'Cerrar y reconciliar turno' })
    openButton.focus()
    fireEvent.click(openButton)
    const dialog = screen.getByRole('dialog', { name: 'Cerrar Turno' })
    fireEvent.click(dialog.parentElement!)
    expect(screen.getByRole('dialog', { name: 'Cerrar Turno' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Cerrar Turno' })).not.toBeInTheDocument()
    expect(openButton).toHaveFocus()

    fireEvent.click(openButton)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar cierre' }))
    expect(screen.queryByRole('dialog', { name: 'Cerrar Turno' })).not.toBeInTheDocument()
  })

  it('keeps the reconciliation modal open and reports non-negative validation errors', async () => {
    shiftApi.getActivePosShift.mockResolvedValue(shift)
    render(<ShiftHeaderProbe />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar y reconciliar turno' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Efectivo MXN al cierre' }), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar turno' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no negativo')
    expect(screen.getByRole('dialog', { name: 'Cerrar Turno' })).toBeInTheDocument()
    expect(shiftApi.closePosShift).not.toHaveBeenCalled()
  })
})
