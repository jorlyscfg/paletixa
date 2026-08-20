import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
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

  return <section aria-labelledby="sales-report-title" className="w-full">
    <div>
      <p className="font-medium text-sky-700">Reports</p>
      <h1 id="sales-report-title" className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Sales report</h1>
      <p className="mt-3 max-w-2xl text-slate-700">Review sales counts and MXN totals across POS, wholesale, and events.</p>
    </div>

    <form aria-label="Sales report filters" className="mt-8 grid gap-4 rounded-2xl bg-white p-5 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={submit}>
      <label className="grid gap-1.5 font-medium">Start date<input required type="date" value={dates.from} onChange={(event) => updateDate('from', event.target.value)} aria-invalid={Boolean(validationError)} disabled={isLoading} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:bg-slate-100" /></label>
      <label className="grid gap-1.5 font-medium">End date<input required type="date" value={dates.to} onChange={(event) => updateDate('to', event.target.value)} aria-invalid={Boolean(validationError)} disabled={isLoading} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:bg-slate-100" /></label>
      <button type="submit" disabled={isLoading} className="min-h-11 rounded-xl bg-slate-950 px-5 font-medium text-white focus:outline-none focus:ring-2 focus:ring-sky-600 focus:ring-offset-2 disabled:opacity-60">{isLoading ? 'Loading report…' : 'Refresh report'}</button>
    </form>

    {validationError && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-950">{validationError}</div>}
    <p role="status" aria-live="polite" aria-atomic="true" className="mt-4 min-h-6 text-sm font-medium text-slate-600">{isLoading ? 'Loading sales report…' : loadState === 'ready' ? 'Sales report loaded.' : ''}</p>
    {loadState === 'loading' && <div aria-hidden="true" className="mt-4 grid gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-3"><div className="h-20 rounded-xl bg-slate-100" /><div className="h-20 rounded-xl bg-slate-100" /><div className="h-20 rounded-xl bg-slate-100" /></div>}
    {loadState === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-rose-900"><p>{loadError}</p><p className="mt-1 text-sm">Check the connection and try again.</p><button type="button" className="mt-3 min-h-11 rounded-xl bg-rose-900 px-4 font-medium text-white focus:outline-none focus:ring-2 focus:ring-rose-700 focus:ring-offset-2" onClick={() => void load(lastRange.current)}>Try again</button></div>}

    {loadState === 'ready' && <div className="mt-4">
      <div className="rounded-2xl bg-slate-950 p-5 text-white">
        <p className="text-sm font-medium text-slate-300">Combined total</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{formatMxn(combinedMxn)}</p>
        <p className="mt-1 text-sm text-slate-300">{totalSales} {totalSales === 1 ? 'sale' : 'sales'} in this date range</p>
      </div>
      {totalSales === 0 && <p className="mt-4 rounded-xl bg-slate-100 p-4 text-slate-700">No sales were recorded for this date range.</p>}
      <h2 className="mt-8 text-lg font-semibold">Sales by channel</h2>
      <ul aria-label="Sales by channel" className="mt-3 divide-y divide-slate-200 rounded-2xl bg-white px-5 shadow-sm">
        {totals.map((row) => <li key={row.channel} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-semibold">{channelLabels[row.channel]}</h3><p className="mt-1 text-sm text-slate-600">{row.saleCount} {row.saleCount === 1 ? 'sale' : 'sales'}</p></div>
          <p className="font-medium sm:text-right">{formatMxn(row.totalMxn)}</p>
        </li>)}
      </ul>
    </div>}
  </section>
}
