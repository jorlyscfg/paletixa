import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react'
import { FloatingLayerScope } from './FloatingLayer'
import { Icon } from './icons'

type ModalProps = {
  title: ReactNode
  description?: ReactNode
  headerActions?: ReactNode
  children: ReactNode
  closeLabel: string
  onClose: () => void
  busy?: boolean
  closeDisabled?: boolean
  closeOnOverlayClick?: boolean
  autoFocusCloseButton?: boolean
  maxWidthClassName?: string
  bodyClassName?: string
  bodyOverflowClassName?: string
  zIndexClassName?: string
}

const focusableSelector = 'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  title,
  description,
  headerActions,
  children,
  closeLabel,
  onClose,
  busy = false,
  closeDisabled = false,
  closeOnOverlayClick = true,
  autoFocusCloseButton = true,
  maxWidthClassName = 'max-w-3xl',
  bodyClassName = '',
  bodyOverflowClassName = 'overflow-y-auto',
  zIndexClassName = 'z-50',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const closeDisabledRef = useRef(closeDisabled || busy)
  const onCloseRef = useRef(onClose)
  const headingId = useId()
  const descriptionId = useId()
  const modalId = useId().replace(/:/g, '')

  useEffect(() => {
    closeDisabledRef.current = closeDisabled || busy
  }, [busy, closeDisabled])

  useLayoutEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const requestClose = useCallback(() => {
    if (!closeDisabledRef.current) onCloseRef.current()
  }, [])

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (autoFocusCloseButton) closeButtonRef.current?.focus()
    else dialogRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      const targetIsFloatingLayer = event.target instanceof Element && event.target.closest('[data-floating-layer]')?.getAttribute('data-floating-layer-for') === modalId
      if (event.key === 'Escape' && (targetIsFloatingLayer || document.querySelector('[data-floating-layer]'))) return
      if (event.target !== document && event.target instanceof Node && !dialogRef.current?.contains(event.target) && !targetIsFloatingLayer) return
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusableElements = [
        ...(dialogRef.current ? Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)) : []),
        ...Array.from(document.querySelectorAll<HTMLElement>(`[data-floating-layer-for="${modalId}"]`))
          .filter((layer) => !dialogRef.current?.contains(layer))
          .flatMap((layer) => Array.from(layer.querySelectorAll<HTMLElement>(focusableSelector))),
      ]
      if (focusableElements.length === 0) return
      const firstFocusableElement = focusableElements[0]
      const lastFocusableElement = focusableElements[focusableElements.length - 1]
      if (document.activeElement === dialogRef.current) {
        event.preventDefault()
        ;(event.shiftKey ? lastFocusableElement : firstFocusableElement).focus()
        return
      }
      if (event.shiftKey && document.activeElement === firstFocusableElement) {
        event.preventDefault()
        lastFocusableElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
        event.preventDefault()
        firstFocusableElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousActiveElement?.focus()
    }
  }, [autoFocusCloseButton, modalId, requestClose])

  return <FloatingLayerScope id={modalId}><div className={`fixed inset-0 ${zIndexClassName} overflow-hidden bg-slate-950/80 p-4 backdrop-blur-sm sm:p-6`} onClick={(event) => { if (closeOnOverlayClick && event.target === event.currentTarget) requestClose() }}>
    <div ref={dialogRef} data-modal-dialog="true" data-modal-id={modalId} role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={description ? descriptionId : undefined} tabIndex={autoFocusCloseButton ? undefined : -1} className={`mx-auto flex max-h-[calc(100vh-2rem)] min-h-0 w-full ${maxWidthClassName} flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-h-[calc(100vh-3rem)] ${autoFocusCloseButton ? '' : 'focus:outline-none'}`}>
      <header data-modal-header="true" className="flex shrink-0 items-center gap-3 border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="truncate text-lg font-extrabold tracking-tight text-white">{title}</h2>
          {description && <p id={descriptionId} className="mt-1 text-xs text-slate-400">{description}</p>}
        </div>
        <div data-modal-header-actions="true" className="ml-3 flex shrink-0 items-center gap-2">
          {headerActions}
          <button ref={closeButtonRef} data-modal-close="true" type="button" aria-label={closeLabel} title={closeLabel} disabled={closeDisabled || busy} className="ops-icon-button ops-focus" onClick={requestClose}><Icon name="close" className="h-5 w-5" /></button>
        </div>
      </header>

      <div className={`min-h-0 flex-1 ${bodyOverflowClassName} overscroll-contain ${bodyClassName}`}>
        {children}
      </div>
    </div>
  </div></FloatingLayerScope>
}
