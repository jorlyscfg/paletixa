import { createAdminClient, createClient } from 'npm:@insforge/sdk'

const BUCKET = 'wholesale-transfer-tickets'
const MAX_FILE_BYTES = 8 * 1024 * 1024
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_REFERENCED_KEYS = 5000
const MAX_CLEANUP_OBJECTS = 2000
const LIST_PAGE_SIZE = 100
const REMOVE_BATCH_SIZE = 50
const MAX_FILE_NAME_LENGTH = 160
const MAX_BASE64_LENGTH = Math.ceil(MAX_FILE_BYTES / 3) * 4
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

type WholesaleTransferTicketRequest =
  | { action: 'upload'; fileName: string; fileType: string; fileBase64: string }
  | { action: 'sign'; key: string }
  | { action: 'admin-sign'; orderId: string; key: string }
  | { action: 'remove'; key: string }
  | { action: 'cleanup'; keepKey?: string | null }

type EventTransferTicketRequest =
  | { action: 'event-upload' | 'event-admin-upload'; requestId: string; fileName: string; fileType: string; fileBase64: string }
  | { action: 'event-sign'; requestId: string; key: string }
  | { action: 'event-admin-sign'; reservationId: string; requestId: string; key: string }
  | { action: 'event-remove' | 'event-admin-remove'; requestId: string; key: string; keepKey?: string | null }
  | { action: 'event-cleanup' | 'event-admin-cleanup'; requestId: string; keepKey?: string | null }

type TransferTicketAction = WholesaleTransferTicketRequest['action'] | EventTransferTicketRequest['action']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Wholesale-Session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class BoundaryError extends Error {
  constructor(readonly status: number, message: string, readonly code: string) {
    super(message)
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function authToken(request: Request) {
  const value = request.headers.get('Authorization') ?? ''
  if (!/^Bearer\s+\S+$/i.test(value)) return null
  return value.replace(/^Bearer\s+/i, '')
}

function requiredText(value: unknown, message: string) {
  if (typeof value !== 'string' || value.trim() === '') throw new BoundaryError(400, message, 'INVALID_INPUT')
  return value.trim()
}

function firstString(value: unknown, depth = 0): string | null {
  if (depth > 4) return null
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (Array.isArray(value)) return firstString(value[0], depth + 1)
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  for (const key of ['customer_id', 'customerId', 'id', 'result', 'data']) {
    const result = firstString(record[key], depth + 1)
    if (result) return result
  }
  return null
}

function customerPrefix(customerId: string) {
  return `customers/${customerId}/`
}

function ownedTicketKey(customerId: string, value: unknown) {
  const key = requiredText(value, 'Transfer ticket key is required')
  const prefix = customerPrefix(customerId)
  const suffix = key.slice(prefix.length)
  if (!key.startsWith(prefix) || suffix === '' || suffix.includes('/') || suffix.includes('..') || key.length > 512) {
    throw new BoundaryError(403, 'Transfer ticket key is not owned by this customer', 'TICKET_NOT_OWNED')
  }
  return key
}

const EVENT_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function eventRequestId(value: unknown) {
  const requestId = requiredText(value, 'Event request ID is required').toLowerCase()
  if (!EVENT_REQUEST_ID_PATTERN.test(requestId)) throw new BoundaryError(400, 'Event request ID is invalid', 'INVALID_INPUT')
  return requestId
}

function eventPrefix(requestId: string) {
  return `events/${requestId}/`
}

function ownedEventTicketKey(requestId: string, value: unknown) {
  const key = requiredText(value, 'Event transfer ticket key is required')
  if (key.length > 512 || !new RegExp(`^events/${requestId}/[A-Za-z0-9._-]+$`).test(key)) {
    throw new BoundaryError(403, 'Event transfer ticket key is not owned by this request', 'TICKET_NOT_OWNED')
  }
  return key
}

function acceptedFileType(value: unknown) {
  if (typeof value !== 'string' || !ACCEPTED_MIME_TYPES.has(value)) {
    throw new BoundaryError(400, 'The transfer ticket must be a JPEG, PNG, or WebP image', 'INVALID_FILE')
  }
  return value
}

function sanitizedFileName(value: unknown) {
  if (typeof value !== 'string') throw new BoundaryError(400, 'A transfer ticket file name is required', 'INVALID_FILE')
  const normalized = value.trim()
  if (normalized === '' || normalized.length > MAX_FILE_NAME_LENGTH) {
    throw new BoundaryError(400, 'The transfer ticket file name is invalid', 'INVALID_FILE')
  }

  let sanitized = ''
  for (const character of normalized) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) continue
    if (character === '/' || character === '\\') {
      sanitized += '_'
      continue
    }
    sanitized += (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || character === '.' || character === '_' || character === '-'
      ? character
      : '_'
  }
  sanitized = sanitized
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')

  if (sanitized === '' || sanitized === '.' || sanitized === '..') {
    throw new BoundaryError(400, 'The transfer ticket file name is invalid', 'INVALID_FILE')
  }
  return sanitized
}

function decodedFileBytes(value: unknown) {
  if (typeof value !== 'string' || value === '' || value.length > MAX_BASE64_LENGTH || !BASE64_PATTERN.test(value)) {
    throw new BoundaryError(400, 'The transfer ticket file data is invalid', 'INVALID_FILE')
  }

  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  const decodedLength = (value.length * 3) / 4 - padding
  if (decodedLength <= 0 || decodedLength > MAX_FILE_BYTES) {
    throw new BoundaryError(400, 'The transfer ticket cannot exceed 8 MB', 'INVALID_FILE')
  }

  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw new BoundaryError(400, 'The transfer ticket file data is invalid', 'INVALID_FILE')
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) {
    throw new BoundaryError(400, 'The transfer ticket cannot exceed 8 MB', 'INVALID_FILE')
  }
  return bytes
}

