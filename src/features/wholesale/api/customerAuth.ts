import { insforge } from '../../../lib/insforge'
import { mapWholesaleCustomerLogin } from './mappers'
import { normalizeMexicoMobile, normalizePin, normalizeRequestId } from './validators'
import type { WholesaleCustomerLoginResult } from './types'

export type WholesaleCustomerLoginInput = {
  requestId: string
  mobile: string
  pin: string
}

export async function loginWholesaleCustomer(input: WholesaleCustomerLoginInput): Promise<WholesaleCustomerLoginResult> {
  const { data, error } = await insforge.database.rpc('wholesale_customer_login', {
    p_mobile: normalizeMexicoMobile(input.mobile),
    p_pin: normalizePin(input.pin),
    p_request_id: normalizeRequestId(input.requestId),
  })
  if (error) throw error
  return mapWholesaleCustomerLogin(data)
}

export async function logoutWholesaleCustomer(sessionToken: string, requestId: string): Promise<boolean> {
  if (typeof sessionToken !== 'string' || sessionToken.trim() === '') throw new Error('Customer session token is required')
  const { data, error } = await insforge.database.rpc('revoke_wholesale_customer_session', {
    p_session_token: sessionToken,
    p_request_id: normalizeRequestId(requestId),
  })
  if (error) throw error
  return data === true || (Array.isArray(data) && data[0] === true)
}
