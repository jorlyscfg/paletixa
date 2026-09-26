import { createClient } from 'npm:@insforge/sdk'

type RecordValue = Record<string, unknown>

type AuthUserRecord = {
  id: string
  email: string
}

const MAX_RESPONSE_DEPTH = 8
const MAX_RESPONSE_NODES = 64
const AUTH_ID_KEYS = ['id', 'user_id', 'userId'] as const
const AUTH_WRAPPER_KEYS = ['user', 'data', 'result', 'users'] as const

function record(value: unknown): RecordValue | null {
  return typeof value === 'object' && value !== null ? value as RecordValue : null
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function firstNonEmptyString(source: RecordValue, keys: readonly string[]) {
  for (const key of keys) {
    const value = nonEmptyString(source[key])
    if (value) return value
  }
  return null
}

function extractAuthUserId(value: unknown): string | null {
  const seen = new Set<object>()
  const nodes = { count: 0 }

  function visit(candidate: unknown, depth: number): string | null {
    if (depth > MAX_RESPONSE_DEPTH || nodes.count >= MAX_RESPONSE_NODES) return null
    nodes.count += 1

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const result = visit(item, depth + 1)
        if (result) return result
        if (nodes.count >= MAX_RESPONSE_NODES) break
      }
      return null
    }

    const source = record(candidate)
    if (!source || seen.has(source)) return null
    seen.add(source)

    for (const key of AUTH_ID_KEYS) {
      const id = nonEmptyString(source[key])
      if (id) return id
    }

    for (const key of AUTH_WRAPPER_KEYS) {
      const result = visit(source[key], depth + 1)
      if (result) return result
    }
    return null
  }

  return visit(value, 0)
}

function normalizeAuthUserLookupResponse(value: unknown): AuthUserRecord[] {
  const users: AuthUserRecord[] = []
  const seen = new Set<object>()
  const emitted = new Set<string>()
  const nodes = { count: 0 }

  function visit(candidate: unknown, depth: number) {
    if (depth > MAX_RESPONSE_DEPTH || nodes.count >= MAX_RESPONSE_NODES) return
    nodes.count += 1

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item, depth + 1)
        if (nodes.count >= MAX_RESPONSE_NODES) break
      }
      return
    }

    const source = record(candidate)
    if (!source || seen.has(source)) return
    seen.add(source)

    const id = firstNonEmptyString(source, AUTH_ID_KEYS)
    const email = nonEmptyString(source.email)
    if (id && email) {
      const key = `${id}\u0000${email}`
      if (!emitted.has(key)) {
        emitted.add(key)
        users.push({ id, email })
      }
    }

    for (const key of AUTH_WRAPPER_KEYS) visit(source[key], depth + 1)
  }

  visit(value, 0)
  return users
}

function findExactAuthUser(value: unknown, email: string): AuthUserRecord | null {
  const expectedEmail = email.trim().toLocaleLowerCase('en-US')
  const matches = normalizeAuthUserLookupResponse(value).filter((user) => user.email.toLocaleLowerCase('en-US') === expectedEmail)
  return matches.length === 1 ? matches[0] : null
}

const EMPLOYEE_AUTH_EMAIL_DOMAIN = 'employees.paletixa.internal'
const EMPLOYEE_USERNAME_MIN_LENGTH = 3
const EMPLOYEE_USERNAME_MAX_LENGTH = 32
const employeeUsernamePattern = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/

function normalizeEmployeeUsername(value: unknown) {
  if (typeof value !== 'string') throw new Error('Username is required')

  const normalized = value.trim().normalize('NFKC').toLocaleLowerCase('en-US')
  if (
    normalized.length < EMPLOYEE_USERNAME_MIN_LENGTH ||
    normalized.length > EMPLOYEE_USERNAME_MAX_LENGTH ||
    !employeeUsernamePattern.test(normalized)
  ) {
    throw new Error('Username must use 3 to 32 lowercase letters, numbers, dots, underscores, or hyphens')
  }

  return normalized
}