function acceptedJsonFile(payload: Record<string, unknown>) {
  const fileType = acceptedFileType(payload.fileType)
  const fileName = sanitizedFileName(payload.fileName)
  const bytes = decodedFileBytes(payload.fileBase64)
  return new File([bytes], fileName, { type: fileType })
}

async function jsonBody(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new BoundaryError(400, 'Request body must be valid JSON', 'INVALID_BODY')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BoundaryError(400, 'Request body must be a JSON object', 'INVALID_BODY')
  }
  return body as Record<string, unknown>
}

async function resolveCustomerId(admin: ReturnType<typeof createAdminClient>, sessionToken: string) {
  const { data, error } = await admin.database.rpc('wholesale_customer_session_id', { p_session_token: sessionToken })
  if (error) throw new BoundaryError(503, 'Unable to validate the wholesale customer session', 'SESSION_VALIDATION_FAILED')
  return firstString(data)
}

async function referencedTicketKeys(admin: ReturnType<typeof createAdminClient>, customerId: string) {
  const { data, error } = await admin.database
    .from('wholesale_orders')
    .select('transfer_ticket_key')
    .eq('customer_id', customerId)
    .not('transfer_ticket_key', 'is', null)
    .limit(MAX_REFERENCED_KEYS + 1)

  if (error) throw new BoundaryError(503, 'Unable to verify persisted transfer ticket references', 'REFERENCE_CHECK_FAILED')
  const rows = data ?? []
  if (rows.length > MAX_REFERENCED_KEYS) throw new BoundaryError(503, 'Transfer ticket cleanup is temporarily bounded', 'REFERENCE_CHECK_BOUNDED')

  return new Set(
    rows
      .map((row) => (row as { transfer_ticket_key?: unknown }).transfer_ticket_key)
      .filter((key): key is string => typeof key === 'string' && key.trim() !== '')
      .map((key) => key.trim()),
  )
}

