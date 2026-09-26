import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { renameBranch } from './branches'

describe('branch API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('renames a branch through the protected RPC', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{ branch_id: 'branch-1', name: 'Sucursal Norte', result_status: 'active' }], error: null })

    await expect(renameBranch('branch-1', 'Sucursal Norte', 'request-1')).resolves.toEqual({ id: 'branch-1', name: 'Sucursal Norte', status: 'active' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('rename_branch', {
      p_branch_id: 'branch-1',
      p_name: 'Sucursal Norte',
      p_request_id: 'request-1',
    })
  })

  it('propagates rename errors from the backend', async () => {
    const error = new Error('access denied')
    sdk.database.rpc.mockResolvedValue({ data: null, error })

    await expect(renameBranch('branch-1', 'Sucursal Norte', 'request-1')).rejects.toBe(error)
  })
})
