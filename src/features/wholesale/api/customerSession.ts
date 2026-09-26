import type { WholesaleCustomerSession } from './types'

const CUSTOMER_SESSION_STORAGE_KEY = 'paletixa-wholesale-customer-session-v1'

function isSession(value: unknown): value is WholesaleCustomerSession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const customer = candidate.customer
  if (!customer || typeof customer !== 'object') return false
  const customerRecord = customer as Record<string, unknown>
  return typeof candidate.sessionToken === 'string'
    && candidate.sessionToken.trim() !== ''
    && typeof candidate.expiresAt === 'string'
    && typeof customerRecord.id === 'string'
    && typeof customerRecord.name === 'string'
    && (customerRecord.email === null || typeof customerRecord.email === 'string')
}

export function loadWholesaleCustomerSession(): WholesaleCustomerSession | null {
  try {
    const raw = window.sessionStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!isSession(value) || Number.isNaN(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) {
      window.sessionStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY)
      return null
    }
    return value
  } catch {
    return null
  }
}

export function saveWholesaleCustomerSession(session: WholesaleCustomerSession) {
  window.sessionStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearWholesaleCustomerSession() {
  try {
    window.sessionStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY)
  } catch {
    // Session storage can be unavailable in privacy-restricted browsers.
  }
}

export const WHOLESALE_CUSTOMER_SESSION_KEY = CUSTOMER_SESSION_STORAGE_KEY
