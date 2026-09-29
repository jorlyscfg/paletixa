import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CatalogControlsHeader, CatalogMobileSummary, CatalogPricePair, CatalogSelectionCard } from './CatalogPresentation'

describe('shared catalog presentation', () => {
  it('places catalog controls before the heading and keeps the count beside its section label', () => {
    render(<CatalogControlsHeader
      toolbar={<button type="button">Search</button>}
      categoryFilters={<div>Categories</div>}
      titleId="catalog-title"
      title="Build an order"
      sectionTitle="Products available"
      count="4 shown"
    />)

    const header = screen.getByTestId('catalog-controls-header')
    const search = within(header).getByRole('button', { name: 'Search' })
    const title = within(header).getByRole('heading', { name: 'Build an order' })
    const sectionTitle = within(header).getByRole('heading', { name: 'Products available' })
    expect(search.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(title.compareDocumentPosition(sectionTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(header).getByText('4 shown')).toBeInTheDocument()
  })

  it('uses the same selectable card shell and aligned two-slot price pair', () => {
    const onSelect = vi.fn()
    render(<CatalogSelectionCard
      dataTestId="shared-card"
      label="Add Mango"
      imageSrc={null}
      imageAlt="Mango"
      title="Mango"
      metadata="Paletas"
      pricePair={<CatalogPricePair retailValue="$12.50" wholesaleValue="$10.00" active="wholesale" />}
      onSelect={onSelect}
    />)

    const card = screen.getByTestId('shared-card')
    const pair = screen.getByTestId('catalog-price-pair')
    expect(card).toHaveAttribute('data-catalog-selection-card', '')
    expect(card).toHaveClass('rounded-2xl', 'border', 'bg-slate-900/65', 'p-2.5')
    expect(pair.querySelectorAll('[data-price-slot]')).toHaveLength(2)
    expect(within(pair).getByText('Menudeo')).toBeInTheDocument()
    expect(within(pair).getByText('Mayorista')).toBeInTheDocument()
    expect(within(pair).getByText('$10.00').closest('[data-price-slot="wholesale"]')).toHaveClass('border-amber-400/50')

    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('shares the mobile count, total, and action row without owning its parent shell', () => {
    const onAction = vi.fn()
    render(<div data-testid="summary-shell"><CatalogMobileSummary dataTestId="summary-bar" count={1} singularLabel="item" pluralLabel="items" total="$12.50" actionLabel="Review order" disabled={false} onAction={onAction} detailsTestId="summary-details" /></div>)

    const details = screen.getByTestId('summary-details')
    expect(details).toHaveClass('flex', 'flex-wrap', 'items-baseline', 'justify-between', 'gap-x-3', 'gap-y-1')
    expect(within(details).getByText('1 item')).toBeInTheDocument()
    expect(within(details).getByText('$12.50')).toBeInTheDocument()
    expect(screen.getByTestId('summary-bar')).toHaveClass('shrink-0', 'mt-2', 'border-t', 'lg:hidden')
    expect(screen.getByTestId('summary-bar')).not.toHaveClass('fixed', 'ops-mobile-action-bar')
    expect(screen.getByTestId('summary-shell')).not.toHaveClass('fixed', 'ops-mobile-action-bar')
    fireEvent.click(screen.getByRole('button', { name: 'Review order' }))
    expect(onAction).toHaveBeenCalledOnce()
  })
})
