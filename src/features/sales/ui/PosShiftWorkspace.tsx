import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Modal } from '../../../app/components/Modal'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { isSessionBoolean, isSessionRecord, isSessionString, useAdminSessionPersistence } from '../../../app/sessionPersistence'
import { closePosShift, DEFAULT_POS_USD_MXN_RATE, getActivePosShift, getPosDailySales, openPosShift, type PosDailySale, type PosShift } from '../api/posShifts'
import { SalesWorkspace } from './SalesWorkspace'

type PosShiftWorkspaceProps = {
  branchId: string
  branchName: string
  cashierName?: string | null
  onHeaderStateChange?: (state: PosShiftHeaderState | null) => void
  onShiftClosed?: () => Promise<void>
  onLogout: () => Promise<void>
}

export type PosShiftHeaderState = {
  status: 'open' | 'reconciled' | 'opening'
  onInfoRequest?: () => void
  onOpenRequest?: () => void
  onCloseRequest?: () => void
}

type PosShiftSessionState = {
  openingCash: string
  usdRate: string
  closingCashMxn: string
  closingCashUsd: string
  closingCardMxn: string
  openingModalOpen: boolean
  closeModalOpen: boolean
  cashControlModalOpen: boolean
}

function isPosShiftSessionState(value: unknown): value is PosShiftSessionState {
  return isSessionRecord(value) && isSessionString(value.openingCash) && isSessionString(value.usdRate) && isSessionString(value.closingCashMxn) && isSessionString(value.closingCashUsd) && isSessionString(value.closingCardMxn) && isSessionBoolean(value.openingModalOpen) && isSessionBoolean(value.closeModalOpen) && isSessionBoolean(value.cashControlModalOpen)
}

function formatMxn(value: number) {
  return `$${value.toFixed(2)} MXN`
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)} USD`
}

function numberField(value: string, label: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} debe ser un número no negativo.`)
  return Math.round(parsed * 100) / 100
}

function formatSaleDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function formatSalePayment(sale: PosDailySale) {
  const method = sale.paymentMethod === 'cash' ? 'Efectivo' : sale.paymentMethod === 'card' ? 'Tarjeta' : 'No disponible'
  const currency = sale.paymentCurrency === 'usd' ? 'USD' : 'MXN'
  return `${method} · ${currency}`
}

function ShiftControlMetrics({ shift, closed }: { shift: PosShift; closed: boolean }) {
  return <>
    <dl className="grid grid-cols-3 gap-2 sm:gap-3">
      <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950 p-2 sm:p-3"><dt className="break-words text-[10px] leading-tight text-slate-500 sm:text-xs">Efectivo MXN</dt><dd className="mt-1 break-words text-xs font-black leading-tight text-white sm:text-sm">{formatMxn(shift.cashSalesMxn)}</dd><dd className="mt-1 break-words text-[10px] leading-tight text-slate-500 sm:text-[11px]">Ventas del turno{closed && shift.closingCashMxn !== null ? ` · cierre ${formatMxn(shift.closingCashMxn)}` : ''}</dd></div>
      <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950 p-2 sm:p-3"><dt className="break-words text-[10px] leading-tight text-slate-500 sm:text-xs">Efectivo USD</dt><dd className="mt-1 break-words text-xs font-black leading-tight text-white sm:text-sm">{formatUsd(shift.cashSalesUsd)}</dd><dd className="mt-1 break-words text-[10px] leading-tight text-slate-500 sm:text-[11px]">Pagos USD{closed && shift.closingCashUsd !== null ? ` · cierre ${formatUsd(shift.closingCashUsd)}` : ''}</dd></div>
      <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950 p-2 sm:p-3"><dt className="break-words text-[10px] leading-tight text-slate-500 sm:text-xs">Tarjeta</dt><dd className="mt-1 break-words text-xs font-black leading-tight text-white sm:text-sm">{formatMxn(shift.cardSalesMxn)}</dd><dd className="mt-1 break-words text-[10px] leading-tight text-slate-500 sm:text-[11px]">Ventas MXN{closed && shift.closingCardMxn !== null ? ` · cierre ${formatMxn(shift.closingCardMxn)}` : ''}</dd></div>
    </dl>
    {closed && <dl className="mt-4 grid gap-2 border-t border-slate-800 pt-4 text-xs sm:grid-cols-3">
      <div className="min-w-0"><dt className="break-words text-slate-500">Diferencia efectivo MXN</dt><dd className="mt-1 break-words font-bold text-slate-200">{formatMxn(shift.cashMxnDifference ?? 0)}</dd></div>
      <div className="min-w-0"><dt className="break-words text-slate-500">Diferencia efectivo USD</dt><dd className="mt-1 break-words font-bold text-slate-200">{formatUsd(shift.cashUsdDifference ?? 0)}</dd></div>
      <div className="min-w-0"><dt className="break-words text-slate-500">Diferencia tarjeta</dt><dd className="mt-1 break-words font-bold text-slate-200">{formatMxn(shift.cardDifference ?? 0)}</dd></div>
    </dl>}
  </>
}

