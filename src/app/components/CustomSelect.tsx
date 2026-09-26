import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { FloatingLayer } from './FloatingLayer'
import { Icon } from './icons'

export type SelectOption = { value: string; label: ReactNode }

export type CustomSelectProps = {
  value: string
  onChange: (value: string) => void
  options: readonly SelectOption[]
  className?: string
  disabled?: boolean
  label?: string
  placeholder?: ReactNode
  emptyLabel?: ReactNode
  required?: boolean
  ariaInvalid?: boolean
  ariaDescribedBy?: string
}

export function CustomSelect({
  value,
  onChange,
  options,
  className = '',
  disabled = false,
  label = 'Selecciona una opción',
  placeholder = 'Selecciona una opción',
  emptyLabel = 'No hay opciones disponibles',
  required = false,
  ariaInvalid = false,
  ariaDescribedBy,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeState, setActiveState] = useState({ key: '', index: -1 })
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const id = useId().replace(/:/g, '')
  const listId = `select-${id}-listbox`
  const selected = options.find((option) => option.value === value)
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectionKey = JSON.stringify([value, ...options.map((option) => option.value)])
  const fallbackIndex = selectedIndex >= 0 ? selectedIndex : options.length > 0 ? 0 : -1
  const activeIndex = activeState.key === selectionKey && activeState.index >= 0 && activeState.index < options.length ? activeState.index : fallbackIndex

  useEffect(() => {
    if (!disabled) return
    // A disabled selector must not retain an open popup when its props change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false)
  }, [disabled])

  function choose(option: SelectOption, index: number) {
    if (disabled) return
    onChange(option.value)
    setActiveState({ key: selectionKey, index })
    setOpen(false)
    triggerRef.current?.focus()
  }

  function openMenu() {
    if (disabled) return
    setActiveState({ key: selectionKey, index: fallbackIndex })
    setOpen(true)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (options.length === 0) return
      const offset = event.key === 'ArrowDown' ? 1 : options.length - 1
      setActiveState({ key: selectionKey, index: (activeIndex + offset) % options.length })
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) {
        openMenu()
      } else if (options[activeIndex]) {
        choose(options[activeIndex], activeIndex)
      }
    }
  }

  return <div ref={rootRef} className="relative w-full">
    <button ref={triggerRef} type="button" disabled={disabled} aria-label={label} aria-required={required || undefined} aria-invalid={ariaInvalid || undefined} aria-describedby={ariaDescribedBy} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined} onClick={() => open ? setOpen(false) : openMenu()} onKeyDown={handleKeyDown} className={`ops-control flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left ${className}`}>
      <span className="truncate">{selected?.label ?? placeholder}</span><Icon name="chevron-down" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    <FloatingLayer anchorRef={rootRef} open={open} onDismiss={(reason) => { setOpen(false); if (reason === 'escape') triggerRef.current?.focus() }} id={listId} role="listbox" ariaLabel={label} ariaActiveDescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined} width="anchor" maxHeight={256} className="ops-popover max-h-64 overflow-y-auto p-1">
      {options.length > 0 ? options.map((option, index) => <div id={`${listId}-option-${index}`} key={option.value} role="option" aria-selected={option.value === value} data-active={index === activeIndex || undefined} onMouseEnter={() => setActiveState({ key: selectionKey, index })} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option, index)} className="ops-option ops-focus">
        <span className="truncate">{option.label}</span>{option.value === value && <span aria-hidden="true" className="ml-auto pl-3 text-slate-300">✓</span>}
      </div>) : <p role="status" className="px-3 py-3 text-sm text-slate-400">{emptyLabel}</p>}
    </FloatingLayer>
  </div>
}
