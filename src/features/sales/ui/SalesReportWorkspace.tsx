import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CustomDatePicker } from '../../../app/components/CustomDatePicker'
import { InfoButton } from '../../../app/components/InfoButton'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { getSalesByChannel, SALES_CHANNELS, type SalesChannel, type SalesChannelTotal, type SalesReportRange } from '../api/sales'

type DateFields = { from: string; to: string }
type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const channelLabels: Record<SalesChannel, string> = { pos: 'POS', wholesale: 'Wholesale', event: 'Event' }
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
  pos: 'Point-of-sale sales',
  wholesale: 'Wholesale sales',
  event: 'Event sales',
}

function dateAtUtc(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() : null
}

function validateDateRange({ from, to }: DateFields) {
  if (!from || !to) return 'Choose both a start date and an end date.'
  const start = dateAtUtc(from)
  const end = dateAtUtc(to)
  if (start === null || end === null) return 'Enter valid start and end dates.'
  if (end < start) return 'The start date must be on or before the end date.'
  if (end - start >= MAX_REPORT_DAYS * DAY_MS) return 'Choose a date range of 366 days or less.'
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

export function SalesReportWorkspace() {
  const [dates, setDates] = useState<DateFields>(DEFAULT_DATE_RANGE)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [totals, setTotals] = useState<SalesChannelTotal[]>([])
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
    try {
      const next = await getSalesByChannel(range)
      if (current === sequence.current) {
        setTotals(normalizeTotals(next))
        setLoadState('ready')
      }
    } catch {
      if (current === sequence.current) {
        setLoadState('error')
        setLoadError('Sales report could not be loaded.')
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

  return <section aria-labelledby="sales-report-title" className="w-full rounded-3xl bg-slate-900 p-4 text-slate-100 shadow-2xl sm:p-6 lg:p-8">
    <header className="flex flex-col gap-5 border-b border-slate-800 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-400">Reports / sales visibility</p>
          <InfoButton id="sales-report-scope-info" label="Explain sales report scope" open={scopeInfoOpen} onToggle={() => setScopeInfoOpen((current) => !current)}>
            This MVP report includes only sales counts and MXN totals returned for POS, Wholesale, and Event in the selected range. It does not include inventory, purchases, branches, shifts, audit, tax, export, trend, or transaction detail data.
          </InfoButton>
        </div>
        <h1 id="sales-report-title" className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Sales report</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">Review the count and MXN total of sales across the three operating channels.</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5">Sales only</span>
        <span className="rounded-full border border-slate-800 px-3 py-1.5">MXN</span>
      </div>
    </header>

    <form aria-label="Sales report filters" className="mt-6 rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5" onSubmit={submit}>
      <div className="grid gap-5 xl:grid-cols-[minmax(13rem,0.7fr)_minmax(0,1.8fr)] xl:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Analysis window</p>
          <p className="mt-2 text-sm font-semibold text-slate-200">Choose a bounded date range</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Up to 366 days. Results refresh only when submitted.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-end">
          <label className="grid min-w-0 gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <span>Start date</span>
            <CustomDatePicker value={dates.from} onChange={(value) => updateDate('from', value)} ariaLabel="Start date" ariaInvalid={Boolean(validationError)} disabled={isLoading} className="!border-slate-800 !bg-slate-900 !text-slate-100 hover:!bg-slate-800" />
          </label>
          <span aria-hidden="true" className="hidden pb-3 text-[10px] font-black uppercase tracking-widest text-slate-600 sm:block">To</span>
          <label className="grid min-w-0 gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            <span>End date</span>
            <CustomDatePicker value={dates.to} onChange={(value) => updateDate('to', value)} ariaLabel="End date" ariaInvalid={Boolean(validationError)} disabled={isLoading} align="right" className="!border-slate-800 !bg-slate-900 !text-slate-100 hover:!bg-slate-800" />
          </label>
          <ResponsiveActionButton type="submit" label="Refresh report" loading={isLoading} loadingLabel="Loading report…" icon="refresh" mobileDisplay="text" className="w-full border border-sky-400/20 bg-sky-600 text-white shadow-lg shadow-sky-950/30 hover:bg-sky-500 sm:w-auto" />
        </div>
      </div>
    </form>

    {validationError && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-medium text-amber-100">{validationError}</div>}
    <p role="status" aria-live="polite" aria-atomic="true" className="mt-4 min-h-6 text-sm font-medium text-slate-400">{isLoading ? 'Loading sales report…' : loadState === 'ready' ? 'Sales report loaded.' : ''}</p>

    {loadState === 'loading' && <div aria-hidden="true" className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="h-40 rounded-3xl border border-slate-800 bg-slate-950" />
      <div className="h-40 rounded-3xl border border-slate-800 bg-slate-950" />
      <div className="h-40 rounded-3xl border border-slate-800 bg-slate-950" />
      <div className="h-40 rounded-3xl border border-slate-800 bg-slate-950" />
      <div className="h-40 rounded-3xl border border-slate-800 bg-slate-950" />
    </div>}

    {loadState === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
      <p className="font-semibold">{loadError}</p>
      <p className="mt-1 text-sm text-rose-200/80">Check the connection and try again.</p>
      <ResponsiveActionButton label="Try again" icon="refresh" mobileDisplay="text" onClick={() => void load(lastRange.current)} className="mt-4 border border-rose-400/20 bg-rose-600 text-white hover:bg-rose-500" />
    </div>}

    {loadState === 'ready' && <div className="mt-2 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Combined sales</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">{formatMxn(combinedMxn)}</p>
          <p className="mt-3 border-t border-slate-800 pt-3 text-xs font-semibold text-slate-400">Total MXN value in the selected range</p>
        </article>
        <article className="rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sales count</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">{totalSales}</p>
          <p className="mt-3 border-t border-slate-800 pt-3 text-xs font-semibold text-slate-400">{totalSales === 1 ? 'Sale' : 'Sales'} across POS, Wholesale, and Event</p>
        </article>
      </div>

      {totalSales === 0 && <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
        <p className="font-semibold">No sales were recorded for this date range.</p>
        <p className="mt-1 text-xs text-slate-500">Try another date range to review reported sales.</p>
      </div>}

      <section aria-labelledby="sales-channel-title" className="rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
        <div>
          <h2 id="sales-channel-title" className="text-lg font-black text-white">Channel comparison</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">MXN totals and sale counts for the selected range.</p>
        </div>
        <ul aria-label="Sales by channel" className="mt-5 grid min-w-0 gap-3 md:grid-cols-3">
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
                <p className="mt-1 text-xs font-semibold text-slate-400">{row.saleCount} {row.saleCount === 1 ? 'sale' : 'sales'}</p>
                <div className="mt-5" role="progressbar" aria-label={`${channelLabels[row.channel]} sales value comparison`} aria-valuemin={0} aria-valuemax={progressMax} aria-valuenow={row.totalMxn} aria-valuetext={formatMxn(row.totalMxn)}>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-950 ring-1 ring-inset ring-slate-800"><span className="block h-full rounded-full bg-sky-500 transition-[width] duration-300" style={{ width: `${barWidth}%` }} /></div>
                </div>
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Relative to highest channel total</p>
              </article>
            </li>
          })}
        </ul>
      </section>
    </div>}
  </section>
}
