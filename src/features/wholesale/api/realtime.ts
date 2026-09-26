import { insforge } from '../../../lib/insforge'

export const WHOLESALE_ORDER_CHANNEL = 'wholesale:orders'
export type WholesaleOrderRealtimeMessage = { order_id?: string; customer_id?: string; status?: string; deleted?: boolean; updated_at?: string }

type RealtimeClient = {
  connect: () => Promise<void>
  subscribe: (channel: string) => Promise<{ ok?: boolean; error?: { message?: string } }>
  unsubscribe: (channel: string) => void | Promise<void>
  on: (event: string, listener: (message: WholesaleOrderRealtimeMessage) => void) => void
  off: (event: string, listener: (message: WholesaleOrderRealtimeMessage) => void) => void
}

const eventNames = ['order.created', 'order.changed']
const listeners = new Set<(message: WholesaleOrderRealtimeMessage) => void>()
let activeRealtime: RealtimeClient | null = null
let connected = false
let connecting: Promise<void> | null = null

function dispatch(message: WholesaleOrderRealtimeMessage) {
  for (const listener of listeners) listener(message)
}

async function ensureSubscription() {
  if (connected) return
  if (connecting) return connecting
  const realtime = insforge.realtime as unknown as RealtimeClient
  connecting = (async () => {
    await realtime.connect()
    const subscription = await realtime.subscribe(WHOLESALE_ORDER_CHANNEL)
    if (subscription.ok === false) throw new Error(subscription.error?.message ?? 'No se pudo suscribir a las notificaciones de Mayoristas')
    for (const eventName of eventNames) realtime.on(eventName, dispatch)
    activeRealtime = realtime
    connected = true
    if (listeners.size === 0) {
      for (const eventName of eventNames) realtime.off(eventName, dispatch)
      void realtime.unsubscribe(WHOLESALE_ORDER_CHANNEL)
      activeRealtime = null
      connected = false
    }
  })()
  try {
    await connecting
  } finally {
    connecting = null
  }
}

export async function subscribeToWholesaleOrderEvents(onEvent: (message: WholesaleOrderRealtimeMessage) => void) {
  listeners.add(onEvent)
  try {
    await ensureSubscription()
  } catch (error) {
    listeners.delete(onEvent)
    throw error
  }
  return () => {
    listeners.delete(onEvent)
    if (listeners.size > 0 || !connected || !activeRealtime) return
    for (const eventName of eventNames) activeRealtime.off(eventName, dispatch)
    void activeRealtime.unsubscribe(WHOLESALE_ORDER_CHANNEL)
    activeRealtime = null
    connected = false
  }
}
