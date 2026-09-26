import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() }, functions: { invoke: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { createEmployee, EmployeeProvisioningError, listEmployees, mapEmployeeMutationError, mapEmployeeProvisioningError, setEmployeePassword, setEmployeeStatus, updateEmployee } from './employees'

const row = {
  employee_user_id: 'employee-1',
  username: 'cajero-01',
  display_name: 'Ana López',
  branch_id: 'branch-1',
  branch_name: 'Central',
  employee_status: 'active' as const,
  branch_status: 'active' as const,
}

describe('employee branch API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('lists only the server projection returned by the admin RPC', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [row], error: null })
    await expect(listEmployees()).resolves.toEqual([{ userId: 'employee-1', username: 'cajero-01', displayName: 'Ana López', branchId: 'branch-1', branchName: 'Central', status: 'active', branchStatus: 'active' }])
    expect(sdk.database.rpc).toHaveBeenCalledWith('list_employees')
  })

  it('provisions an employee through the server function rather than a privileged browser call', async () => {
    sdk.functions.invoke.mockResolvedValue({ data: { employee: row }, error: null })
    await expect(createEmployee({ username: 'cajero-01', displayName: 'Ana López', password: 'secret1', branchId: 'branch-1' })).resolves.toMatchObject({ userId: 'employee-1', branchId: 'branch-1' })
    expect(sdk.functions.invoke).toHaveBeenCalledWith('provision-employee', { body: { username: 'cajero-01', displayName: 'Ana López', password: 'secret1', branchId: 'branch-1' } })
  })

  it('maps an auth conflict to a stable typed provisioning error', async () => {
    sdk.functions.invoke.mockResolvedValue({ data: null, error: { statusCode: 409, error: 'User already exists' } })
    await expect(createEmployee({ username: 'cajero-01', displayName: 'Ana López', password: 'secret1', branchId: 'branch-1' })).rejects.toMatchObject({ code: 'EMPLOYEE_USERNAME_TAKEN', status: 409, retryable: false })
    await expect(createEmployee({ username: 'cajero-01', displayName: 'Ana López', password: 'secret1', branchId: 'branch-1' })).rejects.toBeInstanceOf(EmployeeProvisioningError)
    expect(mapEmployeeProvisioningError({ code: 'EMPLOYEE_USERNAME_TAKEN', status: 400 })).toMatchObject({ code: 'EMPLOYEE_USERNAME_TAKEN', status: 409 })
  })

  it('changes status through the protected RPC', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{ ...row, employee_status: 'suspended' }], error: null })
    await expect(setEmployeeStatus('employee-1', 'suspended')).resolves.toMatchObject({ status: 'suspended' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('set_employee_status', { p_user_id: 'employee-1', p_status: 'suspended' })
  })

  it('updates the employee projection through the protected RPC', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{ ...row, username: 'ana.nueva', display_name: 'Ana Nueva', branch_id: 'branch-2', branch_name: 'Norte' }], error: null })
    await expect(updateEmployee({ userId: 'employee-1', username: 'ana.nueva', displayName: 'Ana Nueva', branchId: 'branch-2' })).resolves.toMatchObject({ username: 'ana.nueva', displayName: 'Ana Nueva', branchId: 'branch-2' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('update_employee', { p_user_id: 'employee-1', p_username: 'ana.nueva', p_display_name: 'Ana Nueva', p_branch_id: 'branch-2' })
  })

  it('maps duplicate usernames from employee updates to a stable typed error', async () => {
    sdk.database.rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'employee_identities_username_key' } })
    await expect(updateEmployee({ userId: 'employee-1', username: 'ana.nueva', displayName: 'Ana Nueva', branchId: 'branch-1' })).rejects.toMatchObject({ code: 'EMPLOYEE_USERNAME_TAKEN', status: 409 })
    expect(mapEmployeeMutationError({ statusCode: 409, error: 'duplicate username' })).toMatchObject({ code: 'EMPLOYEE_USERNAME_TAKEN', status: 409 })
  })

  it('changes an employee password through the protected RPC', async () => {
    sdk.database.rpc.mockResolvedValue({ data: true, error: null })
    await expect(setEmployeePassword({ userId: 'employee-1', password: 'secret2' })).resolves.toBe(true)
    expect(sdk.database.rpc).toHaveBeenCalledWith('set_employee_password', { p_user_id: 'employee-1', p_password: 'secret2' })
  })
})