async function signTicket(admin: ReturnType<typeof createAdminClient>, customerId: string, keyValue: unknown) {
  const key = ownedTicketKey(customerId, keyValue)
  const references = await referencedTicketKeys(admin, customerId)
  if (!references.has(key)) {
    throw new BoundaryError(403, 'Transfer ticket key is not owned by this customer', 'TICKET_NOT_OWNED')
  }

  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(key, 3600)
  if (error || !data?.signedUrl) {
    throw new BoundaryError(503, 'Unable to refresh the transfer ticket URL', 'STORAGE_SIGN_FAILED')
  }
  return { url: data.signedUrl, key }
}

async function signAdminTicket(admin: ReturnType<typeof createAdminClient>, orderIdValue: unknown, keyValue: unknown) {
  const orderId = requiredText(orderIdValue, 'Wholesale order ID is required')
  const key = requiredText(keyValue, 'Transfer ticket key is required')
  const { data, error } = await admin.database
    .from('wholesale_orders')
    .select('customer_id, transfer_ticket_key')
    .eq('id', orderId)
    .limit(1)

  if (error) throw new BoundaryError(503, 'Unable to verify the persisted transfer ticket reference', 'REFERENCE_CHECK_FAILED')

  const row = data?.[0] as { customer_id?: unknown; transfer_ticket_key?: unknown } | undefined
  const customerId = typeof row?.customer_id === 'string' ? row.customer_id : ''
  const persistedKey = typeof row?.transfer_ticket_key === 'string' ? row.transfer_ticket_key : ''
  if (!customerId || !persistedKey || key !== persistedKey) {
    throw new BoundaryError(403, 'Transfer ticket key is not owned by this order', 'TICKET_NOT_OWNED')
  }

  const ownedKey = ownedTicketKey(customerId, key)
  const signed = await admin.storage.from(BUCKET).createSignedUrl(ownedKey, 3600)
  if (signed.error || !signed.data?.signedUrl) {
    throw new BoundaryError(503, 'Unable to refresh the transfer ticket URL', 'STORAGE_SIGN_FAILED')
  }
  return { url: signed.data.signedUrl, key: ownedKey }
}

async function listCustomerObjects(admin: ReturnType<typeof createAdminClient>, customerId: string) {
  const objects: Array<{ key: string }> = []
  const bucket = admin.storage.from(BUCKET)
  const prefix = customerPrefix(customerId)
  let offset = 0

  while (true) {
    const { data, error } = await bucket.list({ prefix, limit: LIST_PAGE_SIZE, offset })
    if (error) throw new BoundaryError(503, 'Unable to inspect transfer ticket storage', 'STORAGE_LIST_FAILED')

    const page = data?.objects ?? []
    const total = data?.pagination?.total ?? objects.length + page.length
    if (total > MAX_CLEANUP_OBJECTS) throw new BoundaryError(503, 'Transfer ticket cleanup is temporarily bounded', 'STORAGE_LIST_BOUNDED')
    objects.push(...page.map(({ key }) => ({ key })))

    if (page.length === 0 || objects.length >= total || page.length < LIST_PAGE_SIZE) break
    offset += page.length
  }

  return objects
}

