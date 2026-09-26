import { beforeEach, describe, expect, it } from 'vitest'
import { clearWholesaleCustomerSession, loadWholesaleCustomerSession, saveWholesaleCustomerSession } from './customerSession'

const session = {
  sessionToken: 'session-token',
  customer: { id: 'customer-1', name: 'Tienda La Plaza', email: null },
  expiresAt: '2099-09-22T00:00:00Z',
} as const

describe('wholesale customer browser session boundary', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('persists only the dedicated customer session and rejects expired values', () => {
    saveWholesaleCustomerSession(session)
    expect(loadWholesaleCustomerSession()).toEqual(session)

    window.sessionStorage.setItem('paletixa-wholesale-customer-session-v1', JSON.stringify({ ...session, expiresAt: '2020-01-01T00:00:00Z' }))
    expect(loadWholesaleCustomerSession()).toBeNull()
    expect(window.sessionStorage.getItem('paletixa-wholesale-customer-session-v1')).toBeNull()
  })

  it('clears the customer session without touching unrelated storage', () => {
    saveWholesaleCustomerSession(session)
    window.sessionStorage.setItem('admin-session', 'kept')
    clearWholesaleCustomerSession()
    expect(loadWholesaleCustomerSession()).toBeNull()
    expect(window.sessionStorage.getItem('admin-session')).toBe('kept')
  })
})