function DailySalesViewer({ sales, state, error, onRetry }: { sales: PosDailySale[]; state: 'loading' | 'ready' | 'error'; error: string; onRetry: () => void }) {
  const dailyTotal = sales.reduce((total, sale) => total + sale.totalMxn, 0)

  return <section aria-labelledby="pos-daily-sales-title" className="mt-4 border-t border-slate-800 pt-4">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 id="pos-daily-sales-title" className="text-sm font-black text-white">Ventas de hoy</h3>
        <p className="mt-1 text-xs text-slate-500">Consulta de solo lectura actualizada al abrir este control.</p>
      </div>
      {state === 'ready' && <span className="text-xs font-semibold text-slate-500">{sales.length} {sales.length === 1 ? 'venta' : 'ventas'}</span>}
    </div>

    {state === 'loading' && <p role="status" aria-live="polite" className="ops-state ops-state-loading mt-3 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">Cargando ventas del día…</p>}
    {state === 'error' && <div role="alert" className="ops-state ops-state-error mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100"><p>{error}</p><ResponsiveActionButton type="button" label="Reintentar ventas del día" icon="refresh" showLabel onClick={onRetry} className="mt-3" /></div>}
    {state === 'ready' && <>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><dt className="text-xs text-slate-500">Total de ventas del día</dt><dd className="mt-1 text-lg font-black text-white">{formatMxn(dailyTotal)}</dd></div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><dt className="text-xs text-slate-500">Cantidad de ventas</dt><dd className="mt-1 text-lg font-black text-white">{sales.length}</dd></div>
      </dl>
      {sales.length === 0 ? <p role="status" className="ops-state ops-state-empty mt-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">No hay ventas registradas hoy en esta sucursal.</p> : <ul aria-label="Lista de ventas del día" className="mt-3 grid max-h-[min(40vh,24rem)] gap-3 overflow-y-auto overscroll-contain pr-2 sm:max-h-[min(45vh,28rem)] sm:pr-3">
        {sales.map((sale) => <li key={sale.id} data-testid="pos-daily-sale" className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs text-slate-500">Hora</p><time dateTime={sale.createdAt} className="mt-1 block text-sm font-semibold text-slate-200">{formatSaleDate(sale.createdAt)}</time></div>
            <div className="text-right"><p className="text-xs text-slate-500">Total</p><p className="mt-1 text-sm font-black text-white">{formatMxn(sale.totalMxn)}</p></div>
          </div>
          <p className="mt-3 text-xs font-semibold text-cyan-300">Pago: {formatSalePayment(sale)}</p>
          <ul aria-label={`Partidas de la venta ${sale.id}`} className="mt-3 divide-y divide-slate-800 border-t border-slate-800 text-xs">
            {sale.items.map((item, index) => <li key={`${sale.id}-${item.name}-${index}`} className="flex items-start justify-between gap-3 py-2"><span className="min-w-0"><span className="block font-semibold text-slate-200">{item.name}</span><span className="block text-slate-500">{item.category ?? 'Sin categoría'} · {item.quantity} {item.quantity === 1 ? 'unidad' : 'unidades'}</span></span><span className="shrink-0 font-semibold text-slate-300">{formatMxn(item.unitTotalMxn)} / unidad</span></li>)}
          </ul>
        </li>)}
      </ul>}
    </>}
  </section>
}

