import { createContext, useContext } from 'react'
import { QueryClient, type DehydrateOptions, type Query } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { POS_CATALOG_QUERY_KEY } from '../features/sales/api/posCatalog'

const POS_CATALOG_CACHE_VERSION = 'v1'

function normalizeInsforgeEnvironmentUrl(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return 'unconfigured'
  return value.trim().replace(/\/+$/, '')
}

export function createPosCatalogCacheIdentity(configuredInsforgeUrl: unknown) {
  const environment = encodeURIComponent(normalizeInsforgeEnvironmentUrl(configuredInsforgeUrl))
  return {
    key: `paletixa-query-cache-${POS_CATALOG_CACHE_VERSION}-${environment}`,
    buster: `pos-catalog-persistence-${POS_CATALOG_CACHE_VERSION}-${environment}`,
  }
}

const posCatalogCacheIdentity = createPosCatalogCacheIdentity(import.meta.env.VITE_INSFORGE_URL)

export const POS_CATALOG_CACHE_KEY = posCatalogCacheIdentity.key
export const POS_CATALOG_CACHE_BUSTER = posCatalogCacheIdentity.buster
export const POS_CATALOG_STALE_TIME = 45_000
export const POS_CATALOG_GC_TIME = 15 * 60_000
export const POS_CATALOG_CACHE_MAX_AGE = 10 * 60_000

export type AppQueryCache = {
  queryClient: QueryClient
  persister: ReturnType<typeof createSyncStoragePersister>
  dehydrateOptions: DehydrateOptions
}

export const AppQueryCacheContext = createContext<AppQueryCache | null>(null)

function getSessionStorage() {
  if (typeof window === 'undefined') return undefined
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}

function shouldPersistQuery(query: Query) {
  return query.queryKey.length === POS_CATALOG_QUERY_KEY.length
    && query.queryKey.every((part, index) => part === POS_CATALOG_QUERY_KEY[index])
}

const dehydrateOptions: DehydrateOptions = {
  shouldDehydrateQuery: shouldPersistQuery,
  shouldDehydrateMutation: () => false,
}

export function createAppQueryCache(): AppQueryCache {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: POS_CATALOG_STALE_TIME,
        gcTime: POS_CATALOG_GC_TIME,
        retry: 1,
        refetchOnMount: true,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchInterval: false,
      },
      mutations: { retry: 0 },
    },
  })
  const persister = createSyncStoragePersister({
    storage: getSessionStorage(),
    key: POS_CATALOG_CACHE_KEY,
    throttleTime: 0,
  })
  return { queryClient, persister, dehydrateOptions }
}

export function useAppQueryCache() {
  return useContext(AppQueryCacheContext)
}

export async function clearAppQueryCache(cache: AppQueryCache | null) {
  if (!cache) return
  cache.queryClient.clear()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await cache.persister.removeClient()
}
