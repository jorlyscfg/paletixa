import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './icons'

type CustomDatePickerProps = {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  align?: 'left' | 'right'
  ariaLabel?: string
  ariaInvalid?: boolean
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null
}

function toValue(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }

function cellsFor(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const previousLast = new Date(date.getFullYear(), date.getMonth(), 0).getDate()
  return Array.from({ length: 42 }, (_, index) => {
    const dayOffset = index - first.getDay() + 1
    if (dayOffset < 1) return { date: new Date(date.getFullYear(), date.getMonth() - 1, previousLast + dayOffset), current: false }
    if (dayOffset > last) return { date: new Date(date.getFullYear(), date.getMonth() + 1, dayOffset - last), current: false }
    return { date: new Date(date.getFullYear(), date.getMonth(), dayOffset), current: true }
  })
}

export function CustomDatePicker({ value, onChange, className = '', placeholder = 'Select a date', disabled = false, align = 'left', ariaLabel, ariaInvalid = false }: CustomDatePickerProps) {
  const selected = useMemo(() => parseDate(value), [value])
  const [open, setOpen] = useState(false)
  const [navDate, setNavDate] = useState(() => selected ?? new Date())
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNavDate(selected)
    }
  }, [selected])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [open])

  const cells = cellsFor(navDate)
  const label = selected ? selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : placeholder

  function moveMonth(amount: number) { setNavDate(new Date(navDate.getFullYear(), navDate.getMonth() + amount, 1)) }

  return <div ref={rootRef} className="relative w-full">
    <button type="button" disabled={disabled} aria-label={ariaLabel ? `${ariaLabel}: ${label}` : label} aria-invalid={ariaInvalid || undefined} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`ops-control ops-focus flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left ${className}`}>
      <span className="flex min-w-0 items-center gap-2 truncate"><Icon name="calendar" className="h-4 w-4 shrink-0 text-slate-500" />{label}</span><Icon name="chevron-down" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div role="dialog" aria-label="Calendar" className={`ops-popover absolute top-full z-50 mt-2 w-[23rem] max-w-[calc(100vw-2rem)] overflow-x-auto p-4 ${align === 'right' ? 'right-0' : 'left-0'}`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)} className="ops-focus inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"><Icon name="chevron-left" className="h-4 w-4" /></button>
        <p className="text-sm font-semibold text-white">{MONTHS[navDate.getMonth()]} {navDate.getFullYear()}</p>
        <button type="button" aria-label="Next month" onClick={() => moveMonth(1)} className="ops-focus inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"><Icon name="chevron-right" className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center">{WEEKDAYS.map((day) => <span key={day} className="py-1 text-xs font-medium text-slate-500">{day}</span>)}
        {cells.map(({ date, current }) => <button key={toValue(date)} type="button" aria-label={date.toLocaleDateString('en-US', { dateStyle: 'long' })} onClick={() => { onChange(toValue(date)); setOpen(false) }} className={`ops-focus inline-flex h-11 w-11 items-center justify-center rounded-lg text-sm ${selected && toValue(selected) === toValue(date) ? 'bg-sky-700 font-semibold text-white' : current ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-800/60'}`}>{date.getDate()}</button>)}
      </div>
    </div>}
  </div>
}
