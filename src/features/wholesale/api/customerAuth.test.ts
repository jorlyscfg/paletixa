import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { loginWholesaleCustomer, logoutWholesaleCustomer } from './customerAuth'

describe('wholesale customer authentication API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('sends only normalized mobile and the four-digit PIN to the dedicated login RPC', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{
      authenticated: true,
      session_token: 'session-token',
      customer_id: 'customer-1',
      customer_name: 'Tienda La Plaza',
      customer_email: null,
      failed_login_attempts: 0,
      contact_admin: false,
      expires_at: '2026-09-22T00:00:00Z',
    }], error: null })
    await expect(loginWholesaleCustomer({ requestId: 'request-1', mobile: '55 1234 5678', pin: '0042' })).resolves.toEqual({
      authenticated: true,
      sessionToken: 'session-token',
      customer: { id: 'customer-1', name: 'Tienda La Plaza', email: null },
      expiresAt: '2026-09-22T00:00:00Z',
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('wholesale_customer_login', {
      p_mobile: '+525512345678', p_pin: '0042', p_request_id: 'request-1',
    })
  })

  it('maps the third failed attempt to a contact-admin suggestion without inventing a lock', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{ authenticated: false, failed_login_attempts: 3, contact_admin: true }], error: null })
    await expect(loginWholesaleCustomer({ requestId: 'request-2', mobile: '55 1234 5678', pin: '0043' })).resolves.toEqual({
      authenticated: false, failedLoginAttempts: 3, contactAdmin: true,
    })
  })

  it('revokes a customer session through the dedicated session RPC', async () => {
    sdk.database.rpc.mockResolvedValue({ data: true, error: null })
    await expect(logoutWholesaleCustomer('session-token', 'request-3')).resolves.toBe(true)
    expect(sdk.database.rpc).toHaveBeenCalledWith('revoke_wholesale_customer_session', {
      p_session_token: 'session-token', p_request_id: 'request-3',
    })
  })
})
