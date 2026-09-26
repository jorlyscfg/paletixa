import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from './AppProviders'
import { POS_CATALOG_CACHE_BUSTER, POS_CATALOG_CACHE_KEY, clearAppQueryCache, createPosCatalogCacheIdentity, useAppQueryCache } from './queryCache'
import { POS_CATALOG_QUERY_KEY } from '../features/sales/api/posCatalog'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

function SeedQueries() {
  useQuery({ queryKey: POS_CATALOG_QUERY_KEY, queryFn: async () => [{ id: 'product-1' }] })
  useQuery({ queryKey: ['auth-session'], queryFn: async () => ({ token: 'must-not-persist' }) })
  return <div role="status" aria-label="query state">ready</div>
}

function CatalogProbe({ queryFn }: { queryFn: () => Promise<Array<{ id: string }>> }) {
  const { data = [] } = useQuery({ queryKey: POS_CATALOG_QUERY_KEY, queryFn })
  return <output>{data.map(({ id }) => id).join(',')}</output>
}

describe('app query providers', () => {
  it('scopes the stable cache identity to the configured InsForge environment', () => {
    const dev = createPosCatalogCacheIdentity('https://dev.example.insforge.app/')
    const main = createPosCatalogCacheIdentity('https://main.example.insforge.app')

    expect(createPosCatalogCacheIdentity(' https://dev.example.insforge.app/// ')).toEqual(dev)
    expect(dev.key).not.toBe(main.key)
    expect(dev.buster).not.toBe(main.buster)
    expect(POS_CATALOG_CACHE_KEY).toContain('paletixa-query-cache-v1-')
    expect(POS_CATALOG_CACHE_BUSTER).toContain('pos-catalog-persistence-v1-')
  })

  it('persists only the versioned POS catalog query', async () => {
    render(<AppProviders><SeedQueries /></AppProviders>)

    expect(await screen.findByRole('status', { name: 'query state' })).toBeInTheDocument()
    await waitFor(() => {
      const raw = sessionStorage.getItem(POS_CATALOG_CACHE_KEY)
      expect(raw).not.toBeNull()
      expect(JSON.parse(raw!).clientState.queries).toHaveLength(1)
    })

    const persisted = JSON.parse(sessionStorage.getItem(POS_CATALOG_CACHE_KEY)!) as {
      buster: string
      clientState: { queries: Array<{ queryKey: unknown[] }> }
    }
    expect(persisted.buster).toBe(POS_CATALOG_CACHE_BUSTER)
    expect(persisted.clientState.queries.map(({ queryKey }) => queryKey)).toEqual([POS_CATALOG_QUERY_KEY])
    expect(sessionStorage.getItem(POS_CATALOG_CACHE_KEY)).not.toContain('must-not-persist')
  })

  it('restores a recent POS catalog after a browser refresh', async () => {
    render(<AppProviders><CatalogProbe queryFn={async () => [{ id: 'product-1' }]} /></AppProviders>)
    expect(await screen.findByText('product-1')).toBeInTheDocument()
    await waitFor(() => expect(sessionStorage.getItem(POS_CATALOG_CACHE_KEY)).not.toBeNull())

    cleanup()
    const refreshedQuery = vi.fn(async () => [{ id: 'network-product' }])
    render(<AppProviders><CatalogProbe queryFn={refreshedQuery} /></AppProviders>)

    expect(await screen.findByText('product-1')).toBeInTheDocument()
    expect(refreshedQuery).not.toHaveBeenCalled()
  })

  it('clears the in-memory and persisted query cache', async () => {
    function CacheControls() {
      const cache = useAppQueryCache()
      const queryClient = useQueryClient()
      const [hasData, setHasData] = useState(Boolean(queryClient.getQueryData(POS_CATALOG_QUERY_KEY)))
      return <button type="button" onClick={() => void clearAppQueryCache(cache).then(() => setHasData(Boolean(queryClient.getQueryData(POS_CATALOG_QUERY_KEY))))}>{String(hasData)}</button>
    }

    render(<AppProviders><SeedQueries /><CacheControls /></AppProviders>)
    await waitFor(() => expect(sessionStorage.getItem(POS_CATALOG_CACHE_KEY)).not.toBeNull())

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(sessionStorage.getItem(POS_CATALOG_CACHE_KEY)).toBeNull())
    expect(screen.getByRole('button')).toHaveTextContent('false')
  })
})
