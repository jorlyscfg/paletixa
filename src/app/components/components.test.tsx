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
    render(<><SearchInput label="Search catalog" value="" onChange={onChange} /><ResponsiveActionButton label="Refresh" icon="refresh" loading loadingLabel="Refreshing" /></>)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search catalog' }), { target: { value: 'mango' } })
    expect(onChange).toHaveBeenCalledWith('mango')
    expect(screen.getByRole('button', { name: 'Refreshing' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Refreshing' })).toHaveAttribute('aria-busy', 'true')
  })

  it('supports select keyboard and outside-close behavior', () => {
    const onChange = vi.fn()
    render(<CustomSelect label="Channel" value="pos" onChange={onChange} options={[{ value: 'pos', label: 'POS' }, { value: 'event', label: 'Event' }]} />)
    const trigger = screen.getByRole('button', { name: 'Channel' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('event')
    fireEvent.click(trigger); expect(screen.getByRole('listbox')).toBeInTheDocument(); fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('selects calendar dates, closes info on escape, and renders catalog fallback', () => {
    const onDateChange = vi.fn()
    const onInfoToggle = vi.fn()
    render(<><CustomDatePicker value="2026-08-20" onChange={onDateChange} /><InfoButton id="catalog-help" label="Catalog help" open onToggle={onInfoToggle}>Shared catalog</InfoButton><CatalogImageTile alt="Product image" fallback="No image" /></>)
    fireEvent.click(screen.getByRole('button', { name: /Aug 20, 2026/ })); fireEvent.click(screen.getByRole('button', { name: /August 20, 2026/ }))
    expect(onDateChange).toHaveBeenCalledWith('2026-08-20')
    fireEvent.keyDown(document, { key: 'Escape' }); expect(onInfoToggle).toHaveBeenCalled()
    expect(screen.getByText('No image')).toBeInTheDocument()
  })
})
