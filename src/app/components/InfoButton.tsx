import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

type InfoButtonProps = { id: string; label: string; open: boolean; onToggle: () => void; children: ReactNode }

export function InfoButton({ id, label, open, onToggle, children }: InfoButtonProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const trigger = triggerRef.current
      const popover = popoverRef.current
      if (!trigger || !popover) return
      const rect = trigger.getBoundingClientRect()
      const width = Math.min(288, window.innerWidth - 24)
      popover.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`
      popover.style.top = `${rect.bottom + 8}px`
      popover.style.width = `${width}px`
      popover.style.visibility = 'visible'
    }
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { onToggle(); triggerRef.current?.focus() } }
    const handleOutside = (event: MouseEvent) => { const target = event.target as Node; if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) onToggle() }
    update(); window.addEventListener('resize', update); window.addEventListener('scroll', update, true); document.addEventListener('keydown', handleKeyDown); document.addEventListener('mousedown', handleOutside)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); document.removeEventListener('keydown', handleKeyDown); document.removeEventListener('mousedown', handleOutside) }
  }, [onToggle, open])

  const popover = open && typeof document !== 'undefined' ? createPortal(<div ref={popoverRef} id={id} role="tooltip" style={{ position: 'fixed', visibility: 'hidden' }} className="ops-popover z-[70] p-4 text-sm leading-relaxed text-slate-300">{children}</div>, document.body) : null

  return <span className="inline-flex"><button ref={triggerRef} type="button" aria-label={label} aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined} onClick={onToggle} className="ops-focus inline-flex min-h-11 min-w-11 items-center justify-center text-slate-400 hover:text-white"><span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-600 text-xs font-semibold">i</span></button>{popover}</span>
}
