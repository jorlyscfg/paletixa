import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { createWholesaleCustomer, listWholesaleCustomers, regenerateWholesaleCustomerPin, setWholesaleCustomerStatus } from './customers'

const customerRow = {
  customer_id: 'customer-1',
  name: 'Tienda La Plaza',
  mobile: '+525512345678',
  email: 'owner@example.com',
  status: 'active',
  failed_login_attempts: 0,
  current_pin: '0042',
  created_at: '2026-08-23T00:00:00Z',
  updated_at: '2026-08-23T00:00:00Z',
}

describe('wholesale customer API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('creates a customer through the protected RPC and exposes a PIN only in the mutation result', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{ ...customerRow, generated_pin: '0042' }], error: null })
    await expect(createWholesaleCustomer({
      requestId: 'request-1',
      name: '  Tienda   La Plaza ',
      mobile: '+52 55 1234 5678',
      email: 'Owner@Example.com',
    })).resolves.toMatchObject({ id: 'customer-1', mobile: '+525512345678', currentPin: '0042' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('create_wholesale_customer', {
      p_request_id: 'request-1',
      p_name: 'Tienda La Plaza',
      p_mobile: '+525512345678',
      p_email: 'owner@example.com',
    })
  })

  it('maps list responses without accepting a PIN field', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{ ...customerRow }], error: null })
    const result = await listWholesaleCustomers()
    expect(result).toEqual([expect.objectContaining({ id: 'customer-1', failedLoginAttempts: 0 })])
    expect(result[0]).toHaveProperty('currentPin', '0042')
    expect(sdk.database.rpc).toHaveBeenCalledWith('list_wholesale_customers')
  })

  it('requires a reason for PIN regeneration and status changes', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{ ...customerRow, generated_pin: '9001', current_pin: '9001' }], error: null })
    await expect(regenerateWholesaleCustomerPin({ requestId: 'request-2', customerId: 'customer-1', reason: 'Customer requested recovery' })).resolves.toMatchObject({ currentPin: '9001' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('regenerate_wholesale_customer_pin', {
      p_request_id: 'request-2', p_customer_id: 'customer-1', p_reason: 'Customer requested recovery',
    })

    sdk.database.rpc.mockResolvedValue({ data: [{ ...customerRow, status: 'inactive' }], error: null })
    await expect(setWholesaleCustomerStatus({ requestId: 'request-3', customerId: 'customer-1', status: 'inactive', reason: 'Account closed' })).resolves.toMatchObject({ status: 'inactive' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('set_wholesale_customer_status', {
      p_request_id: 'request-3', p_customer_id: 'customer-1', p_status: 'inactive', p_reason: 'Account closed',
    })
    await expect(setWholesaleCustomerStatus({ requestId: 'request-4', customerId: 'customer-1', status: 'inactive', reason: '' })).rejects.toThrow('Reason is required')
  })
})
