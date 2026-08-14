import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  auth: { getCurrentUser: vi.fn(), signInWithPassword: vi.fn() },
  database: { rpc: vi.fn(), from: vi.fn() },
}))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { getAdminAccess } from './adminAccess'
import { listBranches } from '../../branches/api/branches'

describe('server-authoritative admin access', () => {
  beforeEach(() => vi.resetAllMocks())

  it('ignores browser user metadata and uses get_admin_context', async () => {
    sdk.auth.getCurrentUser.mockResolvedValue({ data: { user: { metadata: { role: 'admin' } } }, error: null })
    sdk.database.rpc.mockResolvedValue({ data: [{ authorized: false }], error: null })
    await expect(getAdminAccess()).resolves.toBe(false)
    expect(sdk.database.rpc).toHaveBeenCalledWith('get_admin_context')
  })

  it('denies a missing or invalid session without requesting admin data', async () => {
    sdk.auth.getCurrentUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(getAdminAccess()).resolves.toBe(false)
    sdk.auth.getCurrentUser.mockResolvedValue({ data: { user: null }, error: { statusCode: 401 } })
    await expect(getAdminAccess()).resolves.toBe(false)
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('returns more than 200 branches without an artificial API limit', async () => {
    const rows = Array.from({ length: 201 }, (_, id) => ({ id: String(id), name: `Branch ${id}`, status: 'active' }))
    const query = { select: vi.fn(), order: vi.fn(), limit: vi.fn() }
    sdk.database.from.mockReturnValue(query); query.select.mockReturnValue(query)
    query.order.mockResolvedValue({ data: rows, error: null })
    await expect(listBranches()).resolves.toHaveLength(201)
    expect(query.limit).not.toHaveBeenCalled()
  })
})