async function removeUnreferencedObjects(admin: ReturnType<typeof createAdminClient>, customerId: string, keepKey?: string | null) {
  const objects = await listCustomerObjects(admin, customerId)
  const initiallyReferenced = await referencedTicketKeys(admin, customerId)
  const removedKeys: string[] = []
  const retainedKeys = new Set<string>()

  for (const object of objects) {
    if (object.key === keepKey || initiallyReferenced.has(object.key)) retainedKeys.add(object.key)
  }

  for (let index = 0; index < objects.length; index += REMOVE_BATCH_SIZE) {
    const batch = objects.slice(index, index + REMOVE_BATCH_SIZE)
    const freshReferences = await referencedTicketKeys(admin, customerId)
    const removableKeys = batch
      .map(({ key }) => key)
      .filter((key) => key !== keepKey && !freshReferences.has(key))

    if (removableKeys.length === 0) {
      batch.forEach(({ key }) => retainedKeys.add(key))
      continue
    }

    const { data, error } = await admin.storage.from(BUCKET).remove(removableKeys)
    if (error) throw new BoundaryError(503, 'Unable to finish safe transfer ticket cleanup', 'STORAGE_REMOVE_FAILED')
    const failed = data?.results?.filter((result) => result.status === 'failed') ?? []
    if (failed.length > 0) throw new BoundaryError(503, 'Unable to finish safe transfer ticket cleanup', 'STORAGE_REMOVE_FAILED')

    for (const key of removableKeys) {
      const result = data?.results?.find((candidate) => candidate.key === key)
      if (!result || result.status === 'deleted' || result.status === 'notFound') removedKeys.push(key)
      else retainedKeys.add(key)
    }
    batch.forEach(({ key }) => { if (!removableKeys.includes(key)) retainedKeys.add(key) })
  }

  return { removedKeys, retainedKeys: Array.from(retainedKeys) }
}

async function uploadTicket(admin: ReturnType<typeof createAdminClient>, customerId: string, file: File) {
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
  const generatedKey = `${customerPrefix(customerId)}${crypto.randomUUID()}.${extension}`
  const { data, error } = await admin.storage.from(BUCKET).upload(generatedKey, file)
  if (error || !data?.key || !data.url) throw new BoundaryError(503, 'Unable to store the transfer ticket', 'STORAGE_UPLOAD_FAILED')

  const key = ownedTicketKey(customerId, data.key)
  let url = data.url
  try {
    const signed = await admin.storage.from(BUCKET).createSignedUrl(key, 3600)
    if (!signed.error && signed.data?.signedUrl) url = signed.data.signedUrl
  } catch {
    // The storage URL remains a valid fallback for backends without signed URLs.
  }

  await removeUnreferencedObjects(admin, customerId, key)
  return { url, key }
}

async function removeTicket(admin: ReturnType<typeof createAdminClient>, customerId: string, keyValue: unknown) {
  const key = ownedTicketKey(customerId, keyValue)
  const references = await referencedTicketKeys(admin, customerId)
  const cleanup = await removeUnreferencedObjects(admin, customerId)
  return {
    key,
    removed: cleanup.removedKeys.includes(key),
    referenced: references.has(key) || cleanup.retainedKeys.includes(key),
  }
}

async function eventReferencedTicketKeys(admin: ReturnType<typeof createAdminClient>, requestId: string) {
  const { data, error } = await admin.database
    .from('event_reservations')
    .select('transfer_ticket_key, remaining_transfer_ticket_key')
    .eq('request_id', requestId)
    .limit(2)
  if (error) throw new BoundaryError(503, 'Unable to verify persisted event transfer ticket references', 'REFERENCE_CHECK_FAILED')
  const rows = data ?? []
  if (rows.length > 1) throw new BoundaryError(503, 'Event transfer ticket references are temporarily bounded', 'REFERENCE_CHECK_BOUNDED')
  return new Set(
    rows.flatMap((row) => {
      const candidate = row as { transfer_ticket_key?: unknown; remaining_transfer_ticket_key?: unknown }
      return [candidate.transfer_ticket_key, candidate.remaining_transfer_ticket_key]
    }).filter((key): key is string => typeof key === 'string' && key.trim() !== '').map((key) => key.trim()),
  )
}

