import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogImageTile } from './CatalogImageTile'
import { CustomDatePicker } from './CustomDatePicker'
import { CustomSelect } from './CustomSelect'
import { InfoButton } from './InfoButton'
import { ResponsiveActionButton } from './ResponsiveActionButton'
import { SearchInput } from './SearchInput'

describe('operations primitives', () => {
  afterEach(cleanup)

  it('provides labeled search and responsive loading action states', () => {
    const onChange = vi.fn()
    render(<><SearchInput label="Buscar catálogo" value="" onChange={onChange} /><ResponsiveActionButton label="Actualizar" icon="refresh" loading loadingLabel="Actualizando" /></>)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar catálogo' }), { target: { value: 'mango' } })
    expect(onChange).toHaveBeenCalledWith('mango')
    expect(screen.getByRole('button', { name: 'Actualizando' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Actualizando' })).toHaveAttribute('aria-busy', 'true')
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
