import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CustomDatePicker } from '../../../app/components/CustomDatePicker'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { isSessionRecord, isSessionString, useAdminSessionPersistence } from '../../../app/sessionPersistence'
import { getReportTimezoneConfiguration, isConfigurationUnauthorizedError } from '../../configuration/api/configuration'
import type { AccessContext } from '../../auth/api/adminAccess'
import { getReportDashboardAnalysis, getReportDashboardSnapshot, isReportUnauthorizedError, type ReportAnalysisSnapshot, type ReportDashboardRange, type ReportScopeSelection, type ReportSnapshot, type ReportTimezone, type SalesChannel } from '../api/sales'
import { getDefaultReportDateRange, normalizeReportChannels, reportScopeLabel, validateReportDateRange, type ReportDateFields } from './salesReportUtils'
import { ReportEmployeeRankingsPanel, ReportOperatorPanel, ReportCatalogRankingsPanel } from './ReportAnalysisPanels'
import { ReportOperationsPanel, ReportTrendPanel } from './ReportSnapshotPanels'

type LoadState = 'loading' | 'ready' | 'error' | 'unauthorized'
type TimezoneBootstrapState = 'loading' | 'ready' | 'error' | 'unauthorized'
type SalesReportWorkspaceProps = { initialScope?: ReportScopeSelection; mode?: 'reports' | 'dashboard'; context?: AccessContext }

const DEFAULT_SCOPE: ReportScopeSelection = { kind: 'all' }

type SalesReportSessionState = { dates: ReportDateFields | null }
function isSalesReportSessionState(value: unknown): value is SalesReportSessionState {
  if (!isSessionRecord(value)) return false
  if (value.dates === null) return true
  return isSessionRecord(value.dates) && isSessionString(value.dates.from) && isSessionString(value.dates.to)
}

const channelLabels: Record<SalesChannel, string> = { pos: 'Punto de venta', wholesale: 'Mayoristas', event: 'Eventos' }
const channelDescriptions: Record<SalesChannel, string> = {
  pos: 'Ventas de mostrador',
  wholesale: 'Ventas por volumen',
  event: 'Ventas para eventos',
}

function toDashboardRange(fields: ReportDateFields, scope: ReportScopeSelection, timezone: ReportTimezone): ReportDashboardRange {
  return { from: fields.from, to: fields.to, timezone, scope }
}

function formatMxn(value: number) {
  return `$${value.toFixed(2)} MXN`
}

const summaryMxnFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0, currencyDisplay: 'symbol' })

function formatSummaryMxn(value: number) {
  return summaryMxnFormatter.format(value)
}

