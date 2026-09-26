import { insforge } from '../../../lib/insforge'
import { mapWholesaleCustomerList, mapWholesaleCustomerPin } from './mappers'
import { normalizeCustomerEmail, normalizeCustomerName, normalizeMexicoMobile, normalizeReason, normalizeRequestId } from './validators'
import type { WholesaleCustomer, WholesaleCustomerPin } from './types'

export type CreateWholesaleCustomerInput = {
  requestId: string
  name: string
  mobile: string
  email?: string | null
}

export type UpdateWholesaleCustomerInput = {
  requestId: string
  customerId: string
  name: string
  mobile: string
  email?: string | null
}

export type SetWholesaleCustomerStatusInput = {
  requestId: string
  customerId: string
  status: WholesaleCustomer['status']
  reason: string
}

export type RegenerateWholesaleCustomerPinInput = {
  requestId: string
  customerId: string
  reason: string
}

function normalizeCustomerInput(input: { requestId: string; name: string; mobile: string; email?: string | null }) {
  return {
    requestId: normalizeRequestId(input.requestId),
    name: normalizeCustomerName(input.name),
    mobile: normalizeMexicoMobile(input.mobile),
    email: normalizeCustomerEmail(input.email),
  }
}

export async function listWholesaleCustomers(): Promise<WholesaleCustomer[]> {
  const { data, error } = await insforge.database.rpc('list_wholesale_customers')
  if (error) throw error
  return mapWholesaleCustomerList(data)
}

async function readWholesaleCustomer(customerId: string): Promise<WholesaleCustomer> {
  const customer = (await listWholesaleCustomers()).find((candidate) => candidate.id === customerId)
  if (!customer) throw new Error('Customer response was empty')
  return customer
}

export async function createWholesaleCustomer(input: CreateWholesaleCustomerInput): Promise<WholesaleCustomerPin> {
  const normalized = normalizeCustomerInput(input)
  const { data, error } = await insforge.database.rpc('create_wholesale_customer', {
    p_request_id: normalized.requestId,
    p_name: normalized.name,
    p_mobile: normalized.mobile,
    p_email: normalized.email,
  })
  if (error) throw error
  return mapWholesaleCustomerPin(data)
}

export async function updateWholesaleCustomer(input: UpdateWholesaleCustomerInput): Promise<WholesaleCustomer> {
  const normalized = normalizeCustomerInput(input)
  const customerId = normalizeRequestId(input.customerId)
  const { error } = await insforge.database.rpc('update_wholesale_customer', {
    p_request_id: normalized.requestId,
    p_customer_id: customerId,
    p_name: normalized.name,
    p_mobile: normalized.mobile,
    p_email: normalized.email,
  })
  if (error) throw error
  return readWholesaleCustomer(customerId)
}

export async function setWholesaleCustomerStatus(input: SetWholesaleCustomerStatusInput): Promise<WholesaleCustomer> {
  const requestId = normalizeRequestId(input.requestId)
  const customerId = normalizeRequestId(input.customerId)
  const reason = normalizeReason(input.reason)
  if (input.status !== 'active' && input.status !== 'inactive') throw new Error('Customer status is invalid')
  const { error } = await insforge.database.rpc('set_wholesale_customer_status', {
    p_request_id: requestId,
    p_customer_id: customerId,
    p_status: input.status,
    p_reason: reason,
  })
  if (error) throw error
  return readWholesaleCustomer(customerId)
}

export async function regenerateWholesaleCustomerPin(input: RegenerateWholesaleCustomerPinInput): Promise<WholesaleCustomerPin> {
  const { data, error } = await insforge.database.rpc('regenerate_wholesale_customer_pin', {
    p_request_id: normalizeRequestId(input.requestId),
    p_customer_id: normalizeRequestId(input.customerId),
    p_reason: normalizeReason(input.reason),
  })
  if (error) throw error
  return mapWholesaleCustomerPin(data)
}

export async function deleteWholesaleCustomer(input: { requestId: string; customerId: string; reason: string }) {
  const { data, error } = await insforge.database.rpc('delete_wholesale_customer', {
    p_request_id: normalizeRequestId(input.requestId),
    p_customer_id: normalizeRequestId(input.customerId),
    p_reason: normalizeReason(input.reason),
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') throw new Error('Customer deletion response was empty')
  const result = row as { customer_id?: unknown; status?: unknown; deleted?: unknown }
  if (typeof result.customer_id !== 'string' || typeof result.status !== 'string' || typeof result.deleted !== 'boolean') throw new Error('Customer deletion response is invalid')
  return { customerId: result.customer_id, status: result.status, deleted: result.deleted }
}
