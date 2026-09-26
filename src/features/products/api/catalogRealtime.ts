import { insforge } from '../../../lib/insforge'

export const PRODUCT_CATALOG_CHANNEL = 'products'
export const PRODUCT_CATALOG_CHANGED_EVENT = 'catalog_changed'

export type ProductCatalogRealtimeMessage = {
  table?: string
  operation?: string
  id?: string
  product_id?: string
  [key: string]: unknown
}

type RealtimeClient = {
  connect: () => Promise<void>
  subscribe: (channel: string) => Promise<{ ok?: boolean; error?: { message?: string } }>
  unsubscribe: (channel: string) => void | Promise<void>
  on: (event: string, listener: (message: ProductCatalogRealtimeMessage) => void) => void
  off: (event: string, listener: (message: ProductCatalogRealtimeMessage) => void) => void
}

export async function subscribeToProductCatalogChanges(onChange: (message: ProductCatalogRealtimeMessage) => void) {
  const realtime = insforge.realtime as unknown as RealtimeClient
  await realtime.connect()
  const response = await realtime.subscribe(PRODUCT_CATALOG_CHANNEL)
  if (!response.ok) return () => undefined

  realtime.on(PRODUCT_CATALOG_CHANGED_EVENT, onChange)
  let active = true
  return () => {
    if (!active) return
    active = false
    realtime.off(PRODUCT_CATALOG_CHANGED_EVENT, onChange)
    void realtime.unsubscribe(PRODUCT_CATALOG_CHANNEL)
  }
}