async function listEventObjects(admin: ReturnType<typeof createAdminClient>, requestId: string) {
  const objects: Array<{ key: string }> = []
  const bucket = admin.storage.from(BUCKET)
  const prefix = eventPrefix(requestId)
  let offset = 0

  while (true) {
    const { data, error } = await bucket.list({ prefix, limit: LIST_PAGE_SIZE, offset })
    if (error) throw new BoundaryError(503, 'Unable to inspect event transfer ticket storage', 'STORAGE_LIST_FAILED')
    const page = data?.objects ?? []
    const total = data?.pagination?.total ?? objects.length + page.length
    if (total > MAX_CLEANUP_OBJECTS) throw new BoundaryError(503, 'Event transfer ticket cleanup is temporarily bounded', 'STORAGE_LIST_BOUNDED')
    objects.push(...page.map(({ key }) => ({ key })))
    if (page.length === 0 || objects.length >= total || page.length < LIST_PAGE_SIZE) break
    offset += page.length
  }
  return objects
}

async function removeUnreferencedEventObjects(admin: ReturnType<typeof createAdminClient>, requestId: string, keepKey?: string | null) {
  const objects = await listEventObjects(admin, requestId)
  const referencedKeys = await eventReferencedTicketKeys(admin, requestId)
  const removedKeys: string[] = []
  const retainedKeys = new Set<string>()
  for (const object of objects) {
    if (object.key === keepKey || referencedKeys.has(object.key)) retainedKeys.add(object.key)
  }

  for (let index = 0; index < objects.length; index += REMOVE_BATCH_SIZE) {
    const batch = objects.slice(index, index + REMOVE_BATCH_SIZE)
    const freshReferences = await eventReferencedTicketKeys(admin, requestId)
    const removableKeys = batch
      .map(({ key }) => key)
      .filter((key) => key !== keepKey && !freshReferences.has(key))
    if (removableKeys.length === 0) {
      batch.forEach(({ key }) => retainedKeys.add(key))
      continue
    }

    const { data, error } = await admin.storage.from(BUCKET).remove(removableKeys)
    if (error) throw new BoundaryError(503, 'Unable to finish safe event transfer ticket cleanup', 'STORAGE_REMOVE_FAILED')
    const failed = data?.results?.filter((result) => result.status === 'failed') ?? []
    if (failed.length > 0) throw new BoundaryError(503, 'Unable to finish safe event transfer ticket cleanup', 'STORAGE_REMOVE_FAILED')
    for (const key of removableKeys) {
      const result = data?.results?.find((candidate) => candidate.key === key)
      if (!result || result.status === 'deleted' || result.status === 'notFound') removedKeys.push(key)
      else retainedKeys.add(key)
    }
    batch.forEach(({ key }) => { if (!removableKeys.includes(key)) retainedKeys.add(key) })
  }
  return { removedKeys, retainedKeys: Array.from(retainedKeys) }
}

async function uploadEventTicket(admin: ReturnType<typeof createAdminClient>, requestId: string, file: File) {
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
  const generatedKey = `${eventPrefix(requestId)}${crypto.randomUUID()}.${extension}`
  const { data, error } = await admin.storage.from(BUCKET).upload(generatedKey, file)
  if (error || !data?.key) throw new BoundaryError(503, 'Unable to store the event transfer ticket', 'STORAGE_UPLOAD_FAILED')
  const key = ownedEventTicketKey(requestId, data.key)
  const signed = await admin.storage.from(BUCKET).createSignedUrl(key, 3600)
  if (signed.error || !signed.data?.signedUrl) {
    await admin.storage.from(BUCKET).remove([key])
    throw new BoundaryError(503, 'Unable to create a private event transfer ticket URL', 'STORAGE_SIGN_FAILED')
  }
  await removeUnreferencedEventObjects(admin, requestId, key)
  return { url: signed.data.signedUrl, key }
}

async function signEventTicket(admin: ReturnType<typeof createAdminClient>, requestId: string, keyValue: unknown) {
  const key = ownedEventTicketKey(requestId, keyValue)
  const signed = await admin.storage.from(BUCKET).createSignedUrl(key, 3600)
  if (signed.error || !signed.data?.signedUrl) throw new BoundaryError(503, 'Unable to refresh the event transfer ticket URL', 'STORAGE_SIGN_FAILED')
  return { url: signed.data.signedUrl, key }
}

