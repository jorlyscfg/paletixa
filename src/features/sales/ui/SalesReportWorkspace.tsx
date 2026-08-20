import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CustomDatePicker } from '../../../app/components/CustomDatePicker'
import { InfoButton } from '../../../app/components/InfoButton'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { getSalesByChannel, getSalesReportDetail, SALES_CHANNELS, type SalesChannel, type SalesChannelTotal, type SalesReportDetail, type SalesReportRange } from '../api/sales'
import { rankSalesProducts } from './salesReportUtils'

type DateFields = { from: string; to: string }
type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const channelLabels: Record<SalesChannel, string> = { pos: 'Punto de venta', wholesale: 'Mayoristas', event: 'Eventos' }
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_REPORT_DAYS = 366

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getDefaultDateRange(): DateFields {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 6)
  return { from: dateInputValue(from), to: dateInputValue(to) }
}

const DEFAULT_DATE_RANGE = getDefaultDateRange()

const channelDescriptions: Record<SalesChannel, string> = {
  pos: 'Ventas de mostrador',
  wholesale: 'Ventas por volumen',
  event: 'Ventas para eventos',
}

function dateAtUtc(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() : null
}

function validateDateRange({ from, to }: DateFields) {
  if (!from || !to) return 'Selecciona una fecha inicial y una fecha final.'
  const start = dateAtUtc(from)
  const end = dateAtUtc(to)
  if (start === null || end === null) return 'Ingresa fechas inicial y final válidas.'
  if (end < start) return 'La fecha inicial debe ser anterior o igual a la fecha final.'
  if (end - start >= MAX_REPORT_DAYS * DAY_MS) return 'Selecciona un rango de 366 días o menos.'
  return ''
}

function toApiRange(fields: DateFields): SalesReportRange {
  const end = dateAtUtc(fields.to)
  if (end === null) throw new Error('Report date range is invalid')
  return { from: `${fields.from}T00:00:00.000Z`, to: new Date(end + DAY_MS).toISOString() }
}

function normalizeTotals(rows: SalesChannelTotal[]) {
  return SALES_CHANNELS.map((channel) => rows.find((row) => row.channel === channel) ?? { channel, saleCount: 0, totalMxn: 0 })
}

function formatMxn(value: number) {
  return `$${value.toFixed(2)} MXN`
}

function formatSaleDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function detailKey(row: SalesReportDetail, index: number) {
  return `${row.saleId}-${row.productName}-${index}`
}

