import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const catalogApi = vi.hoisted(() => ({ list: vi.fn() }))
const realtimeApi = vi.hoisted(() => ({ subscribe: vi.fn() }))

vi.mock('../../wholesale/api/catalog', () => ({ listPublicWholesaleCatalog: catalogApi.list }))
vi.mock('../../products/api/catalogRealtime', () => ({ subscribeToProductCatalogChanges: realtimeApi.subscribe }))

import { PublicCatalogLanding } from './PublicCatalogLanding'

const mango = { id: 'product-1', name: 'Mango', sku: 'M-01', categoryId: 'category-1', category: 'Paletas', retailPriceMxn: 42.5, wholesalePriceMxn: 35, imageUrl: 'https://cdn.example.com/mango.jpg' }
const fresa = { id: 'product-2', name: 'Fresa', sku: 'F-02', categoryId: 'category-1', category: 'Paletas', retailPriceMxn: 38, wholesalePriceMxn: 30, imageUrl: null }

describe('PublicCatalogLanding', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.resetAllMocks()
    realtimeApi.subscribe.mockResolvedValue(() => undefined)
    catalogApi.list.mockResolvedValue([mango])
  })

  it('shows loading feedback and then renders safe public product details', async () => {
    let resolveCatalog!: (products: typeof mango[]) => void
    catalogApi.list.mockReturnValue(new Promise((resolve) => { resolveCatalog = resolve }))
    render(<PublicCatalogLanding />)

    expect(screen.getByTestId('public-catalog-loading')).toBeInTheDocument()
    expect(screen.getByText('Cargando catálogo…')).toBeInTheDocument()

    await act(async () => { resolveCatalog([mango]) })

    expect(await screen.findByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(screen.getByText('1 producto disponible')).toBeInTheDocument()
    expect(screen.getByText('$42.50')).toBeInTheDocument()
    expect(screen.getByText('$35.00')).toBeInTheDocument()
    expect(screen.getByTestId('public-catalog-landing')).toHaveClass('public-landing-scroll', 'min-h-0', 'overflow-x-hidden', 'overflow-y-auto')
    expect(screen.getByRole('banner')).toHaveClass('shrink-0')
    expect(screen.getByRole('link', { name: /Acceso de administración/ })).toHaveAttribute('href', '/app')
  })

  it('shows Consultar instead of inventing an unavailable wholesale price', async () => {
    const noWholesalePrice = { ...fresa, wholesalePriceMxn: 0 }
    const missingWholesalePrice = { ...mango, id: 'product-3', name: 'Limón', wholesalePriceMxn: undefined }
    catalogApi.list.mockResolvedValue([noWholesalePrice, missingWholesalePrice])

    render(<PublicCatalogLanding />)

    expect(await screen.findByRole('heading', { name: 'Limón' })).toBeInTheDocument()
    expect(screen.getAllByTestId('public-wholesale-price')).toHaveLength(2)
    expect(screen.getAllByText('Consultar')).toHaveLength(2)
  })

  it('keeps catalog results in a bounded, keyboard-focusable scroll region below the toolbar', async () => {
    render(<PublicCatalogLanding />)

    const region = await screen.findByRole('region', { name: 'Resultados del catálogo' })

    expect(region).toHaveAttribute('tabindex', '0')
    expect(region).toHaveClass('overflow-y-auto', 'overscroll-contain', 'max-h-[min(48rem,70vh)]', 'sm:max-h-[min(54rem,72vh)]', 'lg:max-h-[min(60rem,75vh)]')
    expect(screen.getByTestId('public-catalog-section')).toHaveClass('scroll-mt-20', 'sm:scroll-mt-24')
    expect(region).toContainElement(screen.getByTestId('public-catalog-grid'))
  })

  it('renders verified marketing facts and keeps the live catalog CTA surface connected', async () => {
    render(<PublicCatalogLanding />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Del antojo a tu propio negocio.' })).toBeInTheDocument()
    expect(screen.getByText(/La Paleti'Xa llegó a Playa del Carmen/)).toBeInTheDocument()
    expect(screen.getByTestId('brand-image-showcase')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Paleta cremosa de fresa con fruta' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: "Boli de chamoy de La Paleti'Xa" })).toBeInTheDocument()
    expect(screen.getByText('Fabricantes')).toBeInTheDocument()
    expect(screen.getByText('Distribuidores')).toBeInTheDocument()
    const marketingCategories = screen.getByRole('list', { name: 'Categorías de productos' })
    expect(marketingCategories).toHaveTextContent('Bolis')
    expect(marketingCategories).toHaveTextContent('Saborines')
    expect(marketingCategories).toHaveTextContent('Paletas')
    expect(marketingCategories).toHaveTextContent('Nieves')
    expect(screen.getByRole('link', { name: /Llamar al 9842047347/ })).toHaveAttribute('href', 'tel:9842047347')
    expect(screen.getByRole('link', { name: /Portal para clientes mayoristas/ })).toHaveAttribute('href', '/mayoristas')
    expect(screen.getByRole('link', { name: /Ver catálogo/ })).toHaveAttribute('href', '#catalogo')

    const socialLinks = [
      { name: /Facebook: Página de La Paleti'Xa/, href: 'https://www.facebook.com/p/La-PaletiXa-61556650520980/?locale=es_LA' },
      { name: /Anuncio en Facebook: La llegada a Playa del Carmen/, href: 'https://www.facebook.com/61556650520980/posts/la-paletiixa-lleg%C3%B3-a-playa-del-carmen-y-con-ella-los-mejores-productos-al-mejor-p/122093892080221684/' },
      { name: /Instagram: Publicación de La Paleti'Xa/, href: 'https://www.instagram.com/p/DYA87G2DTOf/' },
    ]

    for (const socialLink of socialLinks) {
      const link = screen.getByRole('link', { name: socialLink.name })
      expect(link).toHaveAttribute('href', socialLink.href)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('shows distinct consumer and wholesale paths plus factual orientation sections', async () => {
    render(<PublicCatalogLanding />)

    expect(await screen.findByRole('heading', { name: 'Dos maneras de entrar a La Paleti\'Xa.' })).toBeInTheDocument()
    expect(screen.getByTestId('audience-paths')).toHaveTextContent('Para descubrir productos')
    expect(screen.getByTestId('audience-paths')).toHaveTextContent('Para explorar mayoreo')
    expect(screen.getByRole('heading', { name: 'Muévete por la vitrina sin rodeos.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lo que necesitas saber antes de elegir.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explorar mayoreo' })).toHaveAttribute('href', '/mayoristas')
    expect(screen.getByRole('link', { name: 'Volver al catálogo' })).toHaveAttribute('href', '#catalogo')
  })

  it('filters the public catalog by search text and category', async () => {
    catalogApi.list.mockResolvedValue([mango, fresa])
    render(<PublicCatalogLanding />)
    await screen.findByRole('heading', { name: 'Fresa' })

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'mango' } })

    expect(screen.getByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Fresa' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Paletas' }))
    expect(screen.getAllByTestId('public-product-card')).toHaveLength(2)
  })

  it('keeps the previous catalog visible while coalescing realtime changes into one refetch', async () => {
    let realtimeListener: ((message: unknown) => void) | undefined
    catalogApi.list.mockResolvedValueOnce([mango]).mockResolvedValueOnce([fresa])
    realtimeApi.subscribe.mockImplementation(async (listener: (message: unknown) => void) => {
      realtimeListener = listener
      return () => undefined
    })
    render(<PublicCatalogLanding />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mango' })).toBeInTheDocument())

    act(() => {
      realtimeListener?.({ table: 'products', operation: 'update', id: 'product-1' })
      realtimeListener?.({ table: 'product_categories', operation: 'update', id: 'category-1' })
    })
    expect(catalogApi.list).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(screen.getByTestId('public-catalog-live-status')).toHaveTextContent('Actualizando…')

    await waitFor(() => expect(catalogApi.list).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'Fresa' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mango' })).not.toBeInTheDocument()
  })

  it('cleans up the realtime listener and pending debounce on unmount', async () => {
    const realtimeCleanup = vi.fn()
    let realtimeListener: ((message: unknown) => void) | undefined
    realtimeApi.subscribe.mockImplementation(async (listener: (message: unknown) => void) => {
      realtimeListener = listener
      return realtimeCleanup
    })
    const view = render(<PublicCatalogLanding />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mango' })).toBeInTheDocument())
    act(() => { realtimeListener?.({ table: 'products', operation: 'update', id: 'product-1' }) })

    view.unmount()
    await new Promise((resolve) => setTimeout(resolve, 250))

    expect(catalogApi.list).toHaveBeenCalledOnce()
    expect(realtimeCleanup).toHaveBeenCalledOnce()
  })

  it('does not duplicate the initial load or leak stale realtime cleanup in StrictMode', async () => {
    let resolveStaleSubscription!: (cleanup: () => void) => void
    const staleCleanup = vi.fn()
    const activeCleanup = vi.fn()
    const staleSubscription = new Promise<() => void>((resolve) => { resolveStaleSubscription = resolve })
    realtimeApi.subscribe.mockReturnValueOnce(staleSubscription).mockResolvedValueOnce(activeCleanup)

    const view = render(<StrictMode><PublicCatalogLanding /></StrictMode>)

    await waitFor(() => expect(catalogApi.list).toHaveBeenCalledOnce())
    expect(realtimeApi.subscribe).toHaveBeenCalledTimes(2)

    await act(async () => { resolveStaleSubscription(staleCleanup) })
    expect(staleCleanup).toHaveBeenCalledOnce()

    view.unmount()
    expect(activeCleanup).toHaveBeenCalledOnce()
    expect(catalogApi.list).toHaveBeenCalledOnce()
  })

  it('keeps the initial catalog usable when realtime is unavailable', async () => {
    realtimeApi.subscribe.mockRejectedValue(new Error('realtime unavailable'))
    render(<PublicCatalogLanding />)

    expect(await screen.findByRole('heading', { name: 'Mango' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