async function signAdminEventTicket(admin: ReturnType<typeof createAdminClient>, reservationIdValue: unknown, requestId: string, keyValue: unknown) {
  const reservationId = requiredText(reservationIdValue, 'Event reservation ID is required')
  const key = ownedEventTicketKey(requestId, keyValue)
  const { data, error } = await admin.database
    .from('event_reservations')
    .select('request_id, transfer_ticket_key, remaining_transfer_ticket_key')
    .eq('id', reservationId)
    .limit(1)
  if (error) throw new BoundaryError(503, 'Unable to verify the persisted event transfer ticket reference', 'REFERENCE_CHECK_FAILED')
  const row = data?.[0] as { request_id?: unknown; transfer_ticket_key?: unknown; remaining_transfer_ticket_key?: unknown } | undefined
  if (row?.request_id !== requestId || (row?.transfer_ticket_key !== key && row?.remaining_transfer_ticket_key !== key)) {
    throw new BoundaryError(403, 'Event transfer ticket key is not owned by this reservation', 'TICKET_NOT_OWNED')
  }
  const signed = await admin.storage.from(BUCKET).createSignedUrl(key, 3600)
  if (signed.error || !signed.data?.signedUrl) throw new BoundaryError(503, 'Unable to refresh the event transfer ticket URL', 'STORAGE_SIGN_FAILED')
  return { url: signed.data.signedUrl, key }
}

async function removeEventTicket(admin: ReturnType<typeof createAdminClient>, requestId: string, keyValue: unknown, keepKeyValue?: unknown) {
  const key = ownedEventTicketKey(requestId, keyValue)
  const referencedKeys = await eventReferencedTicketKeys(admin, requestId)
  if (referencedKeys.has(key)) return { key, removed: false, referenced: true }
  const keepKey = keepKeyValue === undefined || keepKeyValue === null || keepKeyValue === '' ? null : ownedEventTicketKey(requestId, keepKeyValue)
  const cleanup = await removeUnreferencedEventObjects(admin, requestId, keepKey)
  return { key, removed: cleanup.removedKeys.includes(key), referenced: cleanup.retainedKeys.includes(key) }
}

