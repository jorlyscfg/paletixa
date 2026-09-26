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

import { subscribeToEventReservationEvents } from './realtime'

describe('event reservation realtime subscription', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    sdk.realtime.connect.mockResolvedValue(undefined)
    sdk.realtime.subscribe.mockResolvedValue({ ok: true })
  })

  it('shares the event channel while keeping listener cleanup independent', async () => {
    const listeners = new Map<string, (message: { status?: string }) => void>()
    sdk.realtime.on.mockImplementation((event: string, listener: (message: { status?: string }) => void) => { listeners.set(event, listener) })
    const firstListener = vi.fn()
    const secondListener = vi.fn()

    const [stopFirst, stopSecond] = await Promise.all([
      subscribeToEventReservationEvents(firstListener),
      subscribeToEventReservationEvents(secondListener),
    ])

    expect(sdk.realtime.connect).toHaveBeenCalledOnce()
    expect(sdk.realtime.subscribe).toHaveBeenCalledWith('events:reservations')
    expect(sdk.realtime.subscribe).toHaveBeenCalledOnce()
    listeners.get('reservation.created')?.({ status: 'pending' })
    expect(firstListener).toHaveBeenCalledWith({ status: 'pending' })
    expect(secondListener).toHaveBeenCalledWith({ status: 'pending' })

    stopFirst()
    expect(sdk.realtime.unsubscribe).not.toHaveBeenCalled()
    stopSecond()
    expect(sdk.realtime.unsubscribe).toHaveBeenCalledOnce()
  })
})