export function SalesReportWorkspace({ initialScope = DEFAULT_SCOPE, mode = 'reports', context }: SalesReportWorkspaceProps = {}) {
  const isDashboard = mode === 'dashboard'
  const persistence = useAdminSessionPersistence()
  const sessionModule = `sales-report:${mode}`
  const [restoredSession] = useState<SalesReportSessionState>(() => persistence?.read(sessionModule, isSalesReportSessionState) ?? { dates: null })
  const [scope] = useState<ReportScopeSelection>(() => initialScope)
  const [timezoneBootstrapState, setTimezoneBootstrapState] = useState<TimezoneBootstrapState>('loading')
  const [timezone, setTimezone] = useState<ReportTimezone | null>(null)
  const [timezoneLoadError, setTimezoneLoadError] = useState('')
  const [dates, setDates] = useState<ReportDateFields | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null)
  const [analysis, setAnalysis] = useState<ReportAnalysisSnapshot | null>(null)
  const [validationError, setValidationError] = useState('')
  const [loadError, setLoadError] = useState('')
  const sequence = useRef(0)
  const timezoneSequence = useRef(0)
  const initialLoadStarted = useRef(false)
  const feedback = useRef<HTMLDivElement>(null)
  const lastValidRange = useRef<ReportDashboardRange | null>(null)
  const restoredDates = useRef(restoredSession.dates)

  useEffect(() => {
    persistence?.write(sessionModule, { dates })
  }, [dates, persistence, sessionModule])

  const bootstrapTimezone = useCallback(async () => {
    const current = ++timezoneSequence.current
    initialLoadStarted.current = false
    setTimezoneBootstrapState('loading')
    setTimezoneLoadError('')
    setTimezone(null)
    setDates(null)
    setSnapshot(null)
    setAnalysis(null)
    setLoadState('loading')
    setLoadError('')
    try {
      const configuration = await getReportTimezoneConfiguration()
      if (current !== timezoneSequence.current) return
      const restored = restoredDates.current
      restoredDates.current = null
      const nextDates = restored && !validateReportDateRange(restored) ? restored : getDefaultReportDateRange(configuration.timezone, new Date(), 'dashboard')
      setTimezone(configuration.timezone)
      setDates(nextDates)
      lastValidRange.current = toDashboardRange(nextDates, scope, configuration.timezone)
      setTimezoneBootstrapState('ready')
    } catch (error) {
      if (current !== timezoneSequence.current) return
      const unauthorized = isConfigurationUnauthorizedError(error)
      setTimezoneBootstrapState(unauthorized ? 'unauthorized' : 'error')
      setTimezoneLoadError(unauthorized
        ? 'No tienes autorización para consultar la zona horaria de reportes.'
        : 'No se pudo cargar la zona horaria de reportes.')
    }
  }, [scope])

  const load = useCallback(async (range: ReportDashboardRange) => {
    const current = ++sequence.current
    lastValidRange.current = range
    setLoadState('loading')
    setLoadError('')
    try {
      const [nextSnapshot, nextAnalysis] = await Promise.all([
        getReportDashboardSnapshot(range),
        isDashboard ? Promise.resolve(null) : getReportDashboardAnalysis(range),
      ])
      if (current !== sequence.current) return
      setSnapshot(nextSnapshot)
      setAnalysis(nextAnalysis)
      setLoadState('ready')
    } catch (error) {
      if (current !== sequence.current) return
      if (isReportUnauthorizedError(error)) {
        setSnapshot(null)
        setAnalysis(null)
        setLoadState('unauthorized')
        setLoadError('No tienes autorización para consultar este reporte.')
      } else {
        setLoadState('error')
        setLoadError('No se pudo cargar el reporte de ventas.')
      }
    }
  }, [isDashboard])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void bootstrapTimezone() })
    return () => { cancelled = true }
  }, [bootstrapTimezone])
  useEffect(() => {
    if (timezoneBootstrapState !== 'ready' || !timezone || !dates || initialLoadStarted.current) return
    initialLoadStarted.current = true
    const initialRange = toDashboardRange(dates, scope, timezone)
    queueMicrotask(() => void load(initialRange))
  }, [dates, load, scope, timezone, timezoneBootstrapState])
  useLayoutEffect(() => {
    if (!validationError && !timezoneLoadError && loadState !== 'error' && loadState !== 'unauthorized') return
    feedback.current?.focus()
  }, [loadState, timezoneLoadError, validationError])

  function updateDate(field: keyof ReportDateFields, value: string) {
    if (!dates || !timezone) return
    const nextDates = { ...dates, [field]: value }
    const message = validateReportDateRange(nextDates)
    setDates(nextDates)
    setValidationError(message)
    setLoadError('')
    if (snapshot && loadState === 'error') setLoadState('ready')
    if (!message) void load(toDashboardRange(nextDates, scope, timezone))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dates || !timezone) return
    const message = validateReportDateRange(dates)
    if (message) {
      setValidationError(message)
      setLoadError('')
      if (snapshot && loadState === 'error') setLoadState('ready')
      return
    }
    setValidationError('')
    void load(toDashboardRange(dates, scope, timezone))
  }

  function retryLastValidRange() {
    const range = lastValidRange.current
    if (!range) return
    setDates({ from: range.from, to: range.to })
    setValidationError('')
    void load(range)
  }

  const isLoading = timezoneBootstrapState !== 'ready' || loadState === 'loading'
  const channels = snapshot ? normalizeReportChannels(snapshot.sales.channels) : []
  const maxChannelMxn = Math.max(...channels.map((row) => row.totalMxn), 0)
  const progressMax = Math.max(maxChannelMxn, 1)

  return <section aria-label={isDashboard ? 'Módulo Dashboard' : 'Módulo Reportes'} className="ops-workspace-frame flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-3 text-slate-100 shadow-2xl sm:p-5 lg:p-6">
    <form aria-label="Filtros del reporte de ventas" className="ops-panel-frame mt-0 shrink-0 rounded-3xl border border-slate-800 bg-slate-950 p-3 shadow-xl sm:p-5" onSubmit={submit}>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
          <label className="ops-field-label grid min-w-0 gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:gap-2 sm:text-xs">
            <span className="sr-only">Fecha inicial</span>
            <CustomDatePicker value={dates?.from ?? ''} onChange={(value) => updateDate('from', value)} ariaLabel="Fecha inicial" ariaInvalid={Boolean(validationError)} disabled={isLoading} className="min-w-0 gap-1 px-2 text-xs sm:gap-3 sm:px-3.5 sm:text-sm" />
          </label>
          <label className="ops-field-label grid min-w-0 gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:gap-2 sm:text-xs">
            <span className="sr-only">Fecha final</span>
            <CustomDatePicker value={dates?.to ?? ''} onChange={(value) => updateDate('to', value)} ariaLabel="Fecha final" ariaInvalid={Boolean(validationError)} disabled={isLoading} align="right" className="min-w-0 gap-1 px-2 text-xs sm:gap-3 sm:px-3.5 sm:text-sm" />
          </label>
        </div>
      </div>
    </form>

    {timezoneBootstrapState !== 'ready' && timezoneBootstrapState !== 'loading' && <div ref={feedback} tabIndex={-1} role="alert" className="mt-4 shrink-0 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
      <p className="font-semibold">{timezoneLoadError}</p>
      <p className="mt-1 text-sm text-rose-200/80">No se consultó ningún reporte porque falta la configuración de zona horaria.</p>
      <ResponsiveActionButton label="Reintentar configuración" icon="refresh" onClick={() => void bootstrapTimezone()} className="mt-4" />
    </div>}
    {validationError && <div ref={feedback} tabIndex={-1} role="alert" className="mt-4 shrink-0 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-medium text-amber-100">{validationError}</div>}
    {loadState === 'error' && <div ref={feedback} tabIndex={-1} role="alert" className="ops-state ops-state-error mt-4 shrink-0 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
      <p className="font-semibold">{loadError}</p>
      <p className="mt-1 text-sm text-rose-200/80">Se conservan los últimos resultados válidos. Revisa la conexión e inténtalo de nuevo.</p>
      <ResponsiveActionButton label="Reintentar" icon="refresh" onClick={retryLastValidRange} className="mt-4" />
    </div>}
    {loadState === 'unauthorized' && <div ref={feedback} tabIndex={-1} role="alert" className="ops-state ops-state-error mt-4 shrink-0 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
      <p className="font-semibold">{loadError}</p>
      <p className="mt-1 text-sm text-rose-200/80">No se muestran resultados protegidos. Si tu acceso cambió, vuelve a intentarlo.</p>
      <ResponsiveActionButton label="Reintentar" icon="refresh" onClick={retryLastValidRange} className="mt-4" />
    </div>}
    {timezoneBootstrapState === 'loading' && <p role="status" className="mt-4 min-h-6 shrink-0 text-sm font-medium text-sky-200">Cargando configuración de zona horaria…</p>}
    {timezoneBootstrapState === 'ready' && isLoading && !snapshot && <div aria-hidden="true" className="ops-state ops-state-loading mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-40 rounded-3xl border border-slate-800 bg-slate-950" />)}
    </div>}

    {!snapshot && loadState === 'unauthorized' && <div className="ops-state ops-state-error mt-2 rounded-2xl border border-dashed border-rose-500/30 bg-rose-950/20 p-6 text-sm text-rose-100">
      <p className="font-semibold">Reporte no disponible para este acceso.</p>
      <p className="mt-1 text-rose-200/80">La autorización del servidor no permitió cargar datos para el alcance solicitado.</p>
    </div>}

    {snapshot && <div className="ops-scroll-region mt-2 min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overscroll-contain pr-1" aria-busy={isLoading}>
       {isDashboard && <section aria-labelledby="sales-summary-title" className="grid min-w-0 grid-cols-3 gap-2 sm:gap-4">
        <h2 id="sales-summary-title" className="sr-only">Resumen de ventas reconocidas</h2>
        <article className="ops-panel-frame min-w-0 rounded-3xl border border-slate-800 bg-slate-950 p-3 shadow-xl sm:p-5">
          <p className="text-[9px] font-black uppercase leading-tight tracking-[0.08em] text-slate-500 sm:text-[10px] sm:tracking-widest">Ventas acumuladas</p>
          <p className="mt-2 text-lg font-black leading-tight tracking-tight text-white sm:mt-3 sm:text-3xl">{formatSummaryMxn(snapshot.sales.totalMxn)}</p>
          <p className="mt-2 border-t border-slate-800 pt-2 text-[10px] font-semibold leading-tight text-slate-400 sm:mt-3 sm:pt-3 sm:text-xs">Total reconocido por el servidor en el periodo</p>
        </article>
        <article className="ops-panel-frame min-w-0 rounded-3xl border border-slate-800 bg-slate-950 p-3 shadow-xl sm:p-5">
          <p className="text-[9px] font-black uppercase leading-tight tracking-[0.08em] text-slate-500 sm:text-[10px] sm:tracking-widest">Cantidad de ventas</p>
          <p className="mt-2 text-lg font-black leading-tight tracking-tight text-white sm:mt-3 sm:text-3xl">{snapshot.sales.count}</p>
          <p className="mt-2 border-t border-slate-800 pt-2 text-[10px] font-semibold leading-tight text-slate-400 sm:mt-3 sm:pt-3 sm:text-xs">Transacciones reconocidas en todos los canales</p>
        </article>
        <article className="ops-panel-frame min-w-0 rounded-3xl border border-slate-800 bg-slate-950 p-3 shadow-xl sm:p-5">
          <p className="text-[9px] font-black uppercase leading-tight tracking-[0.08em] text-slate-500 sm:text-[10px] sm:tracking-widest">Ticket promedio</p>
          <p className="mt-2 text-lg font-black leading-tight tracking-tight text-white sm:mt-3 sm:text-3xl">{formatSummaryMxn(snapshot.sales.averageTicketMxn)}</p>
          <p className="mt-2 border-t border-slate-800 pt-2 text-[10px] font-semibold leading-tight text-slate-400 sm:mt-3 sm:pt-3 sm:text-xs">{snapshot.sales.averageState === 'no-data' ? 'Sin datos reconocidos en el periodo' : 'Promedio calculado por el servidor'}</p>
        </article>
       </section>}

       {isDashboard && snapshot.sales.count === 0 && <div role="status" className="ops-state ops-state-empty rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
        <p className="font-semibold">No se registraron ventas reconocidas en este rango de fechas.</p>
        <p className="mt-1 text-xs text-slate-500">El reporte cargó correctamente con días en cero. Prueba con otro rango para consultar actividad.</p>
      </div>}

      {!isDashboard && <section aria-labelledby="sales-channel-title" className="ops-panel-frame rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
        <div>
          <h2 id="sales-channel-title" className="text-lg font-black text-white">Comparación por canal</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Totales completos reconocidos por el servidor para el periodo seleccionado.</p>
        </div>
        <ul aria-label="Ventas reconocidas por canal" className="mt-5 grid min-w-0 gap-3 md:grid-cols-3">
          {channels.map((row) => {
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
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Relativo al canal de mayor valor</p>
              </article>
            </li>
          })}
        </ul>
      </section>}

       {isDashboard && <ReportTrendPanel snapshot={snapshot} />}

       {!isDashboard && analysis && <>
         <ReportCatalogRankingsPanel products={analysis.products} categories={analysis.categories} />
         <ReportEmployeeRankingsPanel employees={analysis.employees} scopeLabel={reportScopeLabel(snapshot.scope)} />
         <ReportOperatorPanel context={context} />
       </>}

       {isDashboard && <ReportOperationsPanel snapshot={snapshot} />}
    </div>}
  </section>
}

export function DashboardWorkspace({ initialScope = DEFAULT_SCOPE }: { initialScope?: ReportScopeSelection } = {}) {
  return <SalesReportWorkspace initialScope={initialScope} mode="dashboard" />
}
