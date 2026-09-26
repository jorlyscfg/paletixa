import { insforge } from '../../../lib/insforge'
import { employeeAuthEmail } from '../../../../shared/employeeIdentity'

export const LOGIN_IDENTIFIER_ERROR = 'Ingresa un correo válido o un usuario de empleado de 3 a 32 caracteres (letras, números, punto, guion o guion bajo).'
export const LOGIN_INVALID_CREDENTIALS_ERROR = 'No se pudo iniciar sesión. Verifica tu usuario o correo, contraseña y que la cuenta esté verificada.'
export const LOGIN_SERVICE_ERROR = 'No se pudo conectar con el servicio de autenticación. Inténtalo de nuevo.'
export const AUTH_SESSION_HINT_KEY = 'paletixa.auth.session-present'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AUTH_SESSION_HINT_VALUE = '1'

function hasAuthSessionHint() {
  try {
    return globalThis.localStorage?.getItem(AUTH_SESSION_HINT_KEY) === AUTH_SESSION_HINT_VALUE
  } catch {
    return false
  }
}

function setAuthSessionHint() {
  try {
    globalThis.localStorage?.setItem(AUTH_SESSION_HINT_KEY, AUTH_SESSION_HINT_VALUE)
  } catch {
    // Browser storage can be unavailable; the InsForge session remains authoritative.
  }
}

function clearAuthSessionHint() {
  try {
    globalThis.localStorage?.removeItem(AUTH_SESSION_HINT_KEY)
  } catch {
    // Browser storage can be unavailable; auth operations must still complete safely.
  }
}

export type AccessContext = {
  role: 'admin' | 'cashier'
  userId: string
  displayName: string | null
  capabilities: string[]
  branch: { id: string; name: string } | null
}

type AccessContextRow = {
  access_role?: unknown
  authorized?: unknown
  user_id?: unknown
  display_name?: unknown
  capabilities?: unknown
  branch_id?: unknown
  branch_name?: unknown
}

function currentContext(data: unknown): AccessContext | null {
  const row = (Array.isArray(data) ? data[0] : data) as AccessContextRow | null | undefined
  if (row?.authorized !== true || typeof row.user_id !== 'string') return null
  if (row.access_role !== 'admin' && row.access_role !== 'cashier') return null
  const capabilities = Array.isArray(row.capabilities) ? row.capabilities.filter((value): value is string => typeof value === 'string') : []
  const branch = typeof row.branch_id === 'string' && typeof row.branch_name === 'string'
    ? { id: row.branch_id, name: row.branch_name }
    : null
  return {
    role: row.access_role,
    userId: row.user_id,
    displayName: typeof row.display_name === 'string' && row.display_name !== '' ? row.display_name : null,
    capabilities,
    branch,
  }
}

function sessionIsUnauthorized(error: unknown) {
  const details = error as { statusCode?: number | string; status?: number | string } | null
  return details?.statusCode === 401 || details?.statusCode === '401' || details?.status === 401 || details?.status === '401'
}

export async function getAdminAccess() {
  if (!hasAuthSessionHint()) return false

  const session = await insforge.auth.getCurrentUser()
  if (session.error) {
    if (sessionIsUnauthorized(session.error)) {
      clearAuthSessionHint()
      return false
    }
    throw session.error
  }
  if (!session.data?.user) {
    clearAuthSessionHint()
    return false
  }

  const { data, error } = await insforge.database.rpc('get_admin_context')
  if (error) throw error
  const context = (Array.isArray(data) ? data[0] : data) as { authorized?: boolean } | null
  return context?.authorized === true
}

export async function getAccessContext(): Promise<AccessContext | null> {
  if (!hasAuthSessionHint()) return null

  const session = await insforge.auth.getCurrentUser()
  if (session.error) {
    if (sessionIsUnauthorized(session.error)) {
      clearAuthSessionHint()
      return null
    }
    throw session.error
  }
  if (!session.data?.user) {
    clearAuthSessionHint()
    return null
  }

  const { data, error } = await insforge.database.rpc('get_access_context')
  if (error) {
    if (sessionIsUnauthorized(error)) {
      clearAuthSessionHint()
      return null
    }
    throw error
  }
  const context = currentContext(data)
  if (!context) clearAuthSessionHint()
  return context
}

export function resolveLoginEmail(identifier: string) {
  const normalized = identifier.trim()
  if (normalized.includes('@')) return normalized.toLocaleLowerCase('en-US')
  return employeeAuthEmail(normalized)
}

export function validateLoginIdentifier(identifier: string) {
  const normalized = identifier.trim()
  if (normalized === '') return 'Ingresa tu correo electrónico o usuario.'
  if (normalized.includes('@')) return emailPattern.test(normalized) ? null : LOGIN_IDENTIFIER_ERROR

  try {
    resolveLoginEmail(normalized)
    return null
  } catch {
    return LOGIN_IDENTIFIER_ERROR
  }
}

function isInvalidEmployeeIdentifierError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return message === 'Username is required' || message.startsWith('Username must use ')
}

function isAuthRejection(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const details = error as Record<string, unknown>
  const statusCode = details.statusCode ?? details.status
  if (statusCode === 401 || statusCode === '401') return true

  const code = typeof details.error === 'string'
    ? details.error
    : typeof details.code === 'string'
      ? details.code
      : ''
  if (/^(?:ACCOUNT_(?:DISABLED|NOT_VERIFIED)|AUTH(?:ENTICATION)?_(?:ERROR|FAILED)|EMAIL_NOT_VERIFIED|INVALID_(?:LOGIN_)?CREDENTIALS|INVALID_PASSWORD|LOGIN_FAILED|UNAUTHORIZED|USER_(?:DISABLED|NOT_VERIFIED))$/i.test(code)) return true

  const message = typeof details.message === 'string' ? details.message : ''
  return /invalid (?:login )?credentials|invalid (?:email|username) or password|invalid password|unauthori[sz]ed|authentication (?:error|failed|rejected)|not verified|verification required|account (?:disabled|inactive)/i.test(message)
}

export function mapSignInError(error: unknown) {
  if (isInvalidEmployeeIdentifierError(error)) return LOGIN_IDENTIFIER_ERROR
  if (isAuthRejection(error)) return LOGIN_INVALID_CREDENTIALS_ERROR
  return LOGIN_SERVICE_ERROR
}

export async function signIn(identifier: string, password: string) {
  const { error } = await insforge.auth.signInWithPassword({ email: resolveLoginEmail(identifier), password })
  if (error) throw error
  setAuthSessionHint()
}

export async function signOut() {
  try {
    const { error } = await insforge.auth.signOut()
    if (error) throw error
  } finally {
    clearAuthSessionHint()
  }
}
