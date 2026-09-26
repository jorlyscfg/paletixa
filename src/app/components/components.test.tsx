import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogImageTile } from './CatalogImageTile'
import { CustomDatePicker } from './CustomDatePicker'
import { CustomSelect } from './CustomSelect'
import { InfoButton } from './InfoButton'
import { MobileBottomActionBar } from './MobileBottomActionBar'
import { ResponsiveActionButton } from './ResponsiveActionButton'
import { SearchInput } from './SearchInput'
import { Icon } from './icons'

describe('operations primitives', () => {
  const initialInnerWidth = window.innerWidth
  const initialInnerHeight = window.innerHeight
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: initialInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: initialInnerHeight })
  })

  it('provides labeled search and responsive loading action states', () => {
    const onChange = vi.fn()
    render(<><SearchInput label="Buscar catálogo" value="" onChange={onChange} /><ResponsiveActionButton label="Actualizar" icon="refresh" loading loadingLabel="Actualizando" /></>)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar catálogo' }), { target: { value: 'mango' } })
    expect(onChange).toHaveBeenCalledWith('mango')
    expect(screen.getByRole('button', { name: 'Actualizando' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Actualizando' })).toHaveAttribute('aria-busy', 'true')
  })

  it('renders icon-bearing actions icon-only by default while preserving their accessible labels', () => {
    render(<ResponsiveActionButton label="Guardar producto" icon="save" />)

    const button = screen.getByRole('button', { name: 'Guardar producto' })
    expect(button).toHaveAttribute('title', 'Guardar producto')
    expect(button).toHaveClass('ops-action', 'ops-icon-button', 'h-11', 'w-11', 'min-h-11', 'min-w-11', 'px-0')
    expect(button.querySelector('[data-icon="save"]')).toBeInTheDocument()
    expect(button).not.toHaveTextContent('Guardar producto')
  })

  it('allows an explicit visible label when the action context needs it', () => {
    render(<ResponsiveActionButton label="Guardar producto" icon="save" showLabel />)

    const button = screen.getByRole('button', { name: 'Guardar producto' })
    expect(button).not.toHaveClass('ops-icon-button')
    expect(button).toHaveTextContent('Guardar producto')
  })

  it('supports compact icon-only actions at every breakpoint', () => {
    render(<ResponsiveActionButton label="Actualizar productos" icon="refresh" iconOnly />)

    const button = screen.getByRole('button', { name: 'Actualizar productos' })
    expect(button).toHaveAttribute('title', 'Actualizar productos')
    expect(button).toHaveClass('ops-action', 'ops-icon-button')
    expect(button).toHaveClass('h-11', 'w-11', 'min-h-11', 'min-w-11', 'px-0')
    expect(button).not.toHaveTextContent('Actualizar productos')
    expect(button.querySelector('[data-icon="refresh"]')).toBeInTheDocument()
  })

  it('shares the safe-area structure for mobile bottom actions', () => {
    render(<MobileBottomActionBar dataTestId="mobile-actions"><ResponsiveActionButton label="Revisar" icon="chevron-right" showLabel /></MobileBottomActionBar>)

    const bar = screen.getByTestId('mobile-actions')
    expect(bar).toHaveClass('ops-mobile-action-bar', 'lg:hidden')
    expect(bar.firstElementChild).toHaveClass('mx-auto', 'w-full', 'max-w-[90rem]', 'gap-3')
    expect(bar).toHaveTextContent('Revisar')
  })

  it('renders transparent info controls by default and preserves additional classes', () => {
    render(<InfoButton id="info-help" label="Ayuda" open onToggle={vi.fn()} className="shrink-0">Contenido de ayuda</InfoButton>)

    const button = screen.getByRole('button', { name: 'Ayuda' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('ops-icon-button', 'ops-focus', 'border-transparent', 'bg-transparent', 'hover:border-transparent', 'hover:bg-transparent', 'active:bg-transparent', 'shrink-0')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Contenido de ayuda')
    expect(screen.getByRole('tooltip').parentElement).toBe(document.body)
  })

  it('provides reusable action and view icons', () => {
     render(<><Icon name="plus" /><Icon name="minus" /><Icon name="edit" /><Icon name="key" /><Icon name="trash" /><Icon name="power" /><Icon name="login" /><Icon name="grid" /><Icon name="table" /><Icon name="print" /><Icon name="wallet" /><Icon name="globe" /></>)

    expect(document.querySelector('[data-icon="plus"]')).toBeInTheDocument()
    expect(document.querySelector('[data-icon="minus"]')).toBeInTheDocument()
    expect(document.querySelector('[data-icon="edit"]')).toBeInTheDocument()
    expect(document.querySelector('[data-icon="key"]')).toBeInTheDocument()
    expect(document.querySelector('[data-icon="trash"]')).toBeInTheDocument()
    expect(document.querySelector('[data-icon="power"]')).toBeInTheDocument()
    expect(document.querySelector('[data-icon="login"]')).toBeInTheDocument()
    expect(document.querySelector('[data-icon="grid"]')).toBeInTheDocument()
    expect(document.querySelector('[data-icon="table"]')).toBeInTheDocument()
     expect(document.querySelector('[data-icon="print"]')).toBeInTheDocument()
     expect(document.querySelector('[data-icon="wallet"]')).toBeInTheDocument()
     expect(document.querySelector('[data-icon="globe"]')).toBeInTheDocument()
   })

  it('provides password visibility icons', () => {
    render(<><Icon name="eye" /><Icon name="eye-off" /></>)

    expect(document.querySelector('[data-icon="eye"]')).toBeInTheDocument()
    expect(document.querySelector('[data-icon="eye-off"]')).toBeInTheDocument()
  })

  it('supports select keyboard and outside-close behavior', () => {
    const onChange = vi.fn()
    render(<CustomSelect label="Canal" value="pos" onChange={onChange} options={[{ value: 'pos', label: 'Punto de venta' }, { value: 'event', label: 'Eventos' }]} />)
    const trigger = screen.getByRole('button', { name: 'Canal' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('event')
    fireEvent.click(trigger); expect(screen.getByRole('listbox')).toBeInTheDocument(); fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('ports desktop floating content and flips it when the lower viewport has insufficient space', () => {
    const anchorRect = { top: 250, bottom: 280, left: 40, right: 240, width: 200, height: 30, x: 40, y: 250, toJSON: () => ({}) }
    const originalAnchorRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.floatingLayer === 'true') return { top: 0, bottom: 180, left: 0, right: 200, width: 200, height: 180, x: 0, y: 0, toJSON: () => ({}) }
      return this === screen.getByRole('button', { name: 'Canal' }).parentElement ? anchorRect : originalAnchorRect.call(this)
    })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 })
    render(<CustomSelect label="Canal" value="pos" onChange={vi.fn()} options={[{ value: 'pos', label: 'Punto de venta' }, { value: 'event', label: 'Eventos' }]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Canal' }))
    const listbox = screen.getByRole('listbox')
    const layer = listbox.closest('[data-floating-layer]')
    expect(layer).toBeInTheDocument()
    expect(layer?.parentElement).toBe(document.body)
    expect(layer).toHaveAttribute('data-placement', 'top')
    expect(layer).toHaveStyle({ position: 'fixed', zIndex: '70' })
  })

  it('ports a mobile floating layer when it fits completely below the anchor', () => {
    const anchorRect = { top: 120, bottom: 152, left: 40, right: 240, width: 200, height: 32, x: 40, y: 120, toJSON: () => ({}) }
    const originalAnchorRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.floatingLayer === 'true') return { top: 0, bottom: 180, left: 0, right: 200, width: 200, height: 180, x: 0, y: 0, toJSON: () => ({}) }
      return this === screen.getByRole('button', { name: 'Canal' }).parentElement ? anchorRect : originalAnchorRect.call(this)
    })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 640 })
    render(<CustomSelect label="Canal" value="pos" onChange={vi.fn()} options={[{ value: 'pos', label: 'Punto de venta' }, { value: 'event', label: 'Eventos' }]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Canal' }))
    const layer = screen.getByRole('listbox').closest('[data-floating-layer]')
    expect(layer?.parentElement).toBe(document.body)
    expect(layer).toHaveClass('fixed')
    expect(layer).toHaveStyle({ position: 'fixed', zIndex: '70' })
    expect(layer).not.toHaveAttribute('data-placement', 'inline')
  })

  it('uses the inline mobile fallback only when neither side has enough space for the layer', () => {
    const anchorRect = { top: 150, bottom: 182, left: 40, right: 240, width: 200, height: 32, x: 40, y: 150, toJSON: () => ({}) }
    const originalAnchorRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.floatingLayer === 'true') return { top: 0, bottom: 180, left: 0, right: 200, width: 200, height: 180, x: 0, y: 0, toJSON: () => ({}) }
      return this === screen.getByRole('button', { name: 'Canal' }).parentElement ? anchorRect : originalAnchorRect.call(this)
    })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 360 })
    render(<CustomSelect label="Canal" value="pos" onChange={vi.fn()} options={[{ value: 'pos', label: 'Punto de venta' }, { value: 'event', label: 'Eventos' }]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Canal' }))
    const layer = screen.getByRole('listbox').closest('[data-floating-layer]')
    expect(layer?.parentElement).toBe(screen.getByRole('button', { name: 'Canal' }).parentElement)
    expect(layer).toHaveAttribute('data-placement', 'inline')
    expect(layer).toHaveClass('absolute')
    expect(layer).toHaveStyle({ position: 'absolute', zIndex: '70' })
  })

  it('restores focus after calendar Escape on mobile', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    render(<CustomDatePicker value="2026-08-20" onChange={vi.fn()} ariaLabel="Fecha" />)

    const trigger = screen.getByRole('button', { name: /Fecha: 20 ago 2026/ })
    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Calendario' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes the portaled calendar from an outside pointer and preserves date selection semantics', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    const onChange = vi.fn()
    render(<CustomDatePicker value="2026-08-20" onChange={onChange} ariaLabel="Fecha" />)
    const trigger = screen.getByRole('button', { name: /Fecha: 20 ago 2026/ })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: /21 de agosto de 2026/ }))
    expect(onChange).toHaveBeenCalledWith('2026-08-21')
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Calendario' })).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog', { name: 'Calendario' })).not.toBeInTheDocument()
  })

  it('disables dates before the configured minimum without affecting the shared picker contract', () => {
    const onChange = vi.fn()
    const minimum = new Date()
    const yesterday = new Date(minimum)
    yesterday.setDate(yesterday.getDate() - 1)
    const value = `${minimum.getFullYear()}-${String(minimum.getMonth() + 1).padStart(2, '0')}-${String(minimum.getDate()).padStart(2, '0')}`
    render(<CustomDatePicker value={value} minValue={value} onChange={onChange} ariaLabel="Fecha del evento" />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Fecha del evento:`) }))
    const yesterdayButton = screen.getByRole('button', { name: yesterday.toLocaleDateString('es-MX', { dateStyle: 'long' }) })
    expect(yesterdayButton).toBeDisabled()
    fireEvent.click(yesterdayButton)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: minimum.toLocaleDateString('es-MX', { dateStyle: 'long' }) })).toBeEnabled()
  })

  it('keeps the active option synchronized with controlled values and option changes', () => {
    const onChange = vi.fn()
    const view = render(<CustomSelect label="Canal" value="pos" onChange={onChange} options={[{ value: 'pos', label: 'Punto de venta' }, { value: 'event', label: 'Eventos' }]} />)
    view.rerender(<CustomSelect label="Canal" value="event" onChange={onChange} options={[{ value: 'event', label: 'Eventos actualizados' }, { value: 'pos', label: 'Punto de venta' }]} />)

    const trigger = screen.getByRole('button', { name: 'Canal' })
    expect(trigger).toHaveTextContent('Eventos actualizados')
    fireEvent.click(trigger)
    expect(screen.getByRole('option', { name: 'Eventos actualizados' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); fireEvent.keyDown(trigger, { key: ' ' })
    expect(onChange).toHaveBeenCalledWith('pos')
  })

  it('announces empty options and respects the disabled state', () => {
    const view = render(<CustomSelect label="Sucursal" value="" onChange={vi.fn()} options={[]} placeholder="Selecciona una sucursal activa" emptyLabel="No hay sucursales activas" />)
    const trigger = screen.getByRole('button', { name: 'Sucursal' })
    expect(trigger).toHaveTextContent('Selecciona una sucursal activa')
    fireEvent.keyDown(trigger, { key: ' ' })
    expect(screen.getByRole('status')).toHaveTextContent('No hay sucursales activas')
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    view.rerender(<CustomSelect label="Sucursal" value="" onChange={vi.fn()} options={[]} disabled placeholder="Selecciona una sucursal activa" />)
    expect(screen.getByRole('button', { name: 'Sucursal' })).toBeDisabled()
  })

  it('selects calendar dates, closes info on escape, and renders catalog fallback', () => {
    const onDateChange = vi.fn()
    const onInfoToggle = vi.fn()
    render(<><CustomDatePicker value="2026-08-20" onChange={onDateChange} /><InfoButton id="catalog-help" label="Ayuda del catálogo" open onToggle={onInfoToggle}>Catálogo compartido</InfoButton><CatalogImageTile alt="Imagen del producto" fallback="Sin imagen" /></>)
    fireEvent.click(screen.getByRole('button', { name: /20 ago 2026/ })); fireEvent.click(screen.getByRole('button', { name: /20 de agosto de 2026/ }))
    expect(onDateChange).toHaveBeenCalledWith('2026-08-20')
    fireEvent.keyDown(document, { key: 'Escape' }); expect(onInfoToggle).toHaveBeenCalled()
    expect(screen.getByText('Sin imagen')).toBeInTheDocument()
  })

  it('renders a product image and switches to the fallback after an image error', () => {
    render(<CatalogImageTile src="https://cdn.example.com/producto.jpg" alt="Imagen del producto" fallback="Sin imagen" />)
    const image = screen.getByRole('img', { name: 'Imagen del producto' })
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/producto.jpg')
    fireEvent.error(image)
    expect(screen.getByText('Sin imagen')).toBeInTheDocument()
  })
})
