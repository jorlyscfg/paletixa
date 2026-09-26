import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  realtime: {
    connect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))

import {
  PRODUCT_CATALOG_CHANGED_EVENT,
  PRODUCT_CATALOG_CHANNEL,
  subscribeToProductCatalogChanges,
} from './catalogRealtime'

describe('product catalog realtime subscription', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    sdk.realtime.connect.mockResolvedValue(undefined)
    sdk.realtime.subscribe.mockResolvedValue({ ok: true })
  })

  it('forwards catalog changes and cleans up idempotently', async () => {
    const listeners = new Map<string, (message: { operation?: string }) => void>()
    sdk.realtime.on.mockImplementation((event: string, listener: (message: { operation?: string }) => void) => { listeners.set(event, listener) })
    const onChange = vi.fn()

    const cleanup = await subscribeToProductCatalogChanges(onChange)

    expect(sdk.realtime.connect).toHaveBeenCalledOnce()
    expect(sdk.realtime.subscribe).toHaveBeenCalledWith(PRODUCT_CATALOG_CHANNEL)
    listeners.get(PRODUCT_CATALOG_CHANGED_EVENT)?.({ operation: 'update' })
    expect(onChange).toHaveBeenCalledWith({ operation: 'update' })

    cleanup()
    cleanup()

    expect(sdk.realtime.off).toHaveBeenCalledOnce()
    expect(sdk.realtime.off).toHaveBeenCalledWith(PRODUCT_CATALOG_CHANGED_EVENT, onChange)
    expect(sdk.realtime.unsubscribe).toHaveBeenCalledOnce()
    expect(sdk.realtime.unsubscribe).toHaveBeenCalledWith(PRODUCT_CATALOG_CHANNEL)
  })

  it('propagates connection failures without registering a listener', async () => {
    sdk.realtime.connect.mockRejectedValueOnce(new Error('connection failed'))
    const onChange = vi.fn()

    await expect(subscribeToProductCatalogChanges(onChange)).rejects.toThrow('connection failed')

    expect(sdk.realtime.subscribe).not.toHaveBeenCalled()
    expect(sdk.realtime.on).not.toHaveBeenCalled()
    expect(sdk.realtime.unsubscribe).not.toHaveBeenCalled()
  })

  it('returns a no-op cleanup for a non-ok subscription', async () => {
    sdk.realtime.subscribe.mockResolvedValueOnce({ ok: false, error: { message: 'subscription rejected' } })
    const onChange = vi.fn()

    const cleanup = await subscribeToProductCatalogChanges(onChange)
    cleanup()
    cleanup()

    expect(sdk.realtime.on).not.toHaveBeenCalled()
    expect(sdk.realtime.off).not.toHaveBeenCalled()
    expect(sdk.realtime.unsubscribe).not.toHaveBeenCalled()
  })
})
