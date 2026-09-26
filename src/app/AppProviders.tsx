import { useState, type ReactNode } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { AppQueryCacheContext, createAppQueryCache, POS_CATALOG_CACHE_BUSTER, POS_CATALOG_CACHE_MAX_AGE } from './queryCache'
import { ThemeProvider } from './ThemeProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  const [cache] = useState(createAppQueryCache)
  return <ThemeProvider>
    <AppQueryCacheContext.Provider value={cache}>
      <PersistQueryClientProvider
        client={cache.queryClient}
        persistOptions={{
          persister: cache.persister,
          maxAge: POS_CATALOG_CACHE_MAX_AGE,
          buster: POS_CATALOG_CACHE_BUSTER,
          dehydrateOptions: cache.dehydrateOptions,
        }}
      >
        {children}
      </PersistQueryClientProvider>
    </AppQueryCacheContext.Provider>
  </ThemeProvider>
}