function ShiftControlModal({ shift, closed, onClose, dailySales, dailySalesState, dailySalesError, onRetryDailySales }: { shift: PosShift; closed: boolean; onClose: () => void; dailySales: PosDailySale[]; dailySalesState: 'loading' | 'ready' | 'error'; dailySalesError: string; onRetryDailySales: () => void }) {
  return <Modal
    title="Control de caja"
    description={closed ? 'Resumen informativo del turno reconciliado.' : 'Resumen informativo de las ventas y saldos del turno activo.'}
    closeLabel="Cerrar control de caja"
    onClose={onClose}
    maxWidthClassName="max-w-2xl"
    bodyOverflowClassName="overflow-hidden"
    bodyClassName="p-4 sm:p-5"
  >
    <p className="mb-4 text-xs font-semibold text-slate-500">Tipo de cambio de referencia: <span className="text-slate-300">{formatMxn(shift.usdMxnRate)} por USD</span></p>
    <ShiftControlMetrics shift={shift} closed={closed} />
    <DailySalesViewer sales={dailySales} state={dailySalesState} error={dailySalesError} onRetry={onRetryDailySales} />
  </Modal>
}

export function PosShiftWorkspace({ branchId, branchName, cashierName, onHeaderStateChange, onShiftClosed, onLogout }: PosShiftWorkspaceProps) {
  const persistence = useAdminSessionPersistence()
  const sessionModule = 'pos-shift'
  const [restoredSession] = useState<PosShiftSessionState>(() => persistence?.read(sessionModule, isPosShiftSessionState) ?? {
    openingCash: '',
    usdRate: String(DEFAULT_POS_USD_MXN_RATE),
    closingCashMxn: '0',
    closingCashUsd: '0',
    closingCardMxn: '0',
    openingModalOpen: false,
    closeModalOpen: false,
    cashControlModalOpen: false,
  })
  const [shift, setShift] = useState<PosShift | null>(null)
  const [closedShift, setClosedShift] = useState<PosShift | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [openingCash, setOpeningCash] = useState(restoredSession.openingCash)
  const [usdRate, setUsdRate] = useState(restoredSession.usdRate)
  const [closingCashMxn, setClosingCashMxn] = useState(restoredSession.closingCashMxn)
  const [closingCashUsd, setClosingCashUsd] = useState(restoredSession.closingCashUsd)
  const [closingCardMxn, setClosingCardMxn] = useState(restoredSession.closingCardMxn)
  const [openingModalOpen, setOpeningModalOpen] = useState(restoredSession.openingModalOpen)
  const [closeModalOpen, setCloseModalOpen] = useState(restoredSession.closeModalOpen)
  const [cashControlModalOpen, setCashControlModalOpen] = useState(restoredSession.cashControlModalOpen)
  const [dailySales, setDailySales] = useState<PosDailySale[]>([])
  const [dailySalesState, setDailySalesState] = useState<'loading' | 'ready' | 'error'>('ready')
  const [dailySalesError, setDailySalesError] = useState('')
  const dailySalesRequest = useRef(0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const openingFormId = useId()
  const closingFormId = useId()

  const load = useCallback(async () => {
    setLoadState('loading')
    setError('')
    try {
      const active = await getActivePosShift()
      setShift(active)
      setOpeningModalOpen(!active)
      if (active) {
        setCloseModalOpen(restoredSession.closeModalOpen)
        if (!restoredSession.closeModalOpen) {
          setClosingCashMxn((active.openingCashMxn + active.cashSalesMxn).toFixed(2))
          setClosingCashUsd(active.cashSalesUsd.toFixed(2))
          setClosingCardMxn(active.cardSalesMxn.toFixed(2))
        }
        setCashControlModalOpen(restoredSession.cashControlModalOpen)
      } else {
        setCloseModalOpen(false)
        setCashControlModalOpen(false)
      }
      setLoadState('ready')
    } catch {
      setLoadState('error')
      setError('No se pudo cargar el turno de caja.')
    }
  }, [restoredSession])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])

  useEffect(() => {
    persistence?.write(sessionModule, { openingCash, usdRate, closingCashMxn, closingCashUsd, closingCardMxn, openingModalOpen, closeModalOpen, cashControlModalOpen })
  }, [cashControlModalOpen, closeModalOpen, closingCardMxn, closingCashMxn, closingCashUsd, openingCash, openingModalOpen, persistence, sessionModule, usdRate])

  const loadDailySales = useCallback(async () => {
    const request = ++dailySalesRequest.current
    setDailySales([])
    setDailySalesState('loading')
    setDailySalesError('')
    try {
      const next = await getPosDailySales()
      if (request !== dailySalesRequest.current) return
      setDailySales(next)
      setDailySalesState('ready')
    } catch {
      if (request !== dailySalesRequest.current) return
      setDailySalesState('error')
      setDailySalesError('No se pudieron cargar las ventas del día.')
    }
  }, [])

  useEffect(() => {
    if (cashControlModalOpen) queueMicrotask(() => void loadDailySales())
  }, [cashControlModalOpen, loadDailySales])

  const openCashControl = useCallback(() => {
    setDailySales([])
    setDailySalesState('loading')
    setDailySalesError('')
    setCashControlModalOpen(true)
  }, [])

  const requestCloseShift = useCallback(() => {
    setError('')
    setCloseModalOpen(true)
  }, [])

  const requestOpenShift = useCallback(() => {
    setError('')
    setOpeningModalOpen(true)
  }, [])

  useEffect(() => {
    if (loadState !== 'ready') {
      onHeaderStateChange?.(null)
    } else if (shift) {
      onHeaderStateChange?.({ status: 'open', onInfoRequest: openCashControl, onCloseRequest: requestCloseShift })
    } else if (closedShift) {
      onHeaderStateChange?.({ status: 'reconciled', onInfoRequest: openCashControl, onOpenRequest: requestOpenShift })
    } else {
      onHeaderStateChange?.({ status: 'opening', onOpenRequest: requestOpenShift })
    }
  }, [closedShift, loadState, onHeaderStateChange, openCashControl, requestCloseShift, requestOpenShift, shift])

  useEffect(() => () => onHeaderStateChange?.(null), [onHeaderStateChange])

  async function openShift() {
    setSubmitting(true)
    setError('')
    try {
      const next = await openPosShift({ initialCashMxn: numberField(openingCash, 'El saldo inicial'), usdMxnRate: numberField(usdRate, 'El tipo de cambio') })
      setShift(next)
      setClosedShift(null)
      setOpeningModalOpen(false)
      setClosingCashMxn(next.openingCashMxn.toFixed(2))
      setClosingCashUsd('0.00')
      setClosingCardMxn('0.00')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir el turno.')
    } finally {
      setSubmitting(false)
    }
  }

  const logoutFromOpening = useCallback(() => { void onLogout() }, [onLogout])

  async function closeShift() {
    if (!shift) return
    setSubmitting(true)
    setError('')
    try {
      const closed = await closePosShift({
        shiftId: shift.id,
        closingCashMxn: numberField(closingCashMxn, 'El cierre de efectivo MXN'),
        closingCashUsd: numberField(closingCashUsd, 'El cierre de efectivo USD'),
        closingCardMxn: numberField(closingCardMxn, 'El cierre de tarjeta'),
      })
      setClosedShift(closed)
      setShift(null)
      setCloseModalOpen(false)
      await onShiftClosed?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cerrar el turno.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadState === 'loading') return <section role="status" className="ops-workspace-frame flex h-full min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm text-slate-300 lg:overflow-hidden"><p className="ops-state ops-state-loading">Cargando turno de caja…</p></section>
  if (loadState === 'error') return <section ref={(node) => node?.focus()} tabIndex={-1} role="alert" className="ops-workspace-frame ops-state ops-state-error flex h-full min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-100 lg:overflow-hidden"><p className="font-semibold">{error}</p><ResponsiveActionButton label="Reintentar" icon="refresh" className="mt-4" onClick={() => void load()} /></section>

  if (!shift) return <div data-branch-id={branchId} className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    {openingModalOpen && <Modal
      title="Apertura de turno"
      closeLabel="Cerrar sesión"
      onClose={logoutFromOpening}
      busy={submitting}
      closeOnOverlayClick={false}
      autoFocusCloseButton={false}
      headerActions={<ResponsiveActionButton form={openingFormId} type="submit" label="Abrir turno" icon="sale" showLabel loading={submitting} loadingLabel="Abriendo turno…" />}
      maxWidthClassName="max-w-2xl"
      bodyClassName="p-4 sm:p-6"
      zIndexClassName="z-[60]"
    >
      <form id={openingFormId} noValidate onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void openShift() }} className="grid gap-4">
        <h3 className="text-xl font-black text-white">Abre la caja para comenzar</h3>
        <div data-testid="opening-shift-input-grid" className="grid gap-4 sm:grid-cols-2">
           <label className="ops-field-label grid gap-2 text-xs font-bold text-slate-300">Saldo inicial en efectivo MXN<input className="ops-control px-3" type="number" min="0" step="0.01" inputMode="decimal" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} /></label>
           <label className="ops-field-label grid gap-2 text-xs font-bold text-slate-300">Tipo de cambio USD/MXN<input className="ops-control px-3" type="number" min="0.0001" step="0.0001" inputMode="decimal" value={usdRate} onChange={(event) => setUsdRate(event.target.value)} /></label>
        </div>
        <p data-testid="opening-shift-helper" className="text-sm leading-relaxed text-slate-300">El saldo inicial aplica únicamente al efectivo MXN. La tarjeta no tiene saldo de apertura y el tipo de cambio USD se conserva en este turno.</p>
        {error && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{error}</p>}
      </form>
    </Modal>}
    {cashControlModalOpen && closedShift && <ShiftControlModal shift={closedShift} closed onClose={() => setCashControlModalOpen(false)} dailySales={dailySales} dailySalesState={dailySalesState} dailySalesError={dailySalesError} onRetryDailySales={() => void loadDailySales()} />}
  </div>

  return <div data-branch-id={branchId} className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    {closeModalOpen && <Modal
      title="Cerrar Turno"
      closeLabel="Cancelar cierre"
      onClose={() => { setCloseModalOpen(false); setError('') }}
      busy={submitting}
      closeDisabled={submitting}
      closeOnOverlayClick={false}
      headerActions={<ResponsiveActionButton form={closingFormId} type="submit" label="Cerrar turno" icon="close" showLabel loading={submitting} loadingLabel="Cerrando turno…" />}
      maxWidthClassName="max-w-2xl"
      bodyClassName="p-4 sm:p-6"
    >
      <form id={closingFormId} noValidate onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void closeShift() }} className="grid gap-4">
        <p className="text-xs font-semibold text-slate-500">Apertura: <span className="text-slate-300">{formatMxn(shift.openingCashMxn)}</span></p>
        <div data-testid="closing-shift-input-grid" className="grid gap-4">
           <label className="ops-field-label grid gap-2 text-xs font-bold text-slate-300">Efectivo MXN al cierre<input className="ops-control px-3" type="number" min="0" step="0.01" inputMode="decimal" value={closingCashMxn} onChange={(event) => setClosingCashMxn(event.target.value)} aria-invalid={Boolean(error)} /></label>
           <label className="ops-field-label grid gap-2 text-xs font-bold text-slate-300">Efectivo USD al cierre<input className="ops-control px-3" type="number" min="0" step="0.01" inputMode="decimal" value={closingCashUsd} onChange={(event) => setClosingCashUsd(event.target.value)} aria-invalid={Boolean(error)} /></label>
           <label className="ops-field-label grid gap-2 text-xs font-bold text-slate-300">Tarjeta MXN al cierre<input className="ops-control px-3" type="number" min="0" step="0.01" inputMode="decimal" value={closingCardMxn} onChange={(event) => setClosingCardMxn(event.target.value)} aria-invalid={Boolean(error)} /></label>
        </div>
         {error && <p role="alert" className="ops-state ops-state-error">{error}</p>}
      </form>
    </Modal>}
    {cashControlModalOpen && <ShiftControlModal shift={shift} closed={false} onClose={() => setCashControlModalOpen(false)} dailySales={dailySales} dailySalesState={dailySalesState} dailySalesError={dailySalesError} onRetryDailySales={() => void loadDailySales()} />}
    <SalesWorkspace channel="pos" branchName={branchName} cashierName={cashierName} activeShift={shift} />
  </div>
}
