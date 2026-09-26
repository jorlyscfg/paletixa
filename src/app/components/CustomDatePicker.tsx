import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FloatingLayer } from './FloatingLayer'
import { Icon } from './icons'

type CustomDatePickerProps = {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  minValue?: string
  align?: 'left' | 'right'
  ariaLabel?: string
  ariaRequired?: boolean
  ariaInvalid?: boolean
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sá']

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

export function CustomDatePicker({ value, onChange, className = '', placeholder = 'Selecciona una fecha', disabled = false, minValue, align = 'left', ariaLabel, ariaRequired = false, ariaInvalid = false }: CustomDatePickerProps) {
  const selected = useMemo(() => parseDate(value), [value])
  const minimum = useMemo(() => (minValue ? parseDate(minValue) : null), [minValue])
  const [open, setOpen] = useState(false)
  const [navDate, setNavDate] = useState(() => selected && (!minimum || selected >= minimum) ? selected : minimum ?? new Date())
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const calendarId = `calendar-${useId().replace(/:/g, '')}`

  useEffect(() => {
    if (selected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNavDate(selected && (!minimum || selected >= minimum) ? selected : minimum ?? selected)
    }
  }, [minimum, selected])

  const cells = cellsFor(navDate)
  const label = selected ? selected.toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: 'numeric' }) : placeholder

  function moveMonth(amount: number) { setNavDate(new Date(navDate.getFullYear(), navDate.getMonth() + amount, 1)) }

  return <div ref={rootRef} className="relative w-full">
    <button ref={triggerRef} type="button" disabled={disabled} aria-label={ariaLabel ? `${ariaLabel}: ${label}` : label} aria-required={ariaRequired || undefined} aria-invalid={ariaInvalid || undefined} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? calendarId : undefined} onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus() } }} onClick={() => setOpen((current) => !current)} className={`ops-control flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left ${className}`}>
      <span className="flex min-w-0 items-center gap-2 truncate"><Icon name="calendar" className="h-4 w-4 shrink-0 text-slate-500" />{label}</span><Icon name="chevron-down" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    <FloatingLayer anchorRef={rootRef} open={open} onDismiss={(reason) => { setOpen(false); if (reason === 'escape') triggerRef.current?.focus() }} id={calendarId} role="dialog" ariaLabel="Calendario" align={align === 'right' ? 'end' : 'start'} width={368} maxHeight={420} className="ops-popover w-[23rem] max-w-[calc(100vw-2rem)] overflow-x-auto p-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Mes anterior" title="Mes anterior" onClick={() => moveMonth(-1)} className="ops-icon-button ops-focus"><Icon name="chevron-left" className="h-4 w-4" /></button>
        <p className="text-sm font-semibold text-white">{MONTHS[navDate.getMonth()]} {navDate.getFullYear()}</p>
        <button type="button" aria-label="Mes siguiente" title="Mes siguiente" onClick={() => moveMonth(1)} className="ops-icon-button ops-focus"><Icon name="chevron-right" className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center">{WEEKDAYS.map((day) => <span key={day} className="py-1 text-xs font-medium text-slate-500">{day}</span>)}
        {cells.map(({ date, current }) => { const isSelected = Boolean(selected && toValue(selected) === toValue(date)); const isBeforeMinimum = Boolean(minimum && date < minimum); return <button key={toValue(date)} type="button" disabled={isBeforeMinimum} aria-label={date.toLocaleDateString('es-MX', { dateStyle: 'long' })} aria-current={isSelected ? 'date' : undefined} data-selected={isSelected || undefined} onClick={() => { onChange(toValue(date)); setOpen(false); triggerRef.current?.focus() }} className={`ops-action ops-calendar-day ops-focus ${current ? '' : 'opacity-50'} ${isBeforeMinimum ? 'cursor-not-allowed opacity-30' : ''}`}><span>{date.getDate()}</span></button> })}
      </div>
    </FloatingLayer>
  </div>
}