export function SalesReportWorkspace() {
  const [dates, setDates] = useState<DateFields>(DEFAULT_DATE_RANGE)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [totals, setTotals] = useState<SalesChannelTotal[]>([])
  const [details, setDetails] = useState<SalesReportDetail[]>([])
  const [validationError, setValidationError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [scopeInfoOpen, setScopeInfoOpen] = useState(false)
  const sequence = useRef(0)
  const alert = useRef<HTMLDivElement>(null)
  const lastRange = useRef<SalesReportRange>(toApiRange(DEFAULT_DATE_RANGE))

  const load = useCallback(async (range: SalesReportRange) => {
    const current = ++sequence.current
    lastRange.current = range
    setLoadState('loading')
    setLoadError('')
    setTotals([])
    setDetails([])
    try {
      const [nextTotals, nextDetails] = await Promise.all([getSalesByChannel(range), getSalesReportDetail(range)])
      if (current === sequence.current) {
        setTotals(normalizeTotals(nextTotals))
        setDetails(nextDetails)
        setLoadState('ready')
      }
    } catch {
      if (current === sequence.current) {
        setLoadState('error')
        setLoadError('No se pudo cargar el reporte de ventas.')
      }
    }
  }, [])

  useEffect(() => { queueMicrotask(() => void load(toApiRange(DEFAULT_DATE_RANGE))) }, [load])
  useEffect(() => { if (validationError || loadState === 'error') alert.current?.focus() }, [validationError, loadState])

  function updateDate(field: keyof DateFields, value: string) {
    setDates((current) => ({ ...current, [field]: value }))
    setValidationError('')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = validateDateRange(dates)
    if (message) {
      setValidationError(message)
      setLoadError('')
      setLoadState(totals.length > 0 ? 'ready' : 'idle')
      return
    }
    setValidationError('')
    void load(toApiRange(dates))
  }

  const isLoading = loadState === 'loading'
  const totalSales = totals.reduce((sum, row) => sum + row.saleCount, 0)
  const combinedMxn = totals.reduce((sum, row) => sum + row.totalMxn, 0)
  const maxChannelMxn = Math.max(...totals.map((row) => row.totalMxn), 0)
  const progressMax = Math.max(maxChannelMxn, 1)
  const averageSaleMxn = totalSales === 0 ? 0 : combinedMxn / totalSales
  const topProducts = rankSalesProducts(details)

  return <section aria-labelledby="sales-report-title" className="w-full rounded-3xl bg-slate-900 p-4 text-slate-100 shadow-2xl sm:p-6 lg:p-8">
    <header className="flex flex-col gap-5 border-b border-slate-800 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-400">Reportes / análisis de ventas</p>
          <InfoButton id="sales-report-scope-info" label="Explicar el alcance del reporte de ventas" open={scopeInfoOpen} onToggle={() => setScopeInfoOpen((current) => !current)}>
            Este reporte del MVP solo incluye ventas registradas en Punto de venta, Mayoristas y Eventos. El detalle está limitado a las 100 ventas más recientes del rango y no incluye inventario, compras, sucursales, turnos, impuestos ni datos fuera de la operación de ventas.
          </InfoButton>
        </div>
        <h1 id="sales-report-title" className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Reportes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">Consulta el desempeño por canal, los productos más vendidos y el detalle seguro de las ventas del periodo.</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5">Solo ventas</span>
        <span className="rounded-full border border-slate-800 px-3 py-1.5">MXN</span>
      </div>
    </header>

    <form aria-label="Filtros del reporte de ventas" className="mt-6 rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5" onSubmit={submit}>
      <div className="grid gap-5 xl:grid-cols-[minmax(13rem,0.7fr)_minmax(0,1.8fr)] xl:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ventana de análisis</p>
          <p className="mt-2 text-sm font-semibold text-slate-200">Elige un rango de fechas</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Hasta 366 días. Los resultados se actualizan al enviar.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-end">
          <label className="grid min-w-0 gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <span>Fecha inicial</span>
            <CustomDatePicker value={dates.from} onChange={(value) => updateDate('from', value)} ariaLabel="Fecha inicial" ariaInvalid={Boolean(validationError)} disabled={isLoading} className="!border-slate-800 !bg-slate-900 !text-slate-100 hover:!bg-slate-800" />
          </label>
          <span aria-hidden="true" className="hidden pb-3 text-[10px] font-black uppercase tracking-widest text-slate-600 sm:block">A</span>
          <label className="grid min-w-0 gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <span>Fecha final</span>
            <CustomDatePicker value={dates.to} onChange={(value) => updateDate('to', value)} ariaLabel="Fecha final" ariaInvalid={Boolean(validationError)} disabled={isLoading} align="right" className="!border-slate-800 !bg-slate-900 !text-slate-100 hover:!bg-slate-800" />
          </label>
          <ResponsiveActionButton type="submit" label="Actualizar reporte" loading={isLoading} loadingLabel="Cargando reporte…" icon="refresh" mobileDisplay="text" className="w-full border border-sky-400/20 bg-sky-600 text-white shadow-lg shadow-sky-950/30 hover:bg-sky-500 sm:w-auto" />
        </div>
      </div>
    </form>

    {validationError && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-medium text-amber-100">{validationError}</div>}
    <p role="status" aria-live="polite" aria-atomic="true" className="mt-4 min-h-6 text-sm font-medium text-slate-400">{isLoading ? 'Cargando reporte de ventas…' : loadState === 'ready' ? 'Reporte de ventas cargado.' : ''}</p>

    {loadState === 'loading' && <div aria-hidden="true" className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-40 rounded-3xl border border-slate-800 bg-slate-950" />)}
    </div>}

    {loadState === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
      <p className="font-semibold">{loadError}</p>
      <p className="mt-1 text-sm text-rose-200/80">Revisa la conexión e inténtalo de nuevo.</p>
      <ResponsiveActionButton label="Reintentar" icon="refresh" mobileDisplay="text" onClick={() => void load(lastRange.current)} className="mt-4 border border-rose-400/20 bg-rose-600 text-white hover:bg-rose-500" />
    </div>}

    {loadState === 'ready' && <div className="mt-2 space-y-6">
      <section aria-labelledby="sales-summary-title" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <h2 id="sales-summary-title" className="sr-only">Resumen de ventas</h2>
        <article className="rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ventas acumuladas</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">{formatMxn(combinedMxn)}</p>
          <p className="mt-3 border-t border-slate-800 pt-3 text-xs font-semibold text-slate-400">Valor total en MXN del rango seleccionado</p>
        </article>
        <article className="rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cantidad de ventas</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">{totalSales}</p>
          <p className="mt-3 border-t border-slate-800 pt-3 text-xs font-semibold text-slate-400">{totalSales} {totalSales === 1 ? 'venta' : 'ventas'} en los tres canales operativos</p>
        </article>
        <article className="rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ticket promedio</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">{formatMxn(averageSaleMxn)}</p>
          <p className="mt-3 border-t border-slate-800 pt-3 text-xs font-semibold text-slate-400">Promedio sobre las ventas registradas del rango</p>
        </article>
      </section>

      {totalSales === 0 && <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
        <p className="font-semibold">No se registraron ventas en este rango de fechas.</p>
        <p className="mt-1 text-xs text-slate-500">Prueba con otro rango para consultar las ventas reportadas.</p>
      </div>}

      <section aria-labelledby="sales-channel-title" className="rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
        <div>
          <h2 id="sales-channel-title" className="text-lg font-black text-white">Comparación por canal</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Totales en MXN y cantidad de ventas del rango seleccionado.</p>
        </div>
        <ul aria-label="Ventas por canal" className="mt-5 grid min-w-0 gap-3 md:grid-cols-3">
          {totals.map((row) => {
            const barWidth = maxChannelMxn === 0 ? 0 : Math.min(100, Math.max(0, (row.totalMxn / maxChannelMxn) * 100))
            return <li key={row.channel} className="min-w-0">
              <article className="h-full rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-black text-white">{channelLabels[row.channel]}</h3>
                    <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">{channelDescriptions[row.channel]}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">MXN</span>
                </div>
                <p className="mt-6 text-xl font-black text-white">{formatMxn(row.totalMxn)}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">{row.saleCount} {row.saleCount === 1 ? 'venta' : 'ventas'}</p>
                <div className="mt-5" role="progressbar" aria-label={`Comparación del valor de ventas de ${channelLabels[row.channel]}`} aria-valuemin={0} aria-valuemax={progressMax} aria-valuenow={row.totalMxn} aria-valuetext={formatMxn(row.totalMxn)}>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-950 ring-1 ring-inset ring-slate-800"><span className="block h-full rounded-full bg-sky-500 transition-[width] duration-300" style={{ width: `${barWidth}%` }} /></div>
                </div>
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Relativo al total de canal más alto</p>
              </article>
            </li>
          })}
        </ul>
      </section>

      <section aria-labelledby="top-products-title" className="rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
        <div>
          <h2 id="top-products-title" className="text-lg font-black text-white">Productos más vendidos</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Top 5 del detalle disponible, ordenado por cantidad y con importe acumulado.</p>
        </div>
        {topProducts.length > 0 ? <ol className="mt-5 divide-y divide-slate-800/80">
          {topProducts.map((product, index) => <li key={product.productName} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-black text-slate-400">#{index + 1}</span>
              <p className="truncate text-sm font-bold text-white">{product.productName}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-black text-sky-400">{product.quantity} {product.quantity === 1 ? 'pieza' : 'piezas'}</p>
              <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{formatMxn(product.totalMxn)}</p>
            </div>
          </li>)}
        </ol> : <div className="mt-5 rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">Sin productos vendidos en el detalle del periodo.</div>}
      </section>

      <section aria-labelledby="sales-detail-title" className="rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 id="sales-detail-title" className="text-lg font-black text-white">Detalle de ventas</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Hasta 100 ventas más recientes del periodo, con sus productos e importes de línea.</p>
          </div>
          <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-500">{details.length} {details.length === 1 ? 'línea' : 'líneas'} reportadas</span>
        </div>
        {details.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">No hay detalle de ventas para el rango seleccionado.</div> : <>
          <ul aria-label="Detalle responsive de ventas" className="mt-5 space-y-3 md:hidden">
            {details.map((row, index) => <li key={detailKey(row, index)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-white">Venta {row.saleId}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{formatSaleDate(row.saleDate)}</p>
                </div>
                <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-sky-400">{channelLabels[row.channel]}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-800 pt-3 text-xs">
                <div><dt className="text-slate-500">Contexto</dt><dd className="mt-1 truncate font-semibold text-slate-200">{row.contextLabel ?? 'Sin etiqueta'}</dd></div>
                <div><dt className="text-slate-500">Producto</dt><dd className="mt-1 truncate font-semibold text-slate-200">{row.productName}</dd></div>
                <div><dt className="text-slate-500">Cantidad</dt><dd className="mt-1 font-semibold text-slate-200">{row.quantity}</dd></div>
                <div><dt className="text-slate-500">Importe de línea</dt><dd className="mt-1 font-black text-white">{formatMxn(row.lineTotalMxn)}</dd></div>
                <div className="col-span-2"><dt className="text-slate-500">Total de la venta</dt><dd className="mt-1 font-black text-sky-400">{formatMxn(row.totalMxn)}</dd></div>
              </dl>
            </li>)}
          </ul>
          <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/40 md:block">
            <table className="w-full min-w-[58rem] border-collapse text-left text-sm text-slate-300">
              <caption className="sr-only">Detalle de ventas del rango seleccionado</caption>
              <thead className="border-b border-slate-800 bg-slate-900 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-4">Venta</th>
                  <th className="px-4 py-4">Fecha</th>
                  <th className="px-4 py-4">Canal</th>
                  <th className="px-4 py-4">Contexto</th>
                  <th className="px-4 py-4">Producto</th>
                  <th className="px-4 py-4 text-right">Cantidad</th>
                  <th className="px-4 py-4 text-right">Importe línea</th>
                  <th className="px-4 py-4 text-right">Total venta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {details.map((row, index) => <tr key={detailKey(row, index)} className="transition-colors hover:bg-slate-900/60">
                  <td className="px-4 py-4 text-xs font-bold text-white">{row.saleId}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold text-slate-300">{formatSaleDate(row.saleDate)}</td>
                  <td className="px-4 py-4 text-xs font-semibold text-sky-400">{channelLabels[row.channel]}</td>
                  <td className="max-w-[12rem] truncate px-4 py-4 text-xs font-semibold text-slate-300">{row.contextLabel ?? 'Sin etiqueta'}</td>
                  <td className="px-4 py-4 text-xs font-semibold text-slate-200">{row.productName}</td>
                  <td className="px-4 py-4 text-right text-xs font-bold text-slate-200">{row.quantity}</td>
                  <td className="px-4 py-4 text-right text-xs font-black text-white">{formatMxn(row.lineTotalMxn)}</td>
                  <td className="px-4 py-4 text-right text-xs font-black text-sky-400">{formatMxn(row.totalMxn)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </>}
      </section>
    </div>}
  </section>
}
