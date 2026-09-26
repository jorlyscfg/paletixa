import { insforge } from '../../../lib/insforge'
import { mapWholesaleOrder, mapWholesaleOrderList, mapWholesaleOrderMutation } from './mappers'
import { normalizeReason, normalizeRequestId, normalizeTransferTicket, normalizeWholesaleCompletion, normalizeWholesaleOrderItems, normalizeWholesaleOrderState, normalizeWholesalePaymentMethod } from './validators'
import type { WholesaleCompletionInput, WholesaleOrder, WholesaleOrderItemInput, WholesaleOrderState, WholesalePaymentMethod, WholesaleTransferTicket } from './types'

export type CreateWholesaleCustomerOrderInput = {
  requestId: string
  items: WholesaleOrderItemInput[]
  paymentMethod: WholesalePaymentMethod
  transferTicket?: WholesaleTransferTicket | null
}

export type CreateWholesaleAdminOrderInput = CreateWholesaleCustomerOrderInput & {
  customerId: string
  initialStatus: WholesaleOrderState
  completion?: WholesaleCompletionInput
  reason?: string
}

export type ReorderWholesaleCustomerOrderInput = CreateWholesaleCustomerOrderInput & {
  orderId: string
}

export type UpdateWholesaleCustomerOrderInput = CreateWholesaleCustomerOrderInput & {
  orderId: string
}

export type UpdateWholesaleAdminOrderInput = CreateWholesaleCustomerOrderInput & {
  orderId: string
  customerId: string
  reason: string
}

function session(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Customer session token is required')
  return value
}

function orderPayload(input: CreateWholesaleCustomerOrderInput) {
  const paymentMethod = normalizeWholesalePaymentMethod(input.paymentMethod)
  const ticket = normalizeTransferTicket(paymentMethod, input.transferTicket)
  return {
    requestId: normalizeRequestId(input.requestId),
    items: normalizeWholesaleOrderItems(input.items),
    paymentMethod,
    transferTicketUrl: ticket?.url ?? null,
    transferTicketKey: ticket?.key ?? null,
  }
}

function completionPayload(input: WholesaleCompletionInput | undefined, status: WholesaleOrderState) {
  if (status === 'completed') {
    if (!input) throw new Error('Completion data is required for completed orders')
    return normalizeWholesaleCompletion(input)
  }
  if (input) throw new Error('Completion data is only valid for completed orders')
  return null
}

export async function createWholesaleCustomerOrder(sessionToken: string, input: CreateWholesaleCustomerOrderInput): Promise<WholesaleOrder> {
  const normalized = orderPayload(input)
  const { data, error } = await insforge.database.rpc('create_wholesale_customer_order', {
    p_session_token: session(sessionToken),
    p_request_id: normalized.requestId,
    p_items: normalized.items,
    p_payment_method: normalized.paymentMethod,
    p_transfer_ticket_url: normalized.transferTicketUrl,
    p_transfer_ticket_key: normalized.transferTicketKey,
  })
  if (error) throw error
  return mapWholesaleOrder(data)
}

export async function reorderWholesaleCustomerOrder(sessionToken: string, input: ReorderWholesaleCustomerOrderInput): Promise<WholesaleOrder> {
  const normalized = orderPayload(input)
  const { data, error } = await insforge.database.rpc('reorder_wholesale_customer_order', {
    p_session_token: session(sessionToken),
    p_request_id: normalized.requestId,
    p_order_id: normalizeRequestId(input.orderId),
    p_items: normalized.items,
    p_payment_method: normalized.paymentMethod,
    p_transfer_ticket_url: normalized.transferTicketUrl,
    p_transfer_ticket_key: normalized.transferTicketKey,
  })
  if (error) throw error
  return mapWholesaleOrder(data)
}

export async function updateWholesaleCustomerOrder(sessionToken: string, input: UpdateWholesaleCustomerOrderInput): Promise<WholesaleOrder> {
  const normalized = orderPayload(input)
  const { data, error } = await insforge.database.rpc('update_wholesale_customer_order', {
    p_session_token: session(sessionToken),
    p_request_id: normalized.requestId,
    p_order_id: normalizeRequestId(input.orderId),
    p_items: normalized.items,
    p_payment_method: normalized.paymentMethod,
    p_transfer_ticket_url: normalized.transferTicketUrl,
    p_transfer_ticket_key: normalized.transferTicketKey,
  })
  if (error) throw error
  return mapWholesaleOrder(data)
}

export async function listWholesaleCustomerOrders(sessionToken: string): Promise<WholesaleOrder[]> {
  const { data, error } = await insforge.database.rpc('list_wholesale_customer_orders', { p_session_token: session(sessionToken) })
  if (error) throw error
  return mapWholesaleOrderList(data)
}

export async function cancelWholesaleCustomerOrder(sessionToken: string, input: { requestId: string; orderId: string; reason: string }): Promise<WholesaleOrder> {
  const { data, error } = await insforge.database.rpc('cancel_wholesale_customer_order', {
    p_session_token: session(sessionToken),
    p_request_id: normalizeRequestId(input.requestId),
    p_order_id: normalizeRequestId(input.orderId),
    p_reason: normalizeReason(input.reason),
  })
  if (error) throw error
  return mapWholesaleOrder(data)
}

