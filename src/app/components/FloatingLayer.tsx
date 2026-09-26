import { createPortal } from 'react-dom'
import { createContext, type CSSProperties, type ReactNode, type RefObject, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

const MOBILE_MAX_WIDTH = 639
const VIEWPORT_MARGIN = 8

export type FloatingDismissReason = 'outside' | 'escape'

export type FloatingLayerProps = {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onDismiss?: (reason: FloatingDismissReason) => void
  children: ReactNode
  className?: string
  id?: string
  role?: string
  ariaLabel?: string
  ariaActiveDescendant?: string
  align?: 'start' | 'end'
  placement?: 'bottom' | 'top'
  offset?: number
  maxHeight?: number
  width?: 'anchor' | number
}

type MobileLayerMode = 'inline' | 'portal' | null

const FloatingLayerContext = createContext<string | null>(null)

export function FloatingLayerScope({ id, children }: { id: string; children: ReactNode }) {
  return <FloatingLayerContext.Provider value={id}>{children}</FloatingLayerContext.Provider>
}

function isMobileViewport() {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= MOBILE_MAX_WIDTH || Boolean(window.matchMedia?.(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function FloatingLayer({
  anchorRef,
  open,
  onDismiss,
  children,
  className = '',
  id,
  role,
  ariaLabel,
  ariaActiveDescendant,
  align = 'start',
  placement = 'bottom',
  offset = 8,
  maxHeight = 320,
  width,
}: FloatingLayerProps) {
  const [mobile, setMobile] = useState(isMobileViewport)
  const [mobileMode, setMobileMode] = useState<MobileLayerMode>(null)
  const [mobileLayerWidth, setMobileLayerWidth] = useState<number | null>(null)
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const [floatingPlacement, setFloatingPlacement] = useState<'top' | 'bottom'>('bottom')
  const layerRef = useRef<HTMLDivElement>(null)
  const previousOpenRef = useRef(open)
  const previousMobileRef = useRef(mobile)
  const modalId = useContext(FloatingLayerContext)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia?.(`(max-width: ${MOBILE_MAX_WIDTH}px)`)
    const updateViewport = () => setMobile(isMobileViewport())
    window.addEventListener('resize', updateViewport)
    if (media?.addEventListener) media.addEventListener('change', updateViewport)
    else media?.addListener?.(updateViewport)
    return () => {
      window.removeEventListener('resize', updateViewport)
      if (media?.removeEventListener) media.removeEventListener('change', updateViewport)
      else media?.removeListener?.(updateViewport)
    }
  }, [])

  useEffect(() => {
    if (!open) return

    function isInsideLayer(target: EventTarget | null) {
      if (!(target instanceof Node)) return false
      return Boolean(anchorRef.current?.contains(target) || layerRef.current?.contains(target))
    }

    function handleOutsidePointer(event: Event) {
      if (!isInsideLayer(event.target)) onDismiss?.('outside')
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (event.target !== document && !isInsideLayer(event.target)) return
      event.preventDefault()
      onDismiss?.('escape')
    }

    document.addEventListener('mousedown', handleOutsidePointer)
    document.addEventListener('touchstart', handleOutsidePointer)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer)
      document.removeEventListener('touchstart', handleOutsidePointer)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [anchorRef, onDismiss, open])

  useLayoutEffect(() => {
    const opened = open && !previousOpenRef.current
    const viewportChanged = mobile !== previousMobileRef.current
    previousOpenRef.current = open
    previousMobileRef.current = mobile

    if (!open) {
      // Reset layout state before the next open so a stale portal position cannot flash.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPosition(null)
      return
    }

    if (mobile && viewportChanged) {
      setMobileMode(null)
      setMobileLayerWidth(null)
      setPosition(null)
      return
    }

    if (mobile && opened && (mobileMode !== null || mobileLayerWidth !== null)) {
      setMobileMode(null)
      setMobileLayerWidth(null)
      setPosition(null)
      return
    }

    function updatePosition() {
      const anchor = anchorRef.current
      const layer = layerRef.current
      if (!anchor || !layer) return

      const anchorRect = anchor.getBoundingClientRect()
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const availableWidth = Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2)
      const layerWidth = Math.min(width === undefined || width === 'anchor' ? anchorRect.width : width, availableWidth)
      const roomBelow = Math.max(0, viewportHeight - anchorRect.bottom - offset - VIEWPORT_MARGIN)
      const roomAbove = Math.max(0, anchorRect.top - offset - VIEWPORT_MARGIN)
      if (mobile && mobileLayerWidth !== layerWidth) {
        setMobileLayerWidth(layerWidth)
        setPosition(null)
        return
      }

      const layerRect = layer.getBoundingClientRect()
      if (mobile) {
        const desiredHeight = layerRect.height || maxHeight
        const fitsBelow = desiredHeight <= roomBelow
        const fitsAbove = desiredHeight <= roomAbove

        if (!fitsAbove && !fitsBelow) {
          setMobileMode('inline')
          setPosition(null)
          return
        }

        const shouldFlip = placement === 'top' ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove
        const availableHeight = shouldFlip ? roomAbove : roomBelow
        const computedMaxHeight = Math.max(0, Math.min(maxHeight, availableHeight))
        const renderedHeight = Math.min(desiredHeight, computedMaxHeight)
        const preferredTop = shouldFlip ? anchorRect.top - offset - renderedHeight : anchorRect.bottom + offset
        const top = clamp(preferredTop, VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN - renderedHeight)
        const preferredLeft = align === 'end' ? anchorRect.right - layerWidth : anchorRect.left
        const left = clamp(preferredLeft, VIEWPORT_MARGIN, viewportWidth - VIEWPORT_MARGIN - layerWidth)

        setMobileMode('portal')
        setFloatingPlacement(shouldFlip ? 'top' : 'bottom')
        setPosition({
          left,
          top,
          width: layerWidth,
          maxHeight: computedMaxHeight,
          visibility: 'visible',
        })
        return
      }

      const desiredHeight = layerRect.height || maxHeight
      const shouldFlip = placement === 'top' || (placement === 'bottom' && desiredHeight > roomBelow && roomAbove > roomBelow)
      const availableHeight = shouldFlip ? roomAbove : roomBelow
      const computedMaxHeight = Math.max(0, Math.min(maxHeight, availableHeight))
      const renderedHeight = Math.min(layerRect.height || computedMaxHeight, computedMaxHeight)
      const preferredTop = shouldFlip ? anchorRect.top - offset - renderedHeight : anchorRect.bottom + offset
      const top = clamp(preferredTop, VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN - renderedHeight)
      const preferredLeft = align === 'end' ? anchorRect.right - layerWidth : anchorRect.left
      const left = clamp(preferredLeft, VIEWPORT_MARGIN, viewportWidth - VIEWPORT_MARGIN - layerWidth)

      setFloatingPlacement(shouldFlip ? 'top' : 'bottom')
      setPosition({
        left,
        top,
        width: layerWidth,
        maxHeight: computedMaxHeight,
        visibility: 'visible',
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition)
    if (observer && layerRef.current) observer.observe(layerRef.current)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      observer?.disconnect()
    }
  }, [align, anchorRef, maxHeight, mobile, mobileLayerWidth, mobileMode, offset, open, placement, width])

  if (!open) return null

  const mobileStyle: CSSProperties = {
    top: `calc(100% + ${offset}px)`,
    left: align === 'start' ? 0 : undefined,
    right: align === 'end' ? 0 : undefined,
    width: mobileLayerWidth ?? undefined,
    maxHeight,
  }
  const inline = mobile && mobileMode === 'inline'
  const style: CSSProperties = inline
    ? { position: 'absolute', zIndex: 70, ...mobileStyle }
    : mobile
      ? { position: 'fixed', zIndex: 70, width: mobileLayerWidth ?? undefined, maxHeight, ...(position ?? { visibility: 'hidden' }) }
      : { position: 'fixed', zIndex: 70, ...(position ?? { visibility: 'hidden' }) }
  const layer = <div
    ref={layerRef}
    id={id}
    role={role}
    aria-label={ariaLabel}
    aria-activedescendant={ariaActiveDescendant}
    data-floating-layer="true"
    data-floating-layer-for={modalId ?? undefined}
    data-placement={inline ? 'inline' : floatingPlacement}
    className={`${inline ? 'absolute' : 'fixed'} z-[70] ${className}`}
    style={style}
  >{children}</div>

  return inline ? layer : createPortal(layer, document.body)
}