async function authorizeEventAdmin(request: Request, baseUrl: string) {
  const token = authToken(request)
  if (!token) throw new BoundaryError(401, 'Unauthorized', 'UNAUTHORIZED')
  const callerClient = createClient({ baseUrl, accessToken: token })
  const { data: caller, error: callerError } = await callerClient.auth.getCurrentUser()
  if (callerError || !caller?.user?.id) throw new BoundaryError(401, 'Unauthorized', 'UNAUTHORIZED')
  const { data: adminContext, error: contextError } = await callerClient.database.rpc('get_admin_context')
  if (contextError) throw new BoundaryError(503, 'Unable to verify administrator access', 'ADMIN_AUTH_CHECK_FAILED')
  const context = (Array.isArray(adminContext) ? adminContext[0] : adminContext) as { authorized?: boolean } | null
  if (context?.authorized !== true) throw new BoundaryError(403, 'Administrator access is required', 'ADMIN_REQUIRED')
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')
  const apiKey = Deno.env.get('INSFORGE_API_KEY') ?? Deno.env.get('API_KEY')
  if (!baseUrl || !apiKey) return json({ error: 'Transfer ticket storage is not configured' }, 503)

  let body: Record<string, unknown>
  try {
    body = await jsonBody(request)
  } catch (error) {
    if (error instanceof BoundaryError) return json({ code: error.code, error: error.message }, error.status)
    return json({ error: 'Request body must be valid JSON' }, 400)
  }
  let action: TransferTicketAction
  try {
    action = requiredText(body.action, 'Transfer ticket action is required') as TransferTicketAction
  } catch (error) {
    if (error instanceof BoundaryError) return json({ code: error.code, error: error.message }, error.status)
    return json({ error: 'Transfer ticket action is required' }, 400)
  }

  const admin = createAdminClient({ baseUrl, apiKey })

  if (action.startsWith('event-')) {
    const adminAction = action === 'event-admin-upload' || action === 'event-admin-sign' || action === 'event-admin-remove' || action === 'event-admin-cleanup'
    try {
      if (adminAction) await authorizeEventAdmin(request, baseUrl)
      const requestId = eventRequestId(body.requestId)
      if (action === 'event-upload' || action === 'event-admin-upload') return json(await uploadEventTicket(admin, requestId, acceptedJsonFile(body)), 201)
      if (action === 'event-sign') return json(await signEventTicket(admin, requestId, body.key), 200)
      if (action === 'event-admin-sign') return json(await signAdminEventTicket(admin, body.reservationId, requestId, body.key), 200)
      if (action === 'event-remove' || action === 'event-admin-remove') return json(await removeEventTicket(admin, requestId, body.key, body.keepKey), 200)
      if (action === 'event-cleanup' || action === 'event-admin-cleanup') {
        const keepValue = body.keepKey
        const keepKey = keepValue === undefined || keepValue === null || keepValue === '' ? null : ownedEventTicketKey(requestId, keepValue)
        return json(await removeUnreferencedEventObjects(admin, requestId, keepKey), 200)
      }
      throw new BoundaryError(400, 'Transfer ticket action is invalid', 'INVALID_INPUT')
    } catch (error) {
      if (error instanceof BoundaryError) return json({ code: error.code, error: error.message }, error.status)
      console.error('Event transfer ticket boundary failed')
      return json({ error: 'Unable to complete the event transfer ticket operation' }, 502)
    }
  }

  if (action === 'admin-sign') {
    const token = authToken(request)
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const callerClient = createClient({ baseUrl, accessToken: token })
    const { data: caller, error: callerError } = await callerClient.auth.getCurrentUser()
    if (callerError || !caller?.user?.id) return json({ error: 'Unauthorized' }, 401)

    const { data: adminContext, error: contextError } = await callerClient.database.rpc('get_admin_context')
    if (contextError) return json({ error: 'Unable to verify administrator access' }, 503)
    const context = (Array.isArray(adminContext) ? adminContext[0] : adminContext) as { authorized?: boolean } | null
    if (context?.authorized !== true) return json({ error: 'Administrator access is required' }, 403)

    try {
      return json(await signAdminTicket(admin, body.orderId, body.key), 200)
    } catch (error) {
      if (error instanceof BoundaryError) return json({ code: error.code, error: error.message }, error.status)
      console.error('Wholesale transfer ticket admin boundary failed')
      return json({ error: 'Unable to complete the transfer ticket operation' }, 502)
    }
  }

  const sessionToken = request.headers.get('X-Wholesale-Session')?.trim()
  if (!sessionToken) return json({ error: 'Wholesale customer session is required' }, 401)

  try {
    const customerId = await resolveCustomerId(admin, sessionToken)
    if (!customerId) return json({ error: 'Wholesale customer session is invalid' }, 401)

    if (action === 'upload') return json(await uploadTicket(admin, customerId, acceptedJsonFile(body)), 201)
    if (action === 'sign') return json(await signTicket(admin, customerId, body.key), 200)
    if (action === 'remove') return json(await removeTicket(admin, customerId, body.key), 200)
    if (action === 'cleanup') {
      const keepValue = body.keepKey
      const keepKey = keepValue === undefined || keepValue === null || keepValue === '' ? null : ownedTicketKey(customerId, keepValue)
      return json(await removeUnreferencedObjects(admin, customerId, keepKey), 200)
    }
    throw new BoundaryError(400, 'Transfer ticket action is invalid', 'INVALID_INPUT')
  } catch (error) {
    if (error instanceof BoundaryError) return json({ code: error.code, error: error.message }, error.status)
    console.error('Wholesale transfer ticket boundary failed')
    return json({ error: 'Unable to complete the transfer ticket operation' }, 502)
  }
}
