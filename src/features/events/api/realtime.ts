import { insforge } from '../../../lib/insforge'

export const EVENT_RESERVATION_CHANNEL = 'events:reservations'
export type EventReservationRealtimeMessage = { reservation_id?: string; status?: string; updated_at?: string }

type RealtimeClient = {
  connect: () => Promise<void>
  subscribe: (channel: string) => Promise<{ ok?: boolean; error?: { message?: string } }>
  unsubscribe: (channel: string) => void | Promise<void>
  on: (event: string, listener: (message: EventReservationRealtimeMessage) => void) => void
  off: (event: string, listener: (message: EventReservationRealtimeMessage) => void) => void
}

const eventNames = ['reservation.created', 'reservation.changed']
const listeners = new Set<(message: EventReservationRealtimeMessage) => void>()
let activeRealtime: RealtimeClient | null = null
let connected = false
let connecting: Promise<void> | null = null

function dispatch(message: EventReservationRealtimeMessage) {
  for (const listener of listeners) listener(message)
}

async function ensureSubscription() {
  if (connected) return
  if (connecting) return connecting
  const realtime = insforge.realtime as unknown as RealtimeClient
  connecting = (async () => {
    await realtime.connect()
    const subscription = await realtime.subscribe(EVENT_RESERVATION_CHANNEL)
    if (subscription.ok === false) throw new Error(subscription.error?.message ?? 'No se pudo suscribir a las notificaciones de Eventos')
    for (const eventName of eventNames) realtime.on(eventName, dispatch)
    activeRealtime = realtime
    connected = true
    if (listeners.size === 0) {
      for (const eventName of eventNames) realtime.off(eventName, dispatch)
      void realtime.unsubscribe(EVENT_RESERVATION_CHANNEL)
      activeRealtime = null
      connected = false
    }
  })()
  try { await connecting } finally { connecting = null }
}

export async function subscribeToEventReservationEvents(onEvent: (message: EventReservationRealtimeMessage) => void) {
  listeners.add(onEvent)
  try { await ensureSubscription() } catch (error) { listeners.delete(onEvent); throw error }
  return () => {
    listeners.delete(onEvent)
    if (listeners.size > 0 || !connected || !activeRealtime) return
    for (const eventName of eventNames) activeRealtime.off(eventName, dispatch)
    void activeRealtime.unsubscribe(EVENT_RESERVATION_CHANNEL)
    activeRealtime = null
    connected = false
  }
}