function employeeAuthEmail(value: unknown) {
  return `${normalizeEmployeeUsername(value)}@${EMPLOYEE_AUTH_EMAIL_DOMAIN}`
}

type EmployeePayload = {
  displayName?: unknown
  username?: unknown
  password?: unknown
  branchId?: unknown
}

type EmployeeResult = {
  employee_user_id: string
  username: string
  display_name: string
  branch_id: string
  branch_name: string
  employee_status: 'active' | 'suspended'
  branch_status: 'active' | 'suspended'
}

const EMPLOYEE_USERNAME_TAKEN = 'EMPLOYEE_USERNAME_TAKEN'
const EMPLOYEE_AUTH_CREATE_FAILED = 'EMPLOYEE_AUTH_CREATE_FAILED'
const EMPLOYEE_AUTH_LOOKUP_FAILED = 'EMPLOYEE_AUTH_LOOKUP_FAILED'
const EMPLOYEE_PROVISIONING_FAILED = 'EMPLOYEE_PROVISIONING_FAILED'
const EMPLOYEE_CLEANUP_REQUIRED = 'EMPLOYEE_CLEANUP_REQUIRED'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function requiredDisplayName(value: unknown) {
  if (typeof value !== 'string') throw new Error('Display name is required')
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized === '' || normalized.length > 120) throw new Error('Display name must contain 1 to 120 characters')
  return normalized
}

function requiredBranchId(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.trim())) throw new Error('Branch is required')
  return value.trim()
}

function authToken(request: Request) {
  const value = request.headers.get('Authorization') ?? ''
  if (!/^Bearer\s+\S+$/i.test(value)) return null
  return value.replace(/^Bearer\s+/i, '')
}

async function deleteAuthUser(baseUrl: string, apiKey: string, userId: string) {
  const response = await fetch(`${baseUrl}/api/auth/users`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds: [userId] }),
  })
  if (!response.ok) throw new Error(`Auth cleanup failed with status ${response.status}`)
}

async function findAuthUserByExactEmail(baseUrl: string, apiKey: string, email: string) {
  try {
    const endpoint = new URL('/api/auth/users', baseUrl)
    endpoint.searchParams.set('search', email)
    endpoint.searchParams.set('limit', '10')
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    })
    if (!response.ok) return null
    const body = await response.json()
    return findExactAuthUser(body, email)
  } catch {
    return null
  }
}

function isAlreadyProvisionedError(error: unknown) {
  if (typeof error !== 'object' || error === null) return false
  const source = error as { code?: unknown; message?: unknown; details?: unknown; error?: unknown }
  const nested = typeof source.error === 'object' && source.error !== null ? source.error as { code?: unknown; message?: unknown; details?: unknown } : null
  const codes = [source.code, nested?.code].filter((value): value is string => typeof value === 'string')
  const text = [source.message, source.details, source.error, nested?.message, nested?.details]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  return codes.includes('23505') || /employee_(identities|branch_assignments)_(username_key|pkey)/i.test(text) || /employee(?: auth user| username)?.*(?:already exists|already provisioned)/i.test(text)
}

function authLookupFailedResponse() {
  return json({ code: EMPLOYEE_AUTH_LOOKUP_FAILED, error: 'No se pudo confirmar el acceso del empleado' }, 502)
}