export async function deleteWholesaleCustomerOrder(sessionToken: string, input: { requestId: string; orderId: string; reason: string }): Promise<WholesaleOrder> {
  const { data, error } = await insforge.database.rpc('delete_wholesale_customer_order', {
    p_session_token: session(sessionToken),
    p_request_id: normalizeRequestId(input.requestId),
    p_order_id: normalizeRequestId(input.orderId),
    p_reason: normalizeReason(input.reason),
  })
  if (error) throw error
  return mapWholesaleOrder(data)
}

export async function createWholesaleAdminOrder(input: CreateWholesaleAdminOrderInput): Promise<WholesaleOrder> {
  const normalized = orderPayload(input)
  const initialStatus = normalizeWholesaleOrderState(input.initialStatus)
  const completion = completionPayload(input.completion, initialStatus)
  const reason = initialStatus === 'cancelled' || initialStatus === 'completed' ? normalizeReason(input.reason) : null
  const { data, error } = await insforge.database.rpc('create_wholesale_admin_order', {
    p_request_id: normalized.requestId,
    p_customer_id: normalizeRequestId(input.customerId),
    p_items: normalized.items,
    p_payment_method: normalized.paymentMethod,
    p_transfer_ticket_url: normalized.transferTicketUrl,
    p_transfer_ticket_key: normalized.transferTicketKey,
    p_initial_status: initialStatus,
    p_completion: completion,
    p_reason: reason,
  })
  if (error) throw error
  return mapWholesaleOrder(data)
}

export async function listWholesaleOrders(includeDeleted = false): Promise<WholesaleOrder[]> {
  const { data, error } = await insforge.database.rpc('list_wholesale_orders', { p_include_deleted: includeDeleted })
  if (error) throw error
  return mapWholesaleOrderList(data)
}

export async function setWholesaleOrderStatus(input: { requestId: string; orderId: string; status: WholesaleOrderState; reason: string; completion?: WholesaleCompletionInput }): Promise<WholesaleOrder> {
  const status = normalizeWholesaleOrderState(input.status)
  if (status === 'completed') {
    if (!input.completion) throw new Error('Completed orders require completion data')
    return completeWholesaleOrder({ requestId: input.requestId, orderId: input.orderId, completion: input.completion, reason: input.reason })
  }
  if (input.completion) throw new Error('Completion data is only valid for completed orders')
  const { data, error } = await insforge.database.rpc('set_wholesale_order_status', {
    p_request_id: normalizeRequestId(input.requestId),
    p_order_id: normalizeRequestId(input.orderId),
    p_status: status,
    p_reason: normalizeReason(input.reason),
  })
  if (error) throw error
  return mapWholesaleOrder(data)
}

export async function completeWholesaleOrder(input: { requestId: string; orderId: string; completion: WholesaleCompletionInput; reason: string }): Promise<WholesaleOrder> {
  const { data, error } = await insforge.database.rpc('complete_wholesale_order', {
    p_request_id: normalizeRequestId(input.requestId),
    p_order_id: normalizeRequestId(input.orderId),
    p_completion: normalizeWholesaleCompletion(input.completion),
    p_reason: normalizeReason(input.reason),
  })
  if (error) throw error
  return mapWholesaleOrder(data)
}

export async function markWholesaleOrderSeen(input: { requestId: string; orderId: string }): Promise<WholesaleOrder> {
  const { data, error } = await insforge.database.rpc('mark_wholesale_order_seen', {
    p_request_id: normalizeRequestId(input.requestId),
    p_order_id: normalizeRequestId(input.orderId),
  })
  if (error) throw error
  return mapWholesaleOrder(data)
}

export async function updateWholesaleAdminOrder(input: UpdateWholesaleAdminOrderInput): Promise<WholesaleOrder> {
  const normalized = orderPayload(input)
  const { data, error } = await insforge.database.rpc('update_wholesale_admin_order', {
    p_request_id: normalized.requestId,
    p_order_id: normalizeRequestId(input.orderId),
    p_customer_id: normalizeRequestId(input.customerId),
    p_items: normalized.items,
    p_payment_method: normalized.paymentMethod,
    p_transfer_ticket_url: normalized.transferTicketUrl,
    p_transfer_ticket_key: normalized.transferTicketKey,
    p_reason: normalizeReason(input.reason),
  })
  if (error) throw error
  return mapWholesaleOrder(data)
}

export async function deleteWholesaleOrder(input: { requestId: string; orderId: string; reason: string }) {
  const { data, error } = await insforge.database.rpc('delete_wholesale_order', {
    p_request_id: normalizeRequestId(input.requestId),
    p_order_id: normalizeRequestId(input.orderId),
    p_reason: normalizeReason(input.reason),
  })
  if (error) throw error
  return mapWholesaleOrderMutation(data)
}
