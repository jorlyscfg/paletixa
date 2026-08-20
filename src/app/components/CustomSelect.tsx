import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './icons'

export type SelectOption = { value: string; label: ReactNode }

type CustomSelectProps = {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  className?: string
  disabled?: boolean
  label?: string
}

export function CustomSelect({ value, onChange, options, className = '', disabled = false, label = 'Selecciona una opción' }: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(Math.max(0, options.findIndex((option) => option.value === value)))
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = `select-${useId().replace(/:/g, '')}`
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function choose(option: SelectOption) {
    if (disabled) return
    onChange(option.value)
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (options.length === 0) return
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
    }
    if ((event.key === 'Enter' || event.key === ' ') && open && options[activeIndex]) { event.preventDefault(); choose(options[activeIndex]) }
  }

  return <div ref={rootRef} className="relative w-full">
    <button type="button" disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen((current) => !current)} onKeyDown={handleKeyDown} className={`ops-control ops-focus flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left ${className}`}>
      <span className="truncate">{selected?.label ?? 'Selecciona una opción'}</span><Icon name="chevron-down" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div id={listId} role="listbox" aria-label={label} className="ops-popover absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto p-1">
      {options.map((option, index) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)} className={`ops-focus flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm ${index === activeIndex ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/70'}`}>
        <span className="truncate">{option.label}</span>{option.value === value && <span className="ml-auto pl-3 text-sky-400">✓</span>}
      </button>)}
    </div>}
  </div>
}
