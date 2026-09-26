import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  auth: { getCurrentUser: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn() },
  database: { rpc: vi.fn(), from: vi.fn() },
}))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { AUTH_SESSION_HINT_KEY, getAccessContext, getAdminAccess, LOGIN_IDENTIFIER_ERROR, LOGIN_INVALID_CREDENTIALS_ERROR, LOGIN_SERVICE_ERROR, mapSignInError, resolveLoginEmail, signIn, signOut, validateLoginIdentifier } from './adminAccess'
import { listBranches } from '../../branches/api/branches'

describe('server-authoritative admin access', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
  })

  function markSessionPresent() {
    localStorage.setItem(AUTH_SESSION_HINT_KEY, '1')
  }

  it('skips the auth refresh when no session hint exists', async () => {
    await expect(getAdminAccess()).resolves.toBe(false)
    await expect(getAccessContext()).resolves.toBeNull()
    expect(sdk.auth.getCurrentUser).not.toHaveBeenCalled()
  })

  it('ignores browser user metadata and uses get_admin_context', async () => {
    markSessionPresent()
    sdk.auth.getCurrentUser.mockResolvedValue({ data: { user: { metadata: { role: 'admin' } } }, error: null })
    sdk.database.rpc.mockResolvedValue({ data: [{ authorized: false }], error: null })
    await expect(getAdminAccess()).resolves.toBe(false)
    expect(sdk.database.rpc).toHaveBeenCalledWith('get_admin_context')
  })

  it('denies a missing or invalid session without requesting admin data', async () => {
    markSessionPresent()
    sdk.auth.getCurrentUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(getAdminAccess()).resolves.toBe(false)
    expect(localStorage.getItem(AUTH_SESSION_HINT_KEY)).toBeNull()
    markSessionPresent()
    sdk.auth.getCurrentUser.mockResolvedValue({ data: { user: null }, error: { statusCode: 401 } })
    await expect(getAdminAccess()).resolves.toBe(false)
    expect(localStorage.getItem(AUTH_SESSION_HINT_KEY)).toBeNull()
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('treats an unauthorized refresh as an unauthenticated session', async () => {
    markSessionPresent()
    sdk.auth.getCurrentUser.mockResolvedValue({ data: null, error: { statusCode: 401 } })
    await expect(getAccessContext()).resolves.toBeNull()
    expect(localStorage.getItem(AUTH_SESSION_HINT_KEY)).toBeNull()
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('returns more than 200 branches without an artificial API limit', async () => {
    const rows = Array.from({ length: 201 }, (_, id) => ({ id: String(id), name: `Branch ${id}`, status: 'active' }))
    const query = { select: vi.fn(), order: vi.fn(), limit: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.select.mockReturnValue(query)
    query.order.mockResolvedValue({ data: rows, error: null })
    await expect(listBranches()).resolves.toHaveLength(201)
    expect(sdk.database.from).toHaveBeenCalledWith('branches'); expect(query.limit).not.toHaveBeenCalled()
  })

  it('maps the server access context for a cashier without trusting user metadata', async () => {
    markSessionPresent()
    sdk.auth.getCurrentUser.mockResolvedValue({ data: { user: { id: 'employee-1', metadata: { role: 'admin' } } }, error: null })
    sdk.database.rpc.mockResolvedValue({ data: [{ access_role: 'cashier', authorized: true, user_id: 'employee-1', display_name: 'Ana López', capabilities: ['pos.use'], branch_id: 'branch-1', branch_name: 'Central' }], error: null })
    await expect(getAccessContext()).resolves.toEqual({ role: 'cashier', userId: 'employee-1', displayName: 'Ana López', capabilities: ['pos.use'], branch: { id: 'branch-1', name: 'Central' } })
    expect(sdk.database.rpc).toHaveBeenCalledWith('get_access_context')
  })

  it('treats an unauthorized access-context response as an unauthenticated session', async () => {
    markSessionPresent()
    sdk.auth.getCurrentUser.mockResolvedValue({ data: { user: { id: 'employee-1' } }, error: null })
    sdk.database.rpc.mockResolvedValue({ data: null, error: { statusCode: 401 } })

    await expect(getAccessContext()).resolves.toBeNull()
    expect(localStorage.getItem(AUTH_SESSION_HINT_KEY)).toBeNull()
  })

  it('resolves usernames to the deterministic internal auth email and leaves admin emails intact', () => {
    expect(resolveLoginEmail('  Cajero_01 ')).toBe('cajero_01@employees.paletixa.internal')
    expect(resolveLoginEmail(' Admin@Example.COM ')).toBe('admin@example.com')
  })

  it('validates emails and employee usernames with the existing identity rules', () => {
    expect(validateLoginIdentifier('')).toBe('Ingresa tu correo electrónico o usuario.')
    expect(validateLoginIdentifier('invalid@')).toBe(LOGIN_IDENTIFIER_ERROR)
    expect(validateLoginIdentifier('ab')).toBe(LOGIN_IDENTIFIER_ERROR)
    expect(validateLoginIdentifier(' Cajero_01 ')).toBeNull()
    expect(validateLoginIdentifier('admin@example.com')).toBeNull()
  })

  it('maps auth failures to safe messages without exposing backend details', () => {
    expect(mapSignInError({ statusCode: 401, message: 'https://service.invalid/token=secret' })).toBe(LOGIN_INVALID_CREDENTIALS_ERROR)
    expect(mapSignInError(new Error('Username must use 3 to 32 lowercase letters, numbers, dots, underscores, or hyphens'))).toBe(LOGIN_IDENTIFIER_ERROR)
    expect(mapSignInError(new Error('Network request failed with token=secret'))).toBe(LOGIN_SERVICE_ERROR)
  })

  it('signs in with the mapped employee email', async () => {
    sdk.auth.signInWithPassword.mockResolvedValue({ data: null, error: null })
    await signIn('cajero-01', 'secret1')
    expect(sdk.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'cajero-01@employees.paletixa.internal', password: 'secret1' })
    expect(localStorage.getItem(AUTH_SESSION_HINT_KEY)).toBe('1')
  })

  it('closes the InsForge session explicitly on sign out', async () => {
    markSessionPresent()
    sdk.auth.signOut.mockResolvedValue({ error: null })
    await expect(signOut()).resolves.toBeUndefined()
    expect(sdk.auth.signOut).toHaveBeenCalledOnce()
    expect(localStorage.getItem(AUTH_SESSION_HINT_KEY)).toBeNull()
  })
})
