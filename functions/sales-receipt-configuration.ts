import { createAdminClient, createClient } from 'npm:@insforge/sdk'
import { hasReceiptActionCapability, type ReceiptAction } from './sales-receipt-configuration-access.ts'

const BUCKET = 'sales-receipt-logos'
const MAX_FILE_BYTES = 2 * 1024 * 1024
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class BoundaryError extends Error {
  constructor(readonly status: number, message: string, readonly code: string) {
    super(message)
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function authToken(request: Request) {
  const value = request.headers.get('Authorization') ?? ''
  return /^Bearer\s+\S+$/i.test(value) ? value.replace(/^Bearer\s+/i, '') : null
}

function requiredText(value: unknown, message: string) {
  if (typeof value !== 'string' || value.trim() === '') throw new BoundaryError(400, message, 'INVALID_INPUT')
  return value.trim()
}

function ownedKey(value: unknown) {
  const key = requiredText(value, 'Sales receipt logo key is required')
  if (key.length > 512 || !/^receipts\/[A-Za-z0-9._-]+$/.test(key) || key.includes('..')) throw new BoundaryError(403, 'Sales receipt logo key is invalid', 'LOGO_NOT_OWNED')
  return key
}

function acceptedFileType(value: unknown) {
  if (typeof value !== 'string' || !ACCEPTED_MIME_TYPES.has(value)) throw new BoundaryError(400, 'The sales receipt logo must be a JPEG, PNG, or WebP image', 'INVALID_FILE')
  return value
}

function sanitizedFileName(value: unknown) {
  const name = requiredText(value, 'Sales receipt logo file name is required')
  let sanitized = ''
  for (const character of name.slice(0, 160)) {
    const code = character.charCodeAt(0)
    sanitized += (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || character === '.' || character === '_' || character === '-'
      ? character
      : '_'
  }
  sanitized = sanitized.replace(/\.\.+/g, '.').replace(/^\.+/, '')
  if (sanitized === '' || sanitized === '.' || sanitized === '..') throw new BoundaryError(400, 'The sales receipt logo file name is invalid', 'INVALID_FILE')
  return sanitized
}

function decodedFileBytes(value: unknown) {
  if (typeof value !== 'string' || value === '' || !BASE64_PATTERN.test(value) || value.length > Math.ceil(MAX_FILE_BYTES / 3) * 4) throw new BoundaryError(400, 'The sales receipt logo data is invalid', 'INVALID_FILE')
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  const decodedLength = (value.length * 3) / 4 - padding
  if (decodedLength <= 0 || decodedLength > MAX_FILE_BYTES) throw new BoundaryError(400, 'The sales receipt logo cannot exceed 2 MB', 'INVALID_FILE')
  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw new BoundaryError(400, 'The sales receipt logo data is invalid', 'INVALID_FILE')
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) throw new BoundaryError(400, 'The sales receipt logo cannot exceed 2 MB', 'INVALID_FILE')
  return bytes
}

function acceptedFile(body: Record<string, unknown>) {
  const type = acceptedFileType(body.fileType)
  return new File([decodedFileBytes(body.fileBase64)], sanitizedFileName(body.fileName), { type })
}

async function authorizeAccess(request: Request, baseUrl: string, action: ReceiptAction) {
  const token = authToken(request)
  if (!token) throw new BoundaryError(401, 'Unauthorized', 'UNAUTHORIZED')
  const caller = createClient({ baseUrl, accessToken: token })
  const { data: user, error: userError } = await caller.auth.getCurrentUser()
  if (userError || !user?.user?.id) throw new BoundaryError(401, 'Unauthorized', 'UNAUTHORIZED')
  const { data, error } = await caller.database.rpc('get_access_context')
  if (error) throw new BoundaryError(503, 'Unable to verify sales receipt access', 'ACCESS_CHECK_FAILED')
  const context = (Array.isArray(data) ? data[0] : data) as { authorized?: unknown; capabilities?: unknown } | null
  const capabilities = Array.isArray(context?.capabilities) ? context.capabilities : []
  if (context?.authorized !== true || !hasReceiptActionCapability(action, capabilities)) throw new BoundaryError(403, 'Sales receipt access is not allowed', 'ACCESS_DENIED')
}

async function upload(admin: ReturnType<typeof createAdminClient>, file: File) {
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
  const key = `receipts/${crypto.randomUUID()}.${extension}`
  const { data, error } = await admin.storage.from(BUCKET).upload(key, file)
  if (error || !data?.key) throw new BoundaryError(503, 'Unable to store the sales receipt logo', 'STORAGE_UPLOAD_FAILED')
  const signed = await admin.storage.from(BUCKET).createSignedUrl(data.key, 3600)
  if (signed.error || !signed.data?.signedUrl) {
    await admin.storage.from(BUCKET).remove([data.key])
    throw new BoundaryError(503, 'Unable to create a private sales receipt logo URL', 'STORAGE_SIGN_FAILED')
  }
  return { url: signed.data.signedUrl, key: data.key }
}

async function sign(admin: ReturnType<typeof createAdminClient>, keyValue: unknown) {
  const key = ownedKey(keyValue)
  const { data, error } = await admin.database.from('sales_receipt_configuration').select('logo_key').eq('singleton', true).limit(1)
  if (error) throw new BoundaryError(503, 'Unable to verify the sales receipt logo reference', 'REFERENCE_CHECK_FAILED')
  const currentKey = (data?.[0] as { logo_key?: unknown } | undefined)?.logo_key
  if (currentKey !== key) throw new BoundaryError(403, 'Sales receipt logo key is not active', 'LOGO_NOT_OWNED')
  const signed = await admin.storage.from(BUCKET).createSignedUrl(key, 3600)
  if (signed.error || !signed.data?.signedUrl) throw new BoundaryError(503, 'Unable to refresh the sales receipt logo URL', 'STORAGE_SIGN_FAILED')
  return { url: signed.data.signedUrl, key }
}

async function remove(admin: ReturnType<typeof createAdminClient>, keyValue: unknown) {
  const key = ownedKey(keyValue)
  const { data, error } = await admin.database.from('sales_receipt_configuration').select('logo_key').eq('singleton', true).limit(1)
  if (error) throw new BoundaryError(503, 'Unable to verify the sales receipt logo reference', 'REFERENCE_CHECK_FAILED')
  const currentKey = (data?.[0] as { logo_key?: unknown } | undefined)?.logo_key
  if (currentKey === key) throw new BoundaryError(409, 'The active sales receipt logo cannot be removed before the configuration is updated', 'LOGO_IN_USE')
  const { data: result, error: removeError } = await admin.storage.from(BUCKET).remove([key])
  if (removeError) throw new BoundaryError(503, 'Unable to remove the sales receipt logo', 'STORAGE_REMOVE_FAILED')
  const item = result?.results?.[0]
  return { key, removed: !item || item.status === 'deleted' || item.status === 'notFound' }
}

async function requestBody(request: Request) {
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body as Record<string, unknown>
  } catch {
    throw new BoundaryError(400, 'Request body must be valid JSON', 'INVALID_BODY')
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')
  const apiKey = Deno.env.get('INSFORGE_API_KEY') ?? Deno.env.get('API_KEY')
  if (!baseUrl || !apiKey) return json({ error: 'Sales receipt storage is not configured' }, 503)
  try {
    const body = await requestBody(request)
    const action = requiredText(body.action, 'Sales receipt action is required') as ReceiptAction
    if (!['upload', 'sign', 'remove'].includes(action)) throw new BoundaryError(400, 'Sales receipt action is invalid', 'INVALID_INPUT')
    await authorizeAccess(request, baseUrl, action)
    const admin = createAdminClient({ baseUrl, apiKey })
    if (action === 'upload') return json(await upload(admin, acceptedFile(body)), 201)
    if (action === 'sign') return json(await sign(admin, body.key), 200)
    return json(await remove(admin, body.key), 200)
  } catch (error) {
    if (error instanceof BoundaryError) return json({ code: error.code, error: error.message }, error.status)
    console.error('Sales receipt configuration boundary failed')
    return json({ error: 'Unable to complete the sales receipt operation' }, 502)
  }
}