async function cleanupAuthUser(baseUrl: string, apiKey: string, userId: string) {
  try {
    await deleteAuthUser(baseUrl, apiKey, userId)
    return true
  } catch {
    console.error('Employee provisioning cleanup failed')
    return false
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')
  const apiKey = Deno.env.get('INSFORGE_API_KEY') ?? Deno.env.get('API_KEY')
  const token = authToken(request)
  if (!baseUrl || !apiKey || !token) return json({ error: 'Unauthorized' }, 401)

  const callerClient = createClient({ baseUrl, accessToken: token })
  const { data: caller, error: callerError } = await callerClient.auth.getCurrentUser()
  if (callerError || !caller?.user?.id) return json({ error: 'Unauthorized' }, 401)

  const { data: adminContext, error: contextError } = await callerClient.database.rpc('get_admin_context')
  if (contextError) return json({ error: 'Unable to verify administrator access' }, 503)
  const context = (Array.isArray(adminContext) ? adminContext[0] : adminContext) as { authorized?: boolean } | null
  if (context?.authorized !== true) return json({ error: 'Administrator access is required' }, 403)

  let payload: EmployeePayload
  try {
    payload = await request.json() as EmployeePayload
  } catch {
    return json({ error: 'Request body must be valid JSON' }, 400)
  }
  if (typeof payload !== 'object' || payload === null) return json({ error: 'Request body must be valid JSON' }, 400)

  let username: string
  let displayName: string
  let branchId: string
  if (typeof payload.password !== 'string' || payload.password.length < 6 || payload.password.length > 128) {
    return json({ error: 'Password must contain 6 to 128 characters' }, 400)
  }
  try {
    username = normalizeEmployeeUsername(payload.username)
    displayName = requiredDisplayName(payload.displayName)
    branchId = requiredBranchId(payload.branchId)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Employee data is invalid' }, 400)
  }

  const createResponse = await fetch(`${baseUrl}/api/auth/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: employeeAuthEmail(username), password: payload.password, name: displayName, autoConfirm: true }),
  })
  const createBody = await createResponse.json().catch(() => null)

  let userId: string | null = null
  let authUserCreatedByRequest = false
  if (createResponse.ok) {
    authUserCreatedByRequest = true
    userId = extractAuthUserId(createBody)
    if (!userId) {
      userId = (await findAuthUserByExactEmail(baseUrl, apiKey, employeeAuthEmail(username)))?.id ?? null
      if (!userId) return authLookupFailedResponse()
    }
  } else if (createResponse.status === 409) {
    userId = (await findAuthUserByExactEmail(baseUrl, apiKey, employeeAuthEmail(username)))?.id ?? null
    if (!userId) return authLookupFailedResponse()
  } else {
    return json({ code: EMPLOYEE_AUTH_CREATE_FAILED, error: 'No se pudo crear el acceso del empleado' }, createResponse.status >= 400 && createResponse.status < 500 ? createResponse.status : 502)
  }
  if (!userId) return authLookupFailedResponse()

  const { data: employee, error: employeeError } = await callerClient.database.rpc('create_employee', {
    p_user_id: userId,
    p_username: username,
    p_display_name: displayName,
    p_branch_id: branchId,
  })
  if (employeeError) {
    if (isAlreadyProvisionedError(employeeError)) return json({ code: EMPLOYEE_USERNAME_TAKEN, error: 'No se pudo crear el acceso del empleado' }, 409)
    if (!authUserCreatedByRequest) return json({ code: EMPLOYEE_PROVISIONING_FAILED, error: 'No se pudo completar la asignación del empleado' }, 400)
    const cleanupSucceeded = await cleanupAuthUser(baseUrl, apiKey, userId)
    if (!cleanupSucceeded) return json({ code: EMPLOYEE_CLEANUP_REQUIRED, error: 'El acceso del empleado requiere recuperación administrativa' }, 500)
    return json({ code: EMPLOYEE_PROVISIONING_FAILED, error: 'No se pudo completar la asignación del empleado' }, 400)
  }

  const result = (Array.isArray(employee) ? employee[0] : employee) as EmployeeResult | null
  if (!result) {
    if (!authUserCreatedByRequest) return json({ code: EMPLOYEE_PROVISIONING_FAILED, error: 'La asignación del empleado devolvió una respuesta incompleta' }, 502)
    const cleanupSucceeded = await cleanupAuthUser(baseUrl, apiKey, userId)
    if (!cleanupSucceeded) return json({ code: EMPLOYEE_CLEANUP_REQUIRED, error: 'El acceso del empleado requiere recuperación administrativa' }, 500)
    return json({ code: EMPLOYEE_PROVISIONING_FAILED, error: 'La asignación del empleado devolvió una respuesta incompleta' }, 502)
  }

  return json({ employee: result }, 201)
}
